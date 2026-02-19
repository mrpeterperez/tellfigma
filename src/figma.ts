// ============================================================
// Figma CDP Connection & Helpers
// Manages Chrome DevTools Protocol connection and provides
// core functions for executing code, taking screenshots, etc.
// ============================================================

import CDP from 'chrome-remote-interface';
import { findFigmaTab } from './chrome.js';

// ---- State ----
let cdpClient: CDP.Client | null = null;
let chromePort: number = 9222;
let lastTabUrl: string | null = null;

// ---- Logging (stderr so it doesn't interfere with MCP stdio) ----
export function log(msg: string) {
  process.stderr.write(`[tellfigma] ${msg}\n`);
}

// ---- Port configuration ----
export function setChromePort(port: number) {
  chromePort = port;
}

// ---- CDP Connection (auto-reconnect) ----

export async function ensureConnected(): Promise<CDP.Client> {
  if (cdpClient) {
    try {
      // Test if connection is still alive
      await cdpClient.Runtime.evaluate({ expression: '1+1' });
      return cdpClient;
    } catch {
      log('Connection lost, reconnecting...');
      try { cdpClient.close(); } catch {}
      cdpClient = null;
    }
  }

  // Retry logic — Figma tab may take a moment after page load
  let tab = null;
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

  log(`Connecting to Figma tab: ${tab.title}`);
  lastTabUrl = tab.url;
  cdpClient = await CDP({
    port: chromePort,
    target: tab.webSocketDebuggerUrl,
  });

  await cdpClient.Runtime.enable();
  await cdpClient.Page.enable();

  // Auto-reconnect on disconnect
  cdpClient.on('disconnect', () => {
    log('CDP disconnected — will reconnect on next tool call');
    cdpClient = null;
  });

  return cdpClient;
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
