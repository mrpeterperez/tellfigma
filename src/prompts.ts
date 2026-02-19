// ============================================================
// MCP Prompts & Resources
// System prompt resource + design prompts
// ============================================================

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SYSTEM_PROMPT } from './prompt.js';

export function registerPrompts(server: McpServer) {
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
            text: DESIGN_FROM_PROJECT_PROMPT,
          },
        },
      ],
    })
  );
}

// ---- Design From Project Prompt ----

const DESIGN_FROM_PROJECT_PROMPT = `## Design From Project — Code-Aware Figma Design

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

This way the Figma design IS the spec — it matches the code perfectly.`;
