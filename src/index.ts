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

// ---- Logging (stderr so it doesn't interfere with MCP stdio) ----
function log(msg: string) {
  process.stderr.write(`[tellfigma] ${msg}\n`);
}

// ---- CDP Connection ----

async function ensureConnected(): Promise<CDP.Client> {
  if (cdpClient) {
    try {
      // Test if connection is still alive
      await cdpClient.Runtime.evaluate({ expression: '1+1' });
      return cdpClient;
    } catch {
      cdpClient = null;
    }
  }

  const tab = await findFigmaTab(chromePort);
  if (!tab) {
    throw new Error(
      'No Figma tab found. Please open a Figma design file in Chrome, then try again.'
    );
  }

  log(`Connecting to Figma tab: ${tab.title}`);
  cdpClient = await CDP({
    port: chromePort,
    target: tab.webSocketDebuggerUrl,
  });

  await cdpClient.Runtime.enable();
  await cdpClient.Page.enable();

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
    return `Error: ${errorText}`;
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
  version: '0.1.0',
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
