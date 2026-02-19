// ============================================================
// Figma CDP Connection & Helpers
// Manages Chrome DevTools Protocol connections to MULTIPLE
// Figma tabs and provides core functions for executing code,
// taking screenshots, etc.
// ============================================================

import CDP from 'chrome-remote-interface';
import { findFigmaTab, findAllFigmaTabs, type FigmaTabInfo } from './chrome.js';

// ---- Types ----
interface TabConnection {
  client: CDP.Client;
  tabId: string;
  tabTitle: string;
  tabUrl: string;
}

// ---- State ----
const connections: Map<string, TabConnection> = new Map();
let activeTabId: string | null = null;
let chromePort: number = 9222;

// ---- Logging (stderr so it doesn't interfere with MCP stdio) ----
export function log(msg: string) {
  process.stderr.write(`[tellfigma] ${msg}\n`);
}

// ---- Port configuration ----
export function setChromePort(port: number) {
  chromePort = port;
}

// ---- CDP Connection (multi-tab, auto-reconnect) ----

/** Connect to a specific Figma tab by its Chrome tab ID */
async function connectToTab(tab: FigmaTabInfo): Promise<TabConnection> {
  // Check if we already have a live connection to this tab
  const existing = connections.get(tab.id);
  if (existing) {
    try {
      await existing.client.Runtime.evaluate({ expression: '1+1' });
      return existing;
    } catch {
      log(`Connection to "${tab.title}" lost, reconnecting...`);
      try { existing.client.close(); } catch {}
      connections.delete(tab.id);
    }
  }

  log(`Connecting to Figma tab: ${tab.title}`);
  const client = await CDP({
    port: chromePort,
    target: tab.webSocketDebuggerUrl,
  });

  await client.Runtime.enable();
  await client.Page.enable();

  const conn: TabConnection = {
    client,
    tabId: tab.id,
    tabTitle: tab.title,
    tabUrl: tab.url,
  };

  // Auto-cleanup on disconnect
  client.on('disconnect', () => {
    log(`CDP disconnected from "${tab.title}" — will reconnect on next tool call`);
    connections.delete(tab.id);
    if (activeTabId === tab.id) {
      activeTabId = null;
    }
  });

  connections.set(tab.id, conn);
  return conn;
}

/** Ensure connection to the active tab (auto-selects first tab if none active) */
export async function ensureConnected(): Promise<CDP.Client> {
  // If we have an active tab with a live connection, use it
  if (activeTabId) {
    const conn = connections.get(activeTabId);
    if (conn) {
      try {
        await conn.client.Runtime.evaluate({ expression: '1+1' });
        return conn.client;
      } catch {
        log(`Active tab connection lost, reconnecting...`);
        try { conn.client.close(); } catch {}
        connections.delete(activeTabId);
        activeTabId = null;
      }
    }
  }

  // No active tab — find one
  let tab: FigmaTabInfo | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    tab = await findFigmaTab(chromePort);
    if (tab) break;
    if (attempt < 2) {
      log(`Waiting for Figma tab... (attempt ${attempt + 1}/3)`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  if (!tab) {
    throw new Error(
      'No Figma tab found. Please open a Figma design file in Chrome, then try again.'
    );
  }

  const conn = await connectToTab(tab);
  activeTabId = conn.tabId;
  return conn.client;
}

// ---- Multi-Tab Management ----

/** List all available Figma tabs */
export async function listFigmaTabs(): Promise<Array<{
  id: string;
  title: string;
  url: string;
  active: boolean;
  connected: boolean;
}>> {
  const tabs = await findAllFigmaTabs(chromePort);
  return tabs.map(tab => ({
    id: tab.id,
    title: tab.title,
    url: tab.url,
    active: tab.id === activeTabId,
    connected: connections.has(tab.id),
  }));
}

/** Switch to a different Figma tab by ID, title substring, or URL substring */
export async function switchToTab(identifier: string): Promise<{
  tabId: string;
  title: string;
  url: string;
}> {
  const tabs = await findAllFigmaTabs(chromePort);

  if (tabs.length === 0) {
    throw new Error('No Figma tabs found in Chrome.');
  }

  // Try matching by exact ID first
  let target = tabs.find(t => t.id === identifier);

  // Then by title substring (case-insensitive)
  if (!target) {
    target = tabs.find(t =>
      t.title.toLowerCase().includes(identifier.toLowerCase())
    );
  }

  // Then by URL substring
  if (!target) {
    target = tabs.find(t =>
      t.url.toLowerCase().includes(identifier.toLowerCase())
    );
  }

  // Try numeric index (1-based)
  if (!target) {
    const idx = parseInt(identifier, 10);
    if (!isNaN(idx) && idx >= 1 && idx <= tabs.length) {
      target = tabs[idx - 1];
    }
  }

  if (!target) {
    const available = tabs.map((t, i) => `  ${i + 1}. "${t.title}" — ${t.url}`).join('\n');
    throw new Error(
      `No Figma tab matches "${identifier}".\n\nAvailable tabs:\n${available}`
    );
  }

  // Connect to the target tab
  const conn = await connectToTab(target);
  activeTabId = conn.tabId;

  log(`Switched to: "${target.title}"`);
  return {
    tabId: target.id,
    title: target.title,
    url: target.url,
  };
}

/** Get info about the currently active tab */
export function getActiveTabInfo(): { tabId: string; title: string; url: string } | null {
  if (!activeTabId) return null;
  const conn = connections.get(activeTabId);
  if (!conn) return null;
  return { tabId: conn.tabId, title: conn.tabTitle, url: conn.tabUrl };
}

// ---- Execute Figma Code ----

export async function executeFigmaCode(code: string): Promise<string> {
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

    // Add helpful hints for common errors
    let hint = '';
    if (errorText.includes('figma is not defined') || errorText.includes('figma is undefined')) {
      hint = '\n\nHint: The Figma Plugin API is not available. Open any Figma plugin (e.g. Iconify), close it, then try again. This activates the figma global.';
    } else if (errorText.includes('loadFontAsync')) {
      hint = '\n\nHint: You must call await figma.loadFontAsync({ family, style }) before setting characters on a text node.';
    } else if (errorText.includes('Cannot read properties of null')) {
      hint = '\n\nHint: A node was null. Use figma.currentPage.findOne() carefully — it returns null if nothing matches.';
    } else if (errorText.includes('not a function')) {
      hint = '\n\nHint: Check that you\'re calling the right method. E.g., figma.createFrame() not figma.createAutoLayout().';
    } else if (errorText.includes('layoutSizingHorizontal') || errorText.includes('layoutSizingVertical')) {
      hint = '\n\nHint: layoutSizingHorizontal/Vertical must be set AFTER the node is appended to a parent with layoutMode.';
    } else if (errorText.includes('Cannot assign to read only property')) {
      hint = '\n\nHint: Some Figma properties are read-only. Check the Figma Plugin API docs for the correct setter.';
    } else if (errorText.includes('SemiBold') && !errorText.includes('Semi Bold')) {
      hint = '\n\nHint: For Inter font, use "Semi Bold" (with a space), not "SemiBold".';
    } else if (errorText.includes('font')) {
      hint = '\n\nHint: Make sure you loaded the font first: await figma.loadFontAsync({ family: "Inter", style: "Regular" })';
    } else if (errorText.includes('timeout') || errorText.includes('Timeout')) {
      hint = '\n\nHint: The code took too long (>30s). Break it into smaller chunks or simplify the operation.';
    }

    return `Error: ${errorText}${hint}`;
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

// ---- Take Screenshot ----

export async function takeScreenshot(): Promise<{
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

// ---- Figma REST API (Comments, etc.) ----

function getFigmaToken(): string {
  const token = process.env.FIGMA_TOKEN || process.env.FIGMA_PERSONAL_ACCESS_TOKEN;
  if (!token) {
    throw new Error(
      'FIGMA_TOKEN environment variable is required for comment access.\n\n' +
      'Get a personal access token from: Figma → Settings → Personal access tokens\n' +
      'Then set it: export FIGMA_TOKEN="figd_..."'
    );
  }
  return token;
}

/** Extract the Figma file key from the active tab URL */
async function getFileKey(): Promise<string> {
  const client = await ensureConnected();
  const { result } = await client.Runtime.evaluate({
    expression: 'window.location.href',
    returnByValue: true,
  });
  const url = result.value as string;
  // Match /design/KEY, /file/KEY, or /board/KEY
  const match = url.match(/figma\.com\/(?:design|file|board)\/([a-zA-Z0-9]+)/);
  if (!match) {
    throw new Error(`Cannot extract file key from URL: ${url}`);
  }
  return match[1];
}

/** Fetch comments from the Figma REST API */
export async function getComments(options?: {
  nodeId?: string;
  asOf?: string;
}): Promise<string> {
  const token = getFigmaToken();
  const fileKey = await getFileKey();

  let url = `https://api.figma.com/v1/files/${fileKey}/comments`;
  const params: string[] = [];
  if (options?.asOf) params.push(`as_of=${encodeURIComponent(options.asOf)}`);
  if (params.length) url += '?' + params.join('&');

  const res = await fetch(url, {
    headers: { 'X-Figma-Token': token },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Figma API ${res.status}: ${body}`);
  }

  const data = await res.json() as {
    comments: Array<{
      id: string;
      message: string;
      created_at: string;
      resolved_at: string | null;
      user: { handle: string; img_url: string };
      client_meta?: { node_id?: string; node_offset?: { x: number; y: number } };
      order_id: string;
      parent_id?: string;
    }>;
  };

  // Filter by nodeId if specified
  let comments = data.comments;
  if (options?.nodeId) {
    const targetId = options.nodeId;
    comments = comments.filter(c =>
      c.client_meta?.node_id === targetId ||
      c.client_meta?.node_id?.replace(':', '-') === targetId.replace(':', '-')
    );
  }

  // Format for readability
  const formatted = comments.map(c => ({
    id: c.id,
    author: c.user.handle,
    message: c.message,
    createdAt: c.created_at,
    resolved: !!c.resolved_at,
    nodeId: c.client_meta?.node_id || null,
    parentId: c.parent_id || null,
  }));

  return JSON.stringify(formatted, null, 2);
}

/** Post a comment to the Figma file via REST API */
export async function postComment(message: string, options?: {
  nodeId?: string;
  replyTo?: string;
}): Promise<string> {
  const token = getFigmaToken();
  const fileKey = await getFileKey();

  const body: Record<string, any> = { message };
  if (options?.replyTo) {
    body.comment_id = options.replyTo;
  } else if (options?.nodeId) {
    // Format node_id for API (uses : separator)
    const nid = options.nodeId.includes(':') ? options.nodeId : options.nodeId.replace('-', ':');
    body.client_meta = { node_id: nid, node_offset: { x: 0, y: 0 } };
  }

  const res = await fetch(`https://api.figma.com/v1/files/${fileKey}/comments`, {
    method: 'POST',
    headers: {
      'X-Figma-Token': token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Figma API ${res.status}: ${text}`);
  }

  const comment = await res.json() as { id: string; message: string };
  return JSON.stringify({ id: comment.id, message: comment.message, status: 'posted' });
}

// ---- Get Page Info ----

export async function getPageInfo(): Promise<string> {
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
