# tellfigma

**The missing piece: AI that designs directly in Figma. One command.**

Figma's MCP server reads designs for code generation. [Claude Code to Figma](https://www.figma.com/blog/introducing-claude-code-to-figma/) captures running code as Figma layers. **tellfigma closes the loop** — your AI creates and edits designs directly on the Figma canvas.

tellfigma is an [MCP server](https://modelcontextprotocol.io) that gives your AI full control over Figma — create designs from scratch, modify layouts, inspect elements, and take screenshots — all through natural conversation.

No Figma API key. No plugin to install. No complex setup. Just `npx tellfigma`.

### The Full AI + Figma Loop

```
① tellfigma              AI  ──────►  Figma       "Design a dashboard"
② Figma MCP Server       Figma ──────►  Code        "Build this design"
③ Claude Code to Figma   Code  ──────►  Figma       "Capture this UI"
```

## How It Works

```
┌─────────────────┐       MCP (stdio)       ┌──────────┐    Chrome DevTools    ┌──────────┐
│  Claude Desktop  │ ◄──────────────────────► │ tellfigma │ ◄─────────────────► │  Chrome   │
│  Claude Code     │                          │  (local)  │    Protocol (CDP)   │  + Figma  │
│  VS Code Copilot │                          └──────────┘                      └──────────┘
│  Cursor / etc.   │
└─────────────────┘
```

tellfigma launches a Chrome instance with the DevTools Protocol enabled, connects to it, and exposes Figma's full Plugin API as MCP tools. Your AI app talks to tellfigma over stdio — no API keys, no cloud, everything runs locally.

This is fundamentally different from other Figma MCP servers:
- **No Figma REST API** — direct browser access means full read/write capability
- **No plugin sandbox** — execute any JavaScript directly in the Figma context
- **Real screenshots** — the AI actually sees what you see
- **One piece** — no plugin + WebSocket + server combo to manage

## Quick Start

### 1. Install & Launch

```bash
npx tellfigma
```

This opens a Chrome window. Log into Figma and open a design file.

### 2. Connect Your AI App

Pick your AI app and add the MCP config:

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

Add to `.vscode/mcp.json` in your workspace:

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

### 3. Start Designing

Open your AI app and try:

> "Create a modern login page with email and password fields, a sign-in button, and a 'Forgot password?' link"

> "Add a drop shadow to the selected frame and round the corners to 12px"

> "Find all text nodes on this page and list their font sizes"

> "Take a screenshot and tell me what you think of the design"

## Tools

tellfigma exposes 6 MCP tools:

| Tool | Description |
|------|-------------|
| `execute_figma_code` | Run JavaScript in the Figma browser tab with full access to the `figma` global (Plugin API) |
| `take_screenshot` | Capture a screenshot of the current Figma view — the AI can see and reason about the design |
| `get_page_context` | Get the current page name, selected nodes, and top-level frames |
| `navigate` | Navigate Chrome to a URL (e.g., open a specific Figma file) |
| `click` | Click at specific coordinates on the page |
| `get_snapshot` | Get the accessibility tree of the page for understanding UI structure |

The AI also receives a comprehensive system prompt with the full Figma Plugin API reference, common mistakes to avoid, and workflow best practices.

## Why Chrome DevTools?

Every other Figma AI tool uses one of two approaches:

1. **Figma REST API** (read-only) — can fetch design data but can't create or modify anything
2. **Figma Plugin sandbox** — limited JavaScript, no direct DOM access, no real vision, need to manage a plugin + WebSocket bridge + MCP server

tellfigma uses a third approach: **Chrome DevTools Protocol**. This gives us:

- **Full Plugin API** — `figma.createFrame()`, `figma.currentPage.selection`, everything
- **Real browser vision** — screenshots of exactly what the user sees
- **No sandbox limits** — execute any JavaScript, access the full browser environment
- **Zero setup** — no plugin to install, no API keys, no WebSocket bridges
- **One process** — `npx tellfigma` and you're done

## Options

```
npx tellfigma [options]

Options:
  --port <number>   Chrome debug port (default: 9222)
  --help, -h        Show help
```

## Requirements

- **Node.js 18+**
- **Google Chrome** (or Chromium)
- Any MCP-compatible AI app (Claude Desktop, Claude Code, VS Code, Cursor, Windsurf, etc.)

## How It Works (Technical)

1. `npx tellfigma` launches Chrome with `--remote-debugging-port=9222` and a dedicated user profile (`~/.tellfigma-chrome-profile`)
2. The MCP server starts on stdio and waits for tool calls
3. When an AI app calls `execute_figma_code`, tellfigma connects to Chrome via CDP, finds the active Figma tab, and runs the code via `Runtime.evaluate`
4. Screenshots use `Page.captureScreenshot` — real browser screenshots, not API renders
5. The AI receives a system prompt with the full Figma Plugin API reference

Chrome runs with its own profile directory so it won't interfere with your normal browsing.

## Compared to Alternatives

| Feature | tellfigma | Figma MCP Server | Claude Code to Figma | Plugin + WebSocket tools |
|---------|-----------|-----------------|---------------------|-------------------------|
| Creates designs from scratch | ✅ | ❌ | ❌ (captures existing UI) | ✅ |
| Edits existing designs | ✅ | ❌ Read-only | ❌ One-time import | ✅ |
| Real screenshots | ✅ | ✅ | N/A | ❌ |
| Works with any MCP client | ✅ | ✅ | ❌ Claude Code only | ❌ |
| Needs running code | ❌ | ❌ | ✅ Requires localhost/staging | ❌ |
| API key / OAuth required | ❌ | ✅ Figma token | ✅ Figma OAuth | ❌ |
| Plugin install | ❌ | ❌ | ❌ | ✅ |
| Full Plugin API access | ✅ | ❌ | ❌ | Partial (sandboxed) |
| Setup | `npx tellfigma` | Config + token | Remote server + OAuth | Plugin + WS + MCP |

## License

MIT — [Directive Labs](https://directivelabs.com)
