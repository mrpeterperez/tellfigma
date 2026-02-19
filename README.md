# tellfigma 🎨

[![npm version](https://img.shields.io/npm/v/tellfigma.svg)](https://www.npmjs.com/package/tellfigma)
[![npm downloads](https://img.shields.io/npm/dm/tellfigma.svg)](https://www.npmjs.com/package/tellfigma)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org)

<!-- 🎬 demo GIF coming soon — this is where the magic happens -->
<!-- ![tellfigma demo](https://tellfigma.com/demo.gif) -->

**Your AI just learned how to use Figma. You're welcome.**

Every other Figma AI tool out there? Read-only. They can *look* at your designs. Wow, incredible, so can I. 👀

tellfigma actually **writes** to Figma. Creates frames. Sets colors. Builds full pages. Takes screenshots. The whole damn thing.

```bash
npx tellfigma
```

That's it. That's the setup. I've seen longer Starbucks orders. ☕

---

## 🤔 Why does this exist?

Because I got tired of copying hex codes between Figma and my code editor like some kind of unpaid intern.

Every Figma MCP tool I found was either:
- **Read-only** — cool, thanks, very helpful, love that for me 🙃
- **Plugin sandbox** — great, now I need a plugin + WebSocket + MCP server + a prayer

tellfigma skips all that nonsense. It uses **Chrome DevTools Protocol** to talk directly to Figma's Plugin API. Same API the plugins use, minus the sandbox, minus the setup headaches.

```
┌─────────────────┐      MCP (stdio)       ┌──────────┐   Chrome DevTools   ┌──────────┐
│  Claude Desktop  │ ◄────────────────────► │ tellfigma │ ◄────────────────► │  Chrome   │
│  Claude Code     │                        │  (local)  │   Protocol (CDP)   │ + Figma   │
│  VS Code Copilot │                        └──────────┘                     └──────────┘
│  Cursor / etc.   │
└─────────────────┘
```

### The AI + Figma loop is finally complete 🔄

```
① tellfigma              AI  ──────►  Figma       "Design a dashboard"
② Figma MCP Server       Figma ──────►  Code       "Build this design"
③ Claude Code to Figma   Code  ──────►  Figma      "Capture this UI"
```

tellfigma is **step ①** — the piece that was missing. Until now.

---

## 🚀 Quick Start

### 1. Run it

```bash
npx tellfigma
```

Chrome opens. Sign into Figma. Open a design file. Done.

### 2. Hook it up to your AI

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

That's literally it.
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

### 3. Tell it what to make

Just talk to your AI like a normal human:

> "Design a modern login page with email and password fields, a sign-in button, and a 'Forgot password?' link"

> "Take a screenshot and roast the spacing"

> "Find all text nodes on this page and make them Inter Semi Bold"

> "Create a card component with a subtle shadow, 16px padding, and 12px corners"

It just... does it. In Figma. Live. 🤯

---

## 🛠️ What's under the hood

### 16 MCP Tools

| Tool | What it does |
|------|-------------|
| `execute_figma_code` | Run any JS with full `figma` Plugin API access — the big one 🔥 |
| `take_screenshot` | Captures what's on screen — the AI actually *sees* your canvas |
| `read_selection` | Deep inspect fills, strokes, effects, layout, fonts, children |
| `get_page_context` | Page name, selection, top-level frames |
| `select_nodes` | Find and select by name or type |
| `list_components` | All components and component sets |
| `get_styles` | Local paint, text, and effect styles |
| `get_variables` | Design tokens — colors, numbers, strings |
| `export_node` | Export as PNG, SVG, JPG, or PDF |
| `duplicate_node` | Clone with offset — great for grids |
| `undo` / `redo` | Oops button, but for AI |
| `zoom_to` | Zoom to selection, all nodes, or a specific one |
| `navigate` | Open a URL (specific Figma files, etc.) |
| `click` | Click coordinates on the page |
| `get_snapshot` | Accessibility tree for understanding UI structure |

### Built-in design smarts 🧠

tellfigma doesn't just blindly execute code. The AI gets a massive system prompt with:

- **Full Figma Plugin API reference** — every method, property, and gotcha
- **Design recipes** — buttons, cards, inputs, navbars ready to compose
- **Design system defaults** — 8px spacing scale, color ramps, type scale, shadow presets
- **Error recovery** — "hey you forgot to load the font" hints that save you 10 minutes of debugging
- **Auto-reconnect** — connection drops? No drama. Picks right back up.

### 🎯 Design from your actual codebase

This one's nuts. If you're in VS Code, Cursor, or Claude Code, the AI already has your project files. So you can say:

> "Design a settings page that matches my app"

And it will:
1. Read your `tailwind.config.ts`, `globals.css`, component files
2. Pull your **exact** colors, fonts, spacing, radius, shadows
3. Design in Figma using YOUR tokens — not some generic blue from 2019

Works with **Tailwind**, **shadcn/ui**, **MUI**, **Chakra**, whatever you're running. No config. No flags. Your editor already knows your project.

```
┌──────────┐     reads     ┌───────────┐    designs    ┌────────┐
│ Your Code │ ────────────► │  AI Agent  │ ────────────► │ Figma  │
│ (editor)  │  tailwind,   │ (Copilot/  │  your exact  │ canvas │
│           │  components  │  Claude)   │  tokens      │        │
└──────────┘              └───────────┘               └────────┘
```

---

## ⚙️ How it actually works

Not magic — just clever plumbing:

1. `npx tellfigma` launches Chrome with `--remote-debugging-port=9222` and its own profile (`~/.tellfigma-chrome-profile`) so it doesn't mess with your regular browser
2. MCP server starts on stdio
3. AI calls `execute_figma_code` → tellfigma connects via CDP → finds the Figma tab → runs JS through `Runtime.evaluate`
4. Screenshots use `Page.captureScreenshot` — real browser screenshots, not some janky API render
5. AI gets a loaded system prompt with the full Plugin API reference

Your normal Chrome stays untouched. Pinky promise. 🤙

---

## 📊 tellfigma vs. everything else

| | tellfigma | Figma MCP (Dev Mode) | Claude Code to Figma | Plugin + WebSocket |
|---|---|---|---|---|
| **Creates designs** | ✅ yep | ❌ read-only | ❌ captures existing UI | ✅ |
| **Edits designs** | ✅ | ❌ | ❌ one-time import | ✅ |
| **Real screenshots** | ✅ | ✅ | N/A | ❌ |
| **Any MCP client** | ✅ all of them | ✅ | ❌ Claude only | ❌ |
| **No API key** | ✅ zero keys | ❌ token required | ❌ OAuth required | ✅ |
| **No plugin install** | ✅ | ❌ | ❌ | ❌ |
| **Full Plugin API** | ✅ | ❌ | ❌ | partial |
| **Setup** | `npx tellfigma` | config + token | server + OAuth | plugin + WS + MCP |

Yeah. It's like that. 😎

---

## Options

```
npx tellfigma [options]

  --port <number>   Chrome debug port (default: 9222)
  --help, -h        Show help
```

## Requirements

- **Node.js 18+** — you probably already have this
- **Google Chrome** (or Chromium) — you definitely already have this
- Any MCP-compatible AI app — Claude Desktop, Claude Code, VS Code, Cursor, Windsurf, etc.

## 🔧 Troubleshooting

**"No Figma tab found"** — Open a Figma design file in the Chrome window that tellfigma launched. Needs `figma.com/design` or `figma.com/file` in the URL.

**"Chrome debug port didn't become available"** — Something else is hogging port 9222. Try `npx tellfigma --port 9333` or kill the squatter.

**"Connection lost, reconnecting..."** — Totally normal. Auto-reconnects on the next tool call. If it keeps happening, reload the Figma tab.

**Font errors** — Always `await figma.loadFontAsync({ family, style })` before setting text. And it's `"Semi Bold"` with a space, not `"SemiBold"`. Yeah, that one gets everyone. 🫠

**Code ran but nothing showed up** — You probably forgot `figma.currentPage.appendChild(node)`. New nodes are invisible until you append them. Classic.

---

## 🤝 Contributing

PRs welcome. Open an issue first for big changes so we don't step on each other.

## License

MIT — built by [Directive Labs](https://directivelabs.com) ⚡

---

<p align="center">
  <a href="https://tellfigma.com">tellfigma.com</a> · <a href="https://directivelabs.com">Directive Labs</a> · <a href="https://github.com/mrpeterperez/tellfigma">GitHub</a>
</p>
