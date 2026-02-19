// ============================================================
// Chrome Launcher — Launch & connect to Chrome with CDP
// ============================================================

import { spawn, execSync, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';

const DEFAULT_PORT = 9222;
const DEBUG_PROFILE = join(homedir(), '.tellfigma-chrome-profile');

/** Get Chrome path based on OS */
function getChromePath(): string {
  const os = platform();

  if (os === 'darwin') {
    const paths = [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
    ];
    for (const p of paths) {
      if (existsSync(p)) return p;
    }
    throw new Error(
      'Chrome not found. Install Google Chrome or set CHROME_PATH environment variable.'
    );
  }

  if (os === 'win32') {
    const paths = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    ];
    for (const p of paths) {
      if (existsSync(p)) return p;
    }
    throw new Error('Chrome not found. Install Google Chrome or set CHROME_PATH.');
  }

  // Linux
  try {
    return execSync('which google-chrome || which google-chrome-stable || which chromium-browser')
      .toString()
      .trim()
      .split('\n')[0];
  } catch {
    throw new Error(
      'Chrome not found. Install google-chrome or set CHROME_PATH environment variable.'
    );
  }
}

/** Check if a debug port is already active */
async function isPortActive(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/version`);
    return res.ok;
  } catch {
    return false;
  }
}

/** Wait for Chrome debug port to become available */
async function waitForPort(port: number, timeoutMs = 15000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isPortActive(port)) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(
    `Chrome debug port ${port} didn't become available within ${timeoutMs / 1000}s`
  );
}

export interface ChromeConnection {
  port: number;
  process: ChildProcess | null;
  /** Whether we launched Chrome or connected to existing */
  launched: boolean;
}

/**
 * Launch Chrome with remote debugging enabled, or connect to existing.
 * Uses a separate user profile so normal Chrome is untouched.
 */
export async function launchChrome(
  port: number = DEFAULT_PORT
): Promise<ChromeConnection> {
  // Check if Chrome is already running with debug port
  if (await isPortActive(port)) {
    log(`Connected to existing Chrome on port ${port}`);
    return { port, process: null, launched: false };
  }

  const chromePath = process.env.CHROME_PATH || getChromePath();
  log(`Launching Chrome with debug port ${port}...`);

  const child = spawn(
    chromePath,
    [
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${DEBUG_PROFILE}`,
      '--no-first-run',
      '--no-default-browser-check',
      'https://www.figma.com',
    ],
    {
      stdio: 'ignore',
      detached: true,
    }
  );

  // Don't let Chrome block our process exit
  child.unref();

  // Wait for debug port
  await waitForPort(port);
  log(`Chrome running on port ${port}`);

  return { port, process: child, launched: true };
}

/** Find the Figma tab among Chrome's open pages */
export async function findFigmaTab(port: number): Promise<{
  id: string;
  title: string;
  url: string;
  webSocketDebuggerUrl: string;
} | null> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json`);
    const pages = (await res.json()) as Array<{
      id: string;
      title: string;
      url: string;
      type: string;
      webSocketDebuggerUrl: string;
    }>;

    // Find the Figma design tab (not just figma.com homepage)
    const figmaTab =
      pages.find(
        (p) => p.type === 'page' && p.url.includes('figma.com/design')
      ) ||
      pages.find(
        (p) => p.type === 'page' && p.url.includes('figma.com/file')
      ) ||
      pages.find(
        (p) => p.type === 'page' && p.url.includes('figma.com/board')
      ) ||
      pages.find(
        (p) => p.type === 'page' && p.url.includes('figma.com')
      );

    return figmaTab || null;
  } catch {
    return null;
  }
}

function log(msg: string) {
  process.stderr.write(`[tellfigma] ${msg}\n`);
}
