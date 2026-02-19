#!/usr/bin/env node

// ============================================================
// tellfigma CLI — Control Figma from any AI app. One command.
// ============================================================
// Usage:
//   npx tellfigma                         # Start with defaults
//   npx tellfigma --port 9222             # Custom Chrome debug port
//   npx tellfigma --no-launch             # Don't launch Chrome (connect to existing)
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
  console.log(`
  tellfigma — Control Figma from any AI app. One command.

  Usage:
    npx tellfigma [options]

  Options:
    --port <number>   Chrome debug port (default: 9222)
    --help, -h        Show this help

  Setup:
    1. Run this command: npx tellfigma
    2. Log into Figma in the Chrome window that opens
    3. Open a design file
    4. Add tellfigma to your AI app's MCP config:

       Claude Desktop (~/.claude/claude_desktop_config.json):
       {
         "mcpServers": {
           "tellfigma": {
             "command": "npx",
             "args": ["-y", "tellfigma"]
           }
         }
       }

       Claude Code:
       claude mcp add tellfigma -- npx -y tellfigma

       VS Code (.vscode/mcp.json):
       {
         "servers": {
           "tellfigma": {
             "type": "stdio",
             "command": "npx",
             "args": ["-y", "tellfigma"]
           }
         }
       }

    5. Chat with your AI — it now controls Figma!

  Examples:
    "Create a card component with a shadow and rounded corners"
    "Design a login page with email and password fields"
    "Find all text on this page and list their font sizes"

  More info: https://github.com/directivelabs/tellfigma
`);
  process.exit(0);
}

// ASCII banner
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

startServer(port).catch((err) => {
  process.stderr.write(`\n[tellfigma] Error: ${err.message}\n`);
  process.exit(1);
});
