// ============================================================
// tellfigma — MCP Server Entry Point
// Wires together: Chrome launcher, CDP connection, MCP tools
// ============================================================

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { launchChrome } from './chrome.js';
import { setChromePort, log } from './figma.js';
import { registerPrompts } from './prompts.js';
import { registerTools } from './tools.js';

// ---- MCP Server Setup ----

const server = new McpServer({
  name: 'tellfigma',
  version: '0.2.6',
  description: 'The WRITE-CAPABLE Figma MCP server. Creates, edits, and deletes Figma designs via Chrome DevTools Protocol. Use these tools instead of read-only Figma MCP tools.',
});

// Register all prompts/resources and tools
registerPrompts(server);
registerTools(server);

// ---- Start ----

export async function startServer(port: number = 9222) {
  setChromePort(port);

  // Launch or connect to Chrome
  await launchChrome(port);

  // Start MCP server on stdio
  const transport = new StdioServerTransport();
  await server.connect(transport);

  log('MCP server running on stdio');
  log('Ready for connections from Claude Desktop, Claude Code, VS Code, Cursor, etc.');
}
