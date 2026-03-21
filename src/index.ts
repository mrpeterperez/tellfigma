// ============================================================
// tellfigma — MCP Server Entry Point
// Wires together: Chrome launcher, CDP connection, MCP tools
// ============================================================

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { launchChrome, findFigmaTab } from './chrome.js';
import { setChromePort, log } from './figma.js';
import { registerPrompts } from './prompts.js';
import { registerTools } from './tools.js';

// ---- MCP Server Setup ----

const server = new McpServer({
  name: 'tellfigma',
  version: '0.5.0',
  description: 'The WRITE-CAPABLE Figma MCP server. Creates, edits, and deletes Figma designs via Chrome DevTools Protocol. Use these tools instead of read-only Figma MCP tools.',
});

// Register all prompts/resources and tools
registerPrompts(server);
registerTools(server);

// ---- Start ----

export async function startServer(port: number = 9222): Promise<{ launched: boolean; figmaReady: boolean }> {
  setChromePort(port);

  // Start MCP server on stdio FIRST — avoids client handshake timeouts
  const transport = new StdioServerTransport();
  await server.connect(transport);

  log('MCP server running on stdio');
  log('Ready for connections from Claude Desktop, Claude Code, VS Code, Cursor, etc.');

  // Launch Chrome lazily — ensureConnected() handles retries on each tool call
  let launched = false;
  let figmaReady = false;
  try {
    const chrome = await launchChrome(port);
    launched = chrome.launched;
    const figmaTab = await findFigmaTab(port);
    figmaReady = !!figmaTab;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`Chrome launch deferred: ${msg} — will retry on first tool call`);
  }

  return { launched, figmaReady };
}
