# tellfigma 🎨

[![npm version](https://img.shields.io/npm/v/tellfigma.svg)](https://www.npmjs.com/package/tellfigma)
[![npm downloads](https://img.shields.io/npm/dm/tellfigma.svg)](https://www.npmjs.com/package/tellfigma)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org)

<!-- 🎬 demo GIF coming soon — this is where the magic happens -->
<!-- ![tellfigma demo](https://tellfigma.com/demo.gif) -->

## What is tellfigma?

**tellfigma is an open-source MCP server that gives AI assistants full read-write access to Figma.** It's the only Figma MCP that can create, edit, and delete designs — not read-only, not one-way, the real thing.

Every other Figma AI tool? Read-only. They can *look* at your designs. Cool. So can my eyes. 👀

tellfigma **writes** to Figma. Creates frames. Builds full pages. Edits properties. Takes screenshots. Inspects everything. The whole loop. Works with **Claude Desktop**, **Claude Code**, **VS Code GitHub Copilot**, **Cursor**, **Windsurf**, and any MCP-compatible AI client.

```bash
npx tellfigma
```

One command. No plugin. No API key. No OAuth dance.

---

## 🤔 Why does this exist?

Real talk — I had to update **hundreds of components** in Figma. Create a ton of variable options for toggles, states, themes. The kind of repetitive bulk work that makes you question your career choices at 2 AM.

So I built a script to do it. Just a quick hack — Chrome DevTools Protocol, talk to Figma's Plugin API, change everything in one shot instead of clicking 400 times.

Then I realized: wait, what if I let an AI write the code instead of me?

So I wired it up to Claude. Asked it to create a button. It created a button. Asked it to build a full settings page. It built a full settings page. Asked it to read my codebase first and match my design tokens. It did that too.

That quick hack turned into tellfigma. The tool that was supposed to save me an afternoon ended up being something that actually understands what you want and designs it live in Figma.

**It's not theoretical.** It works right now. You talk, Figma moves.

### Why not just use [other tool]?

Every Figma MCP tool I found was either:
- **Read-only** — congrats, your AI can describe a button. Groundbreaking. 🙃
- **One-way import** — renders your UI as HTML, converts to Figma layers once, never touches Figma again
- **Plugin sandbox** — needs a Figma plugin + WebSocket server + MCP server + configuration therapy

tellfigma skips all that. **Chrome DevTools Protocol** → direct access to the same `figma` Plugin API that plugins use → minus the sandbox, minus the setup, minus the existential dread.

```
┌─────────────────┐      MCP (stdio)       ┌──────────┐   Chrome DevTools   ┌──────────┐
│  Claude Desktop  │ ◄────────────────────► │ tellfigma │ ◄────────────────► │  Chrome   │
│  Claude Code     │                        │  (local)  │   Protocol (CDP)   │ + Figma   │
│  VS Code Copilot │                        └──────────┘                     └──────────┘
│  Cursor / etc.   │
└─────────────────┘
```

### The full loop 🔄

```
  Your Code                    Figma
     │                           ▲
     │  reads tailwind,          │  creates & edits
     │  components, tokens       │  designs live
     ▼                           │
   AI Agent ─────────────────────┘
     ▲                           │
     │  screenshots,             │
     │  inspect, variables       │
     └───────────────────────────┘
            reads back
```

This is the part nobody else does. tellfigma goes **both ways**. It writes designs, reads them back, screenshots the result, and iterates. And if you're in VS Code or Cursor, it reads your actual codebase first — your colors, your spacing, your components — then designs to match.

Not "generate a generic card." Generate YOUR card. With YOUR tokens. In YOUR Figma file. Live.

Other tools in the ecosystem:
- **Figma MCP Server (Dev Mode)** — reads designs for code generation. Legit useful for that. But read-only — can't create or edit anything.
- **Claude Code to Figma** — captures your running UI as HTML, redraws it as Figma layers. One-way, one-time. Doesn't read Figma, doesn't iterate. Basically the HTML2Design plugin with extra steps.

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
      "args": ["-y", "tellfigma@latest"]
    }
  }
}
```

Restart Claude Desktop.
</details>

<details>
<summary><strong>Claude Code</strong></summary>

```bash
claude mcp add tellfigma -- npx -y tellfigma@latest
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
      "args": ["-y", "tellfigma@latest"]
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
      "args": ["-y", "tellfigma@latest"]
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
      "args": ["-y", "tellfigma@latest"]
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

> "List all the variables and styles in this file"

> "Select every frame named 'Card' and read their properties"

> "Export the header component as SVG"

Creating, reading, inspecting, exporting — it does all of it. In Figma. Live. 🤯

Also works with **FigJam boards**. 🧩

---

## 🛠️ What's under the hood

### 17 MCP Tools

| Tool | What it does |
|------|-------------|
| `execute_figma_code` | Run any JS with full `figma` Plugin API access — the big one 🔥 |
| `take_screenshot` | Live canvas screenshot — the AI actually *sees* what it made |
| `connection_status` | Health check — is Chrome connected? Is Figma ready? |
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

tellfigma doesn't just blindly run code. The AI gets a massive system prompt baked with everything it needs:

- **Full Figma Plugin API reference** — every method, property, and gotcha
- **Design recipes** — buttons, cards, inputs, navbars ready to compose
- **Design system defaults** — 8px grid, proper type scale, shadow presets, color ramps
- **Error recovery** — "hey you forgot to load the font" / "layoutSizing goes AFTER appendChild" — the kind of hints that save 20 minutes of debugging
- **Auto-reconnect** — connection drops? Picks right back up. No drama.
- **Tool disambiguation** — if other read-only Figma MCPs are running alongside tellfigma, it knows to use its own write-capable tools instead of getting confused

### 🎯 Design from your actual codebase

This is the part that blows people's minds. If you're in VS Code, Cursor, or Claude Code, the AI already has access to your project files. So you can say:

> "Design a settings page that matches my app"

And it will:
1. Read your `tailwind.config.ts`, `globals.css`, component files
2. Pull your **exact** colors, fonts, spacing, radius, shadows
3. Design in Figma using YOUR tokens — not some default blue from a Tailwind tutorial

Your Figma design IS the spec. It matches the code because it came FROM the code.

Works with **Tailwind**, **shadcn/ui**, **MUI**, **Chakra**, CSS variables, design tokens, whatever you're running. No config needed.

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
| **Creates designs** | ✅ | ❌ read-only | ❌ captures existing UI | ✅ |
| **Edits designs** | ✅ | ❌ | ❌ one-time import | ✅ |
| **Reads Figma back** | ✅ variables, styles, nodes | ✅ | ❌ | partial |
| **Iterates on designs** | ✅ undo/redo/screenshot/fix | ❌ | ❌ one-shot | ✅ |
| **Real screenshots** | ✅ live canvas | ✅ | N/A | ❌ |
| **Any MCP client** | ✅ all of them | ✅ | ❌ Claude Code only | ❌ |
| **Reads your codebase** | ✅ matches your tokens | ❌ | ❌ | ❌ |
| **No API key** | ✅ zero keys | ❌ token required | ❌ OAuth required | ✅ |
| **No plugin install** | ✅ | ❌ | ❌ | ❌ |
| **Full Plugin API** | ✅ createFrame, createText, everything | ❌ | ❌ | partial |
| **Bulk operations** | ✅ change 400 things at once | ❌ | ❌ | ✅ |
| **Setup** | `npx tellfigma` | config + token | server + OAuth | plugin + WS + MCP |

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

**Chrome not found (Windows/Linux)** — Set the `CHROME_PATH` environment variable to your Chrome executable path. e.g. `CHROME_PATH="/usr/bin/google-chrome" npx tellfigma`

**"Connection lost, reconnecting..."** — Totally normal. Auto-reconnects on the next tool call. If it keeps happening, reload the Figma tab.

**Font errors** — Always `await figma.loadFontAsync({ family, style })` before setting text. And it's `"Semi Bold"` with a space, not `"SemiBold"`. Yeah, that one gets everyone. 🫠

**Code ran but nothing showed up** — You probably forgot `figma.currentPage.appendChild(node)`. New nodes are invisible until you append them. Classic.

---

## ❓ FAQ

<details>
<summary><strong>Can tellfigma create Figma designs from scratch?</strong></summary>

Yes. tellfigma is the only Figma MCP that can create designs. It has full write access to the Figma Plugin API — `createFrame()`, `createText()`, `createComponent()`, auto-layout, variables, styles, effects, everything.
</details>

<details>
<summary><strong>Does tellfigma need a Figma API key or OAuth token?</strong></summary>

No. tellfigma connects via Chrome DevTools Protocol directly to a Figma tab in your browser. Zero API keys, zero OAuth, zero tokens.
</details>

<details>
<summary><strong>Does tellfigma need a Figma plugin?</strong></summary>

No. It runs through Chrome DevTools Protocol, executing Plugin API code directly in the browser — bypassing the plugin sandbox entirely.
</details>

<details>
<summary><strong>What AI clients work with tellfigma?</strong></summary>

Any MCP-compatible client: Claude Desktop, Claude Code, VS Code GitHub Copilot, Cursor, Windsurf, and any other AI app that supports the Model Context Protocol.
</details>

<details>
<summary><strong>Can tellfigma read my codebase and match my design tokens?</strong></summary>

Yes. When used in VS Code, Cursor, or Claude Code, the AI reads your source files — Tailwind config, CSS variables, component code — and designs in Figma using your exact colors, spacing, fonts, and components.
</details>

<details>
<summary><strong>How is tellfigma different from the official Figma MCP (Dev Mode)?</strong></summary>

The official Figma MCP (Dev Mode) is **read-only** — it reads designs for code generation but can't create or edit anything. tellfigma is **read-write** — it can create, edit, delete, screenshot, and iterate on designs. They're complementary: use Figma Dev Mode MCP to read existing designs into code, use tellfigma to create and edit designs from your AI.
</details>

<details>
<summary><strong>Is tellfigma free?</strong></summary>

Yes. MIT licensed, fully open-source. Free forever.
</details>

<details>
<summary><strong>Who made tellfigma?</strong></summary>

[Peter Perez](https://github.com/mrpeterperez). Built it to bulk-edit hundreds of Figma components at 2 AM, then wired it to Claude, and it became this.
</details>

---

## 🤝 Contributing

PRs welcome. Open an issue first for big changes so we don't step on each other.

## License

MIT — built by [Peter Perez](https://github.com/mrpeterperez) ⚡

Started as a hacky script to bulk-edit hundreds of Figma components at 2 AM. Turned into this. Sometimes the best tools come from being too lazy to click.

---

<p align="center">
  <a href="https://github.com/mrpeterperez/tellfigma">GitHub</a> · <a href="https://www.npmjs.com/package/tellfigma">npm</a>
</p>
