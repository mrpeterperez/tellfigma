# tellfigma

[![npm version](https://img.shields.io/npm/v/tellfigma.svg)](https://www.npmjs.com/package/tellfigma)
[![npm downloads](https://img.shields.io/npm/dm/tellfigma.svg)](https://www.npmjs.com/package/tellfigma)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org)

<!-- 🎬 Add a demo GIF here — this is the #1 thing that makes repos go viral on GitHub/Twitter/Reddit -->
<!-- ![tellfigma demo](https://tellfigma.com/demo.gif) -->

**MCP server that gives AI full control over Figma. Create and edit designs from natural language.**

> Figma's MCP reads designs. **tellfigma writes them.**

One command. No Figma API key. No plugin. Works with Claude Desktop, Claude Code, VS Code Copilot, Cursor, Windsurf — any MCP client.

```bash
npx tellfigma
```

---

## Why tellfigma?

Every other Figma AI tool is **read-only** or **sandboxed**. tellfigma is the only MCP server that uses **Chrome DevTools Protocol** to give AI full read/write access to Figma's Plugin API — the same API that Figma plugins use, but without the sandbox.

```
┌─────────────────┐      MCP (stdio)       ┌──────────┐   Chrome DevTools   ┌──────────┐
│  Claude Desktop  │ ◄────────────────────► │ tellfigma │ ◄────────────────► │  Chrome   │
│  Claude Code     │                        │  (local)  │   Protocol (CDP)   │ + Figma   │
│  VS Code Copilot │                        └──────────┘                     └──────────┘
│  Cursor / etc.   │
└─────────────────┘
```

### The AI + Figma Loop

```
① tellfigma              AI  ──────►  Figma       "Design a dashboard"
② Figma MCP Server       Figma ──────►  Code       "Build this design"
③ Claude Code to Figma   Code  ──────►  Figma      "Capture this UI"
```

tellfigma is **step ①** — the missing piece that lets AI create and modify Figma designs from scratch.

---

## Quick Start

### 1. Run tellfigma

```bash
npx tellfigma
```

A Chrome window opens. Sign into Figma and open a design file.

### 2. Add to your AI app

<details>
<summary><strong>Claude Desktop</strong></summary>

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "tellfigma": {
      "command": "npx",
      "args": ["-y", "tellfigma"]
    }
  }
}
```

Restart Claude Desktop.
</details>

<details>
<summary><strong>Claude Code</strong></summary>

```bash
claude mcp add tellfigma -- npx -y tellfigma
```
</details>

<details>
<summary><strong>VS Code (GitHub Copilot)</strong></summary>

Add to `.vscode/mcp.json`:

```json
{
  "servers": {
    "tellfigma": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "tellfigma"]
    }
  }
}
```
</details>

<details>
<summary><strong>Cursor</strong></summary>

Add to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "tellfigma": {
      "command": "npx",
      "args": ["-y", "tellfigma"]
    }
  }
}
```
</details>

<details>
<summary><strong>Windsurf</strong></summary>

Add to `~/.windsurf/mcp.json`:

```json
{
  "mcpServers": {
    "tellfigma": {
      "command": "npx",
      "args": ["-y", "tellfigma"]
    }
  }
}
```
</details>

### 3. Start designing

Tell your AI what to create:

> "Design a modern login page with email and password fields, a sign-in button, and a 'Forgot password?' link"

> "Take a screenshot and give me feedback on the spacing and hierarchy"

> "Find all text nodes on this page and make them use Inter Semi Bold"

> "Create a card component with a subtle shadow, 16px padding, and 12px border radius"

---

## Features

### 16 MCP Tools

| Tool | What it does |
|------|-------------|
| `execute_figma_code` | Run any JavaScript with full `figma` Plugin API access |
| `take_screenshot` | Capture what's on screen — the AI sees your canvas |
| `read_selection` | Deep inspect fills, strokes, effects, layout, fonts, children |
| `get_page_context` | Page name, selection, top-level frames |
| `select_nodes` | Find and select by name or type (FRAME, TEXT, COMPONENT, etc.) |
| `list_components` | List all components and component sets |
| `get_styles` | List local paint, text, and effect styles |
| `get_variables` | List design tokens — colors, numbers, strings |
| `export_node` | Export as PNG, SVG, JPG, or PDF |
| `duplicate_node` | Clone with offset and count for grids |
| `undo` / `redo` | Roll back or redo with configurable steps |
| `zoom_to` | Zoom to selection, all nodes, or a specific node |
| `navigate` | Open a URL (e.g., a specific Figma file) |
| `click` | Click at coordinates on the page |
| `get_snapshot` | Accessibility tree for understanding UI structure |

### Built-in Design Intelligence

The AI receives a comprehensive system prompt with:

- **Figma Plugin API reference** — every method, property, and pattern
- **Design recipes** — buttons, cards, inputs, navbars the AI can compose
- **Design system defaults** — 8px spacing scale, color palette, type scale, shadows
- **Smart error recovery** — hints for common Figma API mistakes (fonts, layout ordering, null nodes)
- **Auto-reconnect** — drops CDP? Picks back up on the next tool call

### Design From Your Codebase

Using VS Code, Cursor, or Claude Code? The AI already has your project files. Ask it to design screens that match your actual codebase:

> "Design a settings page that matches my app's design system"

It reads your `tailwind.config.ts`, `globals.css`, component files — then creates Figma designs using your exact colors, fonts, spacing, and patterns. Works with **Tailwind**, **shadcn/ui**, **MUI**, **Chakra**, and any component library.

```
┌──────────┐     reads     ┌───────────┐    designs    ┌────────┐
│ Your Code │ ────────────► │  AI Agent  │ ────────────► │ Figma  │
│ (editor)  │  tailwind,   │ (Copilot/  │  your exact  │ canvas │
│           │  components  │  Claude)   │  tokens      │        │
└──────────┘              └───────────┘               └────────┘
```

---

## How It Works

1. `npx tellfigma` launches Chrome with `--remote-debugging-port=9222` and a dedicated profile (`~/.tellfigma-chrome-profile`)
2. The MCP server starts on stdio
3. When an AI calls `execute_figma_code`, tellfigma connects via CDP, finds the Figma tab, and runs JavaScript through `Runtime.evaluate`
4. Screenshots use `Page.captureScreenshot` — real browser screenshots, not API renders
5. The AI receives a system prompt with the full Figma Plugin API reference

Chrome runs with its own profile so it doesn't interfere with your normal browsing.

---

## Compared to Alternatives

| | tellfigma | Figma MCP (Dev Mode) | Claude Code to Figma | Plugin + WebSocket |
|---|---|---|---|---|
| **Creates designs** | ✅ | ❌ Read-only | ❌ Captures existing UI | ✅ |
| **Edits designs** | ✅ | ❌ | ❌ One-time import | ✅ |
| **Real screenshots** | ✅ | ✅ | N/A | ❌ |
| **Any MCP client** | ✅ | ✅ | ❌ Claude only | ❌ |
| **No API key** | ✅ | ❌ Token required | ❌ OAuth required | ✅ |
| **No plugin install** | ✅ | ❌ | ❌ | ❌ |
| **Full Plugin API** | ✅ | ❌ | ❌ | Partial |
| **Setup** | `npx tellfigma` | Config + token | Server + OAuth | Plugin + WS + MCP |

---

## Options

```
npx tellfigma [options]

  --port <number>   Chrome debug port (default: 9222)
  --help, -h        Show help
```

## Requirements

- **Node.js 18+**
- **Google Chrome** (or Chromium)
- Any MCP-compatible AI app

## Troubleshooting

**"No Figma tab found"** — Open a Figma design file in the Chrome window that tellfigma launched. Make sure the URL contains `figma.com/design` or `figma.com/file`.

**"Chrome debug port didn't become available"** — Another process may be using port 9222. Try `npx tellfigma --port 9333` or close other Chrome debug instances.

**"Connection lost, reconnecting..."** — This is normal. tellfigma auto-reconnects on the next tool call. If it persists, reload the Figma tab.

**Font errors** — Always call `await figma.loadFontAsync({ family, style })` before setting `.characters` on a text node. Inter "Semi Bold" has a space (not "SemiBold").

**Code executed but nothing appeared** — Make sure you're calling `figma.currentPage.appendChild(node)` after creating frames/shapes. New nodes aren't visible until appended.

---

## Contributing

PRs welcome. Please open an issue first for major changes.

## License

MIT — [Directive Labs](https://directivelabs.com)

---

<p align="center">
  <a href="https://tellfigma.com">tellfigma.com</a> · <a href="https://directivelabs.com">Directive Labs</a> · <a href="https://github.com/mrpeterperez/tellfigma">GitHub</a>
</p>
