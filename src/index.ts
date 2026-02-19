// ============================================================
// tellfigma — MCP Server
// Exposes Figma control tools via Model Context Protocol
// Works with Claude Desktop, Claude Code, VS Code, Cursor, etc.
// ============================================================

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import CDP from 'chrome-remote-interface';
import { launchChrome, findFigmaTab } from './chrome.js';
import { SYSTEM_PROMPT } from './prompt.js';

// ---- State ----
let cdpClient: CDP.Client | null = null;
let chromePort: number = 9222;
let lastTabUrl: string | null = null;

// ---- Logging (stderr so it doesn't interfere with MCP stdio) ----
function log(msg: string) {
  process.stderr.write(`[tellfigma] ${msg}\n`);
}

// ---- CDP Connection (auto-reconnect) ----

async function ensureConnected(): Promise<CDP.Client> {
  if (cdpClient) {
    try {
      // Test if connection is still alive
      await cdpClient.Runtime.evaluate({ expression: '1+1' });
      return cdpClient;
    } catch {
      log('Connection lost, reconnecting...');
      try { cdpClient.close(); } catch {}
      cdpClient = null;
    }
  }

  // Retry logic — Figma tab may take a moment after page load
  let tab = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    tab = await findFigmaTab(chromePort);
    if (tab) break;
    if (attempt < 2) {
      log(`Waiting for Figma tab... (attempt ${attempt + 1}/3)`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  if (!tab) {
    throw new Error(
      'No Figma tab found. Please open a Figma design file in Chrome, then try again.'
    );
  }

  log(`Connecting to Figma tab: ${tab.title}`);
  lastTabUrl = tab.url;
  cdpClient = await CDP({
    port: chromePort,
    target: tab.webSocketDebuggerUrl,
  });

  await cdpClient.Runtime.enable();
  await cdpClient.Page.enable();

  // Auto-reconnect on disconnect
  cdpClient.on('disconnect', () => {
    log('CDP disconnected — will reconnect on next tool call');
    cdpClient = null;
  });

  return cdpClient;
}

// ---- Tool Implementations ----

async function executeFigmaCode(code: string): Promise<string> {
  const client = await ensureConnected();

  // Wrap in async IIFE if not already wrapped
  let wrappedCode = code;
  if (!code.trim().startsWith('(async')) {
    wrappedCode = `(async () => {\n${code}\n})()`;
  }

  const result = await client.Runtime.evaluate({
    expression: wrappedCode,
    awaitPromise: true,
    returnByValue: true,
    timeout: 30000,
  });

  if (result.exceptionDetails) {
    const error = result.exceptionDetails;
    const errorText =
      error.exception?.description ||
      error.exception?.value ||
      error.text ||
      'Unknown error';

    // Add helpful hints for common errors
    let hint = '';
    if (errorText.includes('loadFontAsync')) {
      hint = '\n\nHint: You must call await figma.loadFontAsync({ family, style }) before setting characters on a text node.';
    } else if (errorText.includes('Cannot read properties of null')) {
      hint = '\n\nHint: A node was null. Use figma.currentPage.findOne() carefully — it returns null if nothing matches.';
    } else if (errorText.includes('not a function')) {
      hint = '\n\nHint: Check that you\'re calling the right method. E.g., figma.createFrame() not figma.createAutoLayout().';
    } else if (errorText.includes('layoutSizingHorizontal') || errorText.includes('layoutSizingVertical')) {
      hint = '\n\nHint: layoutSizingHorizontal/Vertical must be set AFTER the node is appended to a parent with layoutMode.';
    }

    return `Error: ${errorText}${hint}`;
  }

  if (result.result.type === 'undefined') {
    return 'Code executed successfully (no return value).';
  }

  const value = result.result.value;
  if (typeof value === 'object') {
    return JSON.stringify(value, null, 2);
  }
  return String(value ?? 'null');
}

async function takeScreenshot(): Promise<{
  base64: string;
  width: number;
  height: number;
}> {
  const client = await ensureConnected();

  const { data } = await client.Page.captureScreenshot({
    format: 'png',
    quality: 80,
  });

  // Get viewport size
  const { result } = await client.Runtime.evaluate({
    expression: `JSON.stringify({ width: window.innerWidth, height: window.innerHeight })`,
    returnByValue: true,
  });

  const dims = JSON.parse(result.value as string);

  return {
    base64: data,
    width: dims.width,
    height: dims.height,
  };
}

async function getPageInfo(): Promise<string> {
  const client = await ensureConnected();

  const { result } = await client.Runtime.evaluate({
    expression: `JSON.stringify({
      url: window.location.href,
      title: document.title,
      hasFigma: typeof figma !== 'undefined',
      pageInfo: typeof figma !== 'undefined' ? {
        pageName: figma.currentPage.name,
        childCount: figma.currentPage.children.length,
        selection: figma.currentPage.selection.map(n => ({
          id: n.id, name: n.name, type: n.type
        })),
        topLevelNodes: figma.currentPage.children.slice(0, 20).map(n => ({
          id: n.id, name: n.name, type: n.type,
          width: 'width' in n ? Math.round(n.width) : null,
          height: 'height' in n ? Math.round(n.height) : null,
        }))
      } : null
    })`,
    awaitPromise: true,
    returnByValue: true,
  });

  return JSON.stringify(JSON.parse(result.value as string), null, 2);
}

// ---- MCP Server Setup ----

const server = new McpServer({
  name: 'tellfigma',
  version: '0.2.0',
});

// -- Resource: System Prompt --
server.resource(
  'figma-system-prompt',
  'tellfigma://prompt',
  async (uri) => ({
    contents: [
      {
        uri: uri.href,
        mimeType: 'text/plain',
        text: SYSTEM_PROMPT,
      },
    ],
  })
);

// -- Prompt: Figma Design Instructions --
server.prompt(
  'figma-design',
  'Instructions for designing in Figma. Attach this to your conversation for best results.',
  () => ({
    messages: [
      {
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: SYSTEM_PROMPT,
        },
      },
    ],
  })
);

// -- Prompt: Design From Project --
server.prompt(
  'design-from-project',
  'Design Figma screens that match your existing codebase. The AI reads your project files first to extract colors, fonts, spacing, and component patterns.',
  () => ({
    messages: [
      {
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: `## Design From Project — Code-Aware Figma Design

You have access to both the user's project files (through the editor) AND Figma (through tellfigma). Use both together.

### Before Creating Anything in Figma

Read the user's project files to extract their design system. Look for these files (in order of priority):

**Tailwind / CSS Config:**
- \`tailwind.config.ts\` or \`tailwind.config.js\` — colors, spacing, fonts, borderRadius, screens
- \`src/index.css\` or \`src/globals.css\` or \`app/globals.css\` — CSS variables, @theme, @layer base
- \`postcss.config.js\` — plugins that affect styling

**Theme / Design Tokens:**
- \`src/lib/theme.ts\` or \`src/theme/*\` — custom theme definitions
- \`src/styles/*\` — shared style files
- \`tokens.json\` or \`*.tokens.json\` — design token files
- \`.storybook/preview.ts\` — global decorators, theme config

**Component Patterns:**
- \`src/components/ui/*\` — UI primitives (buttons, inputs, cards)
- \`src/components/layouts/*\` — layout components (sidebar, header, page wrapper)
- \`package.json\` — check for UI libraries (shadcn, radix, chakra, mantine, mui, antd)

**Framework-Specific:**
- \`next.config.*\` — Next.js (check for fonts config)
- \`nuxt.config.*\` — Nuxt
- \`vite.config.*\` — Vite setup
- \`app/layout.tsx\` or \`src/app.tsx\` — root layout, font imports, providers

### What to Extract

From these files, build a mental model of:
1. **Color palette** — primary, secondary, destructive, muted, accent colors (exact hex/HSL values)
2. **Typography** — font families, size scale, weight scale, line heights
3. **Spacing** — base unit, spacing scale
4. **Border radius** — radius scale values
5. **Shadows** — elevation/shadow definitions
6. **Breakpoints** — responsive widths
7. **Component patterns** — how buttons, cards, inputs, modals are structured (padding, gaps, border patterns)

### Then Design in Figma

Use the exact values from the project. Don't use tellfigma's default design system — use THEIRS. Match:
- Their exact hex colors (not generic Tailwind colors unless that's what they use)
- Their font family (not Inter, unless that's what they use)
- Their spacing scale
- Their border radius values
- Their shadow definitions
- Their component structure

### Example Workflow

1. User: "Design a settings page for my app"
2. You: Read tailwind.config.ts → extract colors, fonts, radius
3. You: Read src/components/ui/button.tsx → understand button patterns
4. You: Read src/components/layouts/sidebar.tsx → understand layout
5. You: Create Figma design using THEIR exact design tokens
6. You: Screenshot and verify it looks consistent with their codebase

This way the Figma design IS the spec — it matches the code perfectly.`,
        },
      },
    ],
  })
);

// -- Tool: Execute Figma Code --
server.tool(
  'execute_figma_code',
  `Execute JavaScript code in the Figma browser tab. The \`figma\` global object gives full access to the Figma Plugin API.

Key APIs:
- figma.createFrame(), figma.createText(), figma.createRectangle(), figma.createComponent()
- figma.currentPage.selection, figma.currentPage.findAll(), figma.currentPage.findOne()
- figma.viewport.scrollAndZoomIntoView([node])
- figma.loadFontAsync({ family, style }) — MUST call before setting text
- node.fills, node.strokes, node.effects, node.cornerRadius
- node.layoutMode, node.itemSpacing, node.paddingTop/Right/Bottom/Left
- child.layoutSizingHorizontal = 'FILL' — MUST set AFTER appendChild()

Always wrap async code: (async () => { ... })()
RGB values are 0-1, not 0-255.
Always use blendMode: 'NORMAL' on DROP_SHADOW effects.
Font "Semi Bold" has a space (not "SemiBold") for Inter.`,
  {
    code: z
      .string()
      .describe(
        'JavaScript code to execute in the Figma browser context. The `figma` global is available.'
      ),
  },
  async ({ code }) => {
    const result = await executeFigmaCode(code);
    return {
      content: [{ type: 'text', text: result }],
    };
  }
);

// -- Tool: Take Screenshot --
server.tool(
  'take_screenshot',
  'Capture a screenshot of the current Figma browser tab. Use this after making visual changes to verify your work. Returns the screenshot as an image.',
  {},
  async () => {
    const { base64, width, height } = await takeScreenshot();
    return {
      content: [
        {
          type: 'image',
          data: base64,
          mimeType: 'image/png',
        },
        {
          type: 'text',
          text: `Screenshot captured (${width}x${height}px)`,
        },
      ],
    };
  }
);

// -- Tool: Get Page Context --
server.tool(
  'get_page_context',
  'Get information about the current Figma page — selected nodes, top-level frames, page name, and whether the figma global is available.',
  {},
  async () => {
    const info = await getPageInfo();
    return {
      content: [{ type: 'text', text: info }],
    };
  }
);

// -- Tool: Navigate --
server.tool(
  'navigate',
  'Navigate the Chrome browser to a URL. Useful for opening a specific Figma file.',
  {
    url: z.string().url().describe('The URL to navigate to'),
  },
  async ({ url }) => {
    const client = await ensureConnected();
    await client.Page.navigate({ url });
    await new Promise((r) => setTimeout(r, 2000)); // Wait for page load
    return {
      content: [{ type: 'text', text: `Navigated to ${url}` }],
    };
  }
);

// -- Tool: Click --
server.tool(
  'click',
  'Click at a specific position on the page. Use with caution — prefer execute_figma_code for most operations.',
  {
    x: z.number().describe('X coordinate to click'),
    y: z.number().describe('Y coordinate to click'),
  },
  async ({ x, y }) => {
    const client = await ensureConnected();
    await client.Input.dispatchMouseEvent({ type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await client.Input.dispatchMouseEvent({ type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    return {
      content: [{ type: 'text', text: `Clicked at (${x}, ${y})` }],
    };
  }
);

// -- Tool: Get Snapshot (DOM/Accessibility) --
server.tool(
  'get_snapshot',
  'Get the accessibility tree / DOM snapshot of the current page. Useful for understanding UI structure and finding elements to click.',
  {},
  async () => {
    const client = await ensureConnected();
    const { nodes } = await client.Accessibility.getFullAXTree();

    // Simplify the tree — keep name, role, and children structure
    const simplified = nodes.slice(0, 200).map((n: any) => ({
      role: n.role?.value,
      name: n.name?.value,
      description: n.description?.value,
    })).filter((n: any) => n.name || n.role);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(simplified, null, 2),
        },
      ],
    };
  }
);

// -- Tool: Undo --
server.tool(
  'undo',
  'Undo the last action in Figma. Use this to roll back mistakes. Can be called multiple times to undo multiple steps.',
  {
    steps: z.number().optional().default(1).describe('Number of undo steps (default: 1)'),
  },
  async ({ steps }) => {
    const count = Math.min(steps, 50); // Safety limit
    const code = `
      for (let i = 0; i < ${count}; i++) {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', code: 'KeyZ', metaKey: true, bubbles: true }));
      }
      "Undid ${count} step(s)"
    `;
    // Use the triggerUndo method if available, otherwise use keyboard shortcut
    const result = await executeFigmaCode(`
      try {
        // Try the direct API approach
        for (let i = 0; i < ${count}; i++) {
          figma.undo();
        }
        "Undid ${count} step(s)"
      } catch(e) {
        "Undo may not be available via API: " + e.message
      }
    `);
    return { content: [{ type: 'text', text: result }] };
  }
);

// -- Tool: Redo --
server.tool(
  'redo',
  'Redo the last undone action in Figma.',
  {
    steps: z.number().optional().default(1).describe('Number of redo steps (default: 1)'),
  },
  async ({ steps }) => {
    const count = Math.min(steps, 50);
    const result = await executeFigmaCode(`
      try {
        for (let i = 0; i < ${count}; i++) {
          figma.redo();
        }
        "Redid ${count} step(s)"
      } catch(e) {
        "Redo may not be available via API: " + e.message
      }
    `);
    return { content: [{ type: 'text', text: result }] };
  }
);

// -- Tool: Select Nodes --
server.tool(
  'select_nodes',
  'Find and select nodes in the current Figma page by name or type. Returns info about matched nodes and selects them on the canvas.',
  {
    query: z.string().optional().describe('Search by node name (case-insensitive substring match)'),
    type: z.string().optional().describe('Filter by node type: FRAME, TEXT, RECTANGLE, COMPONENT, INSTANCE, GROUP, ELLIPSE, etc.'),
    select: z.boolean().optional().default(true).describe('Whether to select the matched nodes on the canvas (default: true)'),
  },
  async ({ query, type, select }) => {
    const conditions: string[] = [];
    if (query) conditions.push(`n.name.toLowerCase().includes(${JSON.stringify(query.toLowerCase())})`);
    if (type) conditions.push(`n.type === ${JSON.stringify(type.toUpperCase())}`);
    if (conditions.length === 0) conditions.push('true');

    const filter = conditions.join(' && ');
    const result = await executeFigmaCode(`
      const matches = figma.currentPage.findAll(n => ${filter});
      ${select ? 'figma.currentPage.selection = matches;' : ''}
      ${select ? 'if (matches.length > 0) figma.viewport.scrollAndZoomIntoView(matches);' : ''}
      JSON.stringify({
        count: matches.length,
        nodes: matches.slice(0, 50).map(n => ({
          id: n.id, name: n.name, type: n.type,
          width: 'width' in n ? Math.round(n.width) : null,
          height: 'height' in n ? Math.round(n.height) : null,
          x: 'x' in n ? Math.round(n.x) : null,
          y: 'y' in n ? Math.round(n.y) : null,
        }))
      })
    `);
    return { content: [{ type: 'text', text: result }] };
  }
);

// -- Tool: List Components --
server.tool(
  'list_components',
  'List all components and component sets on the current page, or search by name. Useful for finding reusable design elements.',
  {
    query: z.string().optional().describe('Optional name filter (case-insensitive substring match)'),
  },
  async ({ query }) => {
    const filter = query
      ? `n => (n.type === 'COMPONENT' || n.type === 'COMPONENT_SET') && n.name.toLowerCase().includes(${JSON.stringify(query.toLowerCase())})`
      : `n => n.type === 'COMPONENT' || n.type === 'COMPONENT_SET'`;

    const result = await executeFigmaCode(`
      const components = figma.currentPage.findAll(${filter});
      JSON.stringify({
        count: components.length,
        components: components.slice(0, 100).map(c => ({
          id: c.id,
          name: c.name,
          type: c.type,
          width: Math.round(c.width),
          height: Math.round(c.height),
          description: 'description' in c ? c.description : '',
          variantProperties: c.type === 'COMPONENT_SET' && 'variantGroupProperties' in c
            ? Object.keys(c.variantGroupProperties) : [],
        }))
      })
    `);
    return { content: [{ type: 'text', text: result }] };
  }
);

// -- Tool: Export Node --
server.tool(
  'export_node',
  'Export a Figma node (frame, component, etc.) as PNG or SVG. Returns the image data. If no nodeId is given, exports the current selection.',
  {
    nodeId: z.string().optional().describe('The node ID to export (e.g., "123:456"). If omitted, exports the first selected node.'),
    format: z.enum(['PNG', 'SVG', 'JPG', 'PDF']).optional().default('PNG').describe('Export format (default: PNG)'),
    scale: z.number().optional().default(2).describe('Export scale for raster formats (default: 2x)'),
  },
  async ({ nodeId, format, scale }) => {
    const result = await executeFigmaCode(`
      let node;
      if (${nodeId ? `true` : 'false'}) {
        node = figma.getNodeById(${JSON.stringify(nodeId || '')});
      } else {
        node = figma.currentPage.selection[0];
      }
      if (!node) throw new Error('No node found. Select a node or provide a nodeId.');
      if (!('exportAsync' in node)) throw new Error('This node type cannot be exported.');

      const bytes = await node.exportAsync({
        format: ${JSON.stringify(format)},
        ${format === 'PNG' || format === 'JPG' ? `constraint: { type: 'SCALE', value: ${scale} },` : ''}
      });
      const base64 = figma.base64Encode(bytes);
      JSON.stringify({ name: node.name, format: ${JSON.stringify(format)}, base64, byteLength: bytes.length });
    `);

    try {
      const parsed = JSON.parse(result);
      if (parsed.base64) {
        const mimeType = format === 'SVG' ? 'image/svg+xml'
          : format === 'PDF' ? 'application/pdf'
          : format === 'JPG' ? 'image/jpeg'
          : 'image/png';
        return {
          content: [
            { type: 'image' as const, data: parsed.base64, mimeType },
            { type: 'text' as const, text: `Exported "${parsed.name}" as ${format} (${parsed.byteLength} bytes)` },
          ],
        };
      }
    } catch {}

    return { content: [{ type: 'text', text: result }] };
  }
);

// -- Tool: Read Selection (Deep Inspect) --
server.tool(
  'read_selection',
  'Deep inspection of the currently selected nodes. Returns fills, strokes, effects, fonts, layout properties, constraints, and more. Much richer than get_page_context.',
  {},
  async () => {
    const result = await executeFigmaCode(`
      const sel = figma.currentPage.selection;
      if (sel.length === 0) return JSON.stringify({ error: 'Nothing selected. Select a node first.' });

      function inspectNode(n, depth) {
        if (depth > 3) return { id: n.id, name: n.name, type: n.type, note: '(depth limit)' };
        const info = {
          id: n.id, name: n.name, type: n.type,
          x: 'x' in n ? Math.round(n.x) : undefined,
          y: 'y' in n ? Math.round(n.y) : undefined,
          width: 'width' in n ? Math.round(n.width) : undefined,
          height: 'height' in n ? Math.round(n.height) : undefined,
        };

        // Fills
        if ('fills' in n && n.fills !== figma.mixed && Array.isArray(n.fills)) {
          info.fills = n.fills.map(f => f.type === 'SOLID' ? {
            type: 'SOLID',
            hex: '#' + [f.color.r, f.color.g, f.color.b].map(c => Math.round(c*255).toString(16).padStart(2,'0')).join(''),
            opacity: f.opacity !== undefined ? f.opacity : 1,
          } : { type: f.type });
        }

        // Strokes
        if ('strokes' in n && Array.isArray(n.strokes) && n.strokes.length > 0) {
          info.strokes = n.strokes.map(s => s.type === 'SOLID' ? {
            type: 'SOLID',
            hex: '#' + [s.color.r, s.color.g, s.color.b].map(c => Math.round(c*255).toString(16).padStart(2,'0')).join(''),
          } : { type: s.type });
          info.strokeWeight = n.strokeWeight;
          info.strokeAlign = n.strokeAlign;
        }

        // Effects
        if ('effects' in n && Array.isArray(n.effects) && n.effects.length > 0) {
          info.effects = n.effects.map(e => ({
            type: e.type, visible: e.visible,
            radius: e.radius,
            offset: e.offset,
            spread: e.spread,
          }));
        }

        // Corner radius
        if ('cornerRadius' in n) {
          info.cornerRadius = n.cornerRadius !== figma.mixed ? n.cornerRadius : {
            topLeft: n.topLeftRadius, topRight: n.topRightRadius,
            bottomLeft: n.bottomLeftRadius, bottomRight: n.bottomRightRadius,
          };
        }

        // Layout
        if ('layoutMode' in n && n.layoutMode !== 'NONE') {
          info.layout = {
            mode: n.layoutMode,
            primaryAxisSizing: n.primaryAxisSizingMode,
            counterAxisSizing: n.counterAxisSizingMode,
            primaryAxisAlign: n.primaryAxisAlignItems,
            counterAxisAlign: n.counterAxisAlignItems,
            padding: { top: n.paddingTop, right: n.paddingRight, bottom: n.paddingBottom, left: n.paddingLeft },
            itemSpacing: n.itemSpacing,
          };
        }

        // Layout child properties
        if ('layoutSizingHorizontal' in n) {
          info.layoutSizing = { horizontal: n.layoutSizingHorizontal, vertical: n.layoutSizingVertical };
        }

        // Text properties
        if (n.type === 'TEXT') {
          info.text = {
            characters: n.characters.slice(0, 200),
            fontSize: n.fontSize !== figma.mixed ? n.fontSize : 'mixed',
            fontName: n.fontName !== figma.mixed ? n.fontName : 'mixed',
            textAlignH: n.textAlignHorizontal,
            textAlignV: n.textAlignVertical,
            textAutoResize: n.textAutoResize,
            lineHeight: n.lineHeight !== figma.mixed ? n.lineHeight : 'mixed',
          };
        }

        // Opacity
        if ('opacity' in n && n.opacity !== 1) info.opacity = n.opacity;

        // Children (limited depth)
        if ('children' in n && n.children.length > 0) {
          info.childCount = n.children.length;
          info.children = n.children.slice(0, 20).map(c => inspectNode(c, depth + 1));
        }

        return info;
      }

      JSON.stringify(sel.map(n => inspectNode(n, 0)), null, 2);
    `);
    return { content: [{ type: 'text', text: result }] };
  }
);

// -- Tool: Get Variables (Design Tokens) --
server.tool(
  'get_variables',
  'List Figma variables (design tokens) in the current file — colors, numbers, strings, booleans. Includes collection and mode information.',
  {
    collectionName: z.string().optional().describe('Filter by collection name (case-insensitive substring match)'),
  },
  async ({ collectionName }) => {
    const result = await executeFigmaCode(`
      const collections = await figma.variables.getLocalVariableCollectionsAsync();
      const variables = await figma.variables.getLocalVariablesAsync();

      const filtered = ${collectionName ? `collections.filter(c => c.name.toLowerCase().includes(${JSON.stringify(collectionName!.toLowerCase())}))` : 'collections'};
      const collectionIds = new Set(filtered.map(c => c.id));

      const output = filtered.map(col => ({
        id: col.id,
        name: col.name,
        modes: col.modes.map(m => ({ id: m.modeId, name: m.name })),
        variables: variables
          .filter(v => v.variableCollectionId === col.id)
          .slice(0, 100)
          .map(v => {
            const firstModeId = col.modes[0]?.modeId;
            const value = firstModeId ? v.valuesByMode[firstModeId] : undefined;
            let resolvedValue = value;
            if (value && typeof value === 'object' && 'r' in value) {
              resolvedValue = {
                r: Math.round(value.r * 255),
                g: Math.round(value.g * 255),
                b: Math.round(value.b * 255),
                a: value.a !== undefined ? value.a : 1,
                hex: '#' + [value.r, value.g, value.b].map(c => Math.round(c*255).toString(16).padStart(2,'0')).join(''),
              };
            }
            return {
              id: v.id,
              name: v.name,
              type: v.resolvedType,
              value: resolvedValue,
            };
          })
      }));
      JSON.stringify(output, null, 2);
    `);
    return { content: [{ type: 'text', text: result }] };
  }
);

// -- Tool: Duplicate Node --
server.tool(
  'duplicate_node',
  'Duplicate/clone a Figma node. If no nodeId is given, duplicates the first selected node. Returns the new node info.',
  {
    nodeId: z.string().optional().describe('The node ID to duplicate. Omit to duplicate the first selected node.'),
    offsetX: z.number().optional().default(20).describe('Horizontal offset for the clone (default: 20px)'),
    offsetY: z.number().optional().default(20).describe('Vertical offset for the clone (default: 20px)'),
    count: z.number().optional().default(1).describe('Number of duplicates to create (default: 1)'),
  },
  async ({ nodeId, offsetX, offsetY, count }) => {
    const cloneCount = Math.min(count, 50); // Safety limit
    const result = await executeFigmaCode(`
      let node;
      if (${nodeId ? 'true' : 'false'}) {
        node = figma.getNodeById(${JSON.stringify(nodeId || '')});
      } else {
        node = figma.currentPage.selection[0];
      }
      if (!node) throw new Error('No node found. Select a node or provide a nodeId.');
      if (!('clone' in node)) throw new Error('This node type cannot be cloned.');

      const clones = [];
      for (let i = 0; i < ${cloneCount}; i++) {
        const clone = node.clone();
        if ('x' in clone && 'x' in node) {
          clone.x = node.x + ${offsetX} * (i + 1);
          clone.y = node.y + ${offsetY} * (i + 1);
        }
        clones.push({ id: clone.id, name: clone.name, type: clone.type });
      }
      figma.currentPage.selection = clones.map(c => figma.getNodeById(c.id)).filter(Boolean);
      figma.viewport.scrollAndZoomIntoView(figma.currentPage.selection);
      JSON.stringify({ duplicated: node.name, clones });
    `);
    return { content: [{ type: 'text', text: result }] };
  }
);

// -- Tool: Get Styles --
server.tool(
  'get_styles',
  'List all local styles (colors, text styles, effects, grids) in the current file. Useful for understanding the design system.',
  {},
  async () => {
    const result = await executeFigmaCode(`
      const paintStyles = figma.getLocalPaintStyles().map(s => ({
        id: s.id, name: s.name, type: 'PAINT',
        paints: s.paints.map(p => p.type === 'SOLID' ? { type: 'SOLID', r: Math.round(p.color.r*255), g: Math.round(p.color.g*255), b: Math.round(p.color.b*255), a: p.opacity } : { type: p.type })
      }));
      const textStyles = figma.getLocalTextStyles().map(s => ({
        id: s.id, name: s.name, type: 'TEXT',
        fontFamily: s.fontName.family, fontStyle: s.fontName.style, fontSize: s.fontSize,
        lineHeight: s.lineHeight, letterSpacing: s.letterSpacing,
      }));
      const effectStyles = figma.getLocalEffectStyles().map(s => ({
        id: s.id, name: s.name, type: 'EFFECT',
        effects: s.effects.map(e => ({ type: e.type, visible: e.visible }))
      }));
      JSON.stringify({ paintStyles, textStyles, effectStyles, total: paintStyles.length + textStyles.length + effectStyles.length });
    `);
    return { content: [{ type: 'text', text: result }] };
  }
);

// -- Tool: Zoom to Selection --
server.tool(
  'zoom_to',
  'Zoom the viewport to fit specific nodes, the current selection, or the entire page.',
  {
    target: z.enum(['selection', 'all', 'nodeId']).optional().default('selection').describe('What to zoom to'),
    nodeId: z.string().optional().describe('Node ID to zoom to (when target is "nodeId")'),
  },
  async ({ target, nodeId }) => {
    let code = '';
    if (target === 'selection') {
      code = `
        const sel = figma.currentPage.selection;
        if (sel.length === 0) return "Nothing selected";
        figma.viewport.scrollAndZoomIntoView(sel);
        "Zoomed to " + sel.length + " selected node(s)";
      `;
    } else if (target === 'all') {
      code = `
        figma.viewport.scrollAndZoomIntoView(figma.currentPage.children);
        "Zoomed to fit all " + figma.currentPage.children.length + " top-level nodes";
      `;
    } else {
      code = `
        const node = figma.getNodeById(${JSON.stringify(nodeId || '')});
        if (!node) return "Node not found: ${nodeId}";
        figma.viewport.scrollAndZoomIntoView([node]);
        "Zoomed to " + node.name;
      `;
    }
    const result = await executeFigmaCode(code);
    return { content: [{ type: 'text', text: result }] };
  }
);

// ---- Start ----

export async function startServer(port: number = 9222) {
  chromePort = port;

  // Launch or connect to Chrome
  await launchChrome(port);

  // Start MCP server on stdio
  const transport = new StdioServerTransport();
  await server.connect(transport);

  log('MCP server running on stdio');
  log('Ready for connections from Claude Desktop, Claude Code, VS Code, Cursor, etc.');
}
