#!/usr/bin/env node

// ============================================================
// tellfigma CLI — Control Figma from any AI app. One command.
// ============================================================

import { startServer } from '../dist/index.js';

const args = process.argv.slice(2);

// Parse args
let port = 9222;
let showHelp = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--port' && args[i + 1]) {
    port = parseInt(args[i + 1], 10);
    i++;
  } else if (args[i] === '--help' || args[i] === '-h') {
    showHelp = true;
  }
}

if (showHelp) {
  const help = `
  ┌─────────────────────────────────────────────────┐
  │  tellfigma — AI-powered Figma control           │
  │  Create, edit & inspect designs from any AI app  │
  └─────────────────────────────────────────────────┘

  Usage:  npx tellfigma [options]

  Options:
    --port <number>   Chrome debug port (default: 9222)
    --help, -h        Show this help

  ─── Quick Start (30 seconds) ────────────────────

  Step 1: Run tellfigma
    $ npx tellfigma

  Step 2: Add to your AI app

    VS Code / Cursor (.vscode/mcp.json):
    {
      "servers": {
        "tellfigma": {
          "type": "stdio",
          "command": "npx",
          "args": ["-y", "tellfigma@latest"]
        }
      }
    }

    Claude Desktop (~/.claude/claude_desktop_config.json):
    {
      "mcpServers": {
        "tellfigma": {
          "command": "npx",
          "args": ["-y", "tellfigma@latest"]
        }
      }
    }

    Claude Code:
    $ claude mcp add tellfigma -- npx -y tellfigma@latest

  Step 3: Open a Figma design file in Chrome. Done.

  ─── Multi-File / Multi-Window Setup ────────────

  tellfigma supports multiple Figma tabs! Use:
    list_figma_tabs    — see all open Figma tabs
    switch_figma_tab   — switch to a different tab

  For fully independent VS Code windows, use different ports:

    Window 1: npx tellfigma --port 9222
    Window 2: npx tellfigma --port 9223

    Launch Chrome instances on separate ports:
    $ chrome --remote-debugging-port=9222 --user-data-dir=~/.tf-profile-1
    $ chrome --remote-debugging-port=9223 --user-data-dir=~/.tf-profile-2

  ─── Try These ───────────────────────────────────

    "Create a login page with email and password"
    "Build a card component with shadow and rounded corners"
    "Screenshot this and recreate it pixel-perfect"
    "Read my codebase and design matching Figma screens"

  ─────────────────────────────────────────────────
  Docs: https://github.com/mrpeterperez/tellfigma
`;
  console.log(help);
  process.exit(0);
}

// ASCII banner + status
process.stderr.write(`
╔═══════════════════════════════════════════════════╗
║                                                   ║
║   ▀█▀ █▀▀ █   █   █▀▀ █ █▀▀ █▄ ▄█ █▀█           ║
║    █  █▀▀ █   █   █▀  █ █ █ █ ▀ █ █▀█           ║
║    ▀  ▀▀▀ ▀▀▀ ▀▀▀ ▀   ▀ ▀▀▀ ▀   ▀ ▀ ▀           ║
║                                                   ║
║   Control Figma from any AI app. One command.     ║
║                                                   ║
╚═══════════════════════════════════════════════════╝
`);

startServer(port)
  .then(({ launched, figmaReady }) => {
    // Post-connection onboarding tips
    const tips = [];

    if (launched) {
      tips.push('  ✦ Chrome launched — log into Figma and open a design file');
    }

    if (!figmaReady) {
      tips.push('  ✦ Open a Figma design file in Chrome');
      tips.push('  ✦ If figma API is unavailable: open any plugin (e.g. Iconify), close it');
    }

    if (tips.length > 0) {
      process.stderr.write('\n┌─── Getting Started ───────────────────────────┐\n');
      tips.forEach(t => process.stderr.write(`│ ${t.padEnd(47)}│\n`));
      process.stderr.write('│                                                │\n');
      process.stderr.write('│  Once Figma is open, your AI app handles the   │\n');
      process.stderr.write('│  rest. Just chat naturally:                     │\n');
      process.stderr.write('│                                                │\n');
      process.stderr.write('│  "Design a settings page for my app"           │\n');
      process.stderr.write('│  "Create a button component"                   │\n');
      process.stderr.write('│                                                │\n');
      process.stderr.write('└────────────────────────────────────────────────┘\n\n');
    } else {
      process.stderr.write('\n  ✅ Connected & ready — your AI app can now control Figma!\n\n');
    }
  })
  .catch((err) => {
    process.stderr.write(`\n  ❌ ${err.message}\n`);

    // Smart error help
    if (err.message.includes('Chrome not found')) {
      process.stderr.write('\n  Fix: Install Google Chrome, or set CHROME_PATH:\n');
      process.stderr.write('    export CHROME_PATH="/path/to/chrome"\n\n');
    } else if (err.message.includes('debug port')) {
      process.stderr.write('\n  Fix: Chrome may already be running without debug mode.\n');
      process.stderr.write('    1. Quit Chrome completely\n');
      process.stderr.write('    2. Run: npx tellfigma\n');
      process.stderr.write('    (tellfigma will launch Chrome with the right flags)\n\n');
    } else if (err.message.includes('No Figma tab')) {
      process.stderr.write('\n  Fix: Open a Figma design file in Chrome:\n');
      process.stderr.write('    https://www.figma.com → pick any file → open it\n\n');
    }

    process.exit(1);
  });
