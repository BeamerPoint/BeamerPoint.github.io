/*
 * BeamerPoint
 *
 * Author: Abolfazl Mohebbi, PhD
 *         Professor in Mechanical and Biomedical Engineering,
 *         Polytechnique Montreal
 *         abolfazl.mohebbi@polymtl.ca
 */

import { app, BrowserWindow, dialog, net, protocol, session, shell } from 'electron';
import { autoUpdater } from 'electron-updater';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * The desktop shell: the web app, unchanged, in its own Chromium.
 *
 * Electron rather than Tauri because the app was built and tested in Chromium, uses the
 * File System Access API for "Save to file" (Chromium only), and runs a 32 MB WASM TeX
 * engine that WebKit, the webview Tauri would use on macOS and Linux, has never been
 * tried with.
 *
 * The app is served from a privileged `app://` scheme rather than `file://`: a Worker,
 * `fetch`, streaming WASM compilation and IndexedDB all need a real, secure origin, and
 * the TeX engine uses every one of them. The engine (worker and WASM, ~35 MB) is bundled;
 * the ~540 MB of TeX Live data is fetched on first use from the web site and cached, the
 * same as in a browser -- the web build baked its URL in as VITE_TEX_DATA_URL.
 */

const SCHEME = 'app';
const HOST = 'bp';
const ORIGIN = `${SCHEME}://${HOST}`;

protocol.registerSchemesAsPrivileged([{
  scheme: SCHEME,
  privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
}]);

/** The built web app: bundled into the package, or the workspace's own build in development. */
function webRoot(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'web')
    : path.resolve(__dirname, '..', '..', 'app', 'dist');
}

const MIME: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.wasm': 'application/wasm', // WebAssembly.compileStreaming insists on this
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
};

function serveApp(): void {
  const root = webRoot();
  protocol.handle(SCHEME, async (request) => {
    const url = new URL(request.url);
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
    const file = path.normalize(path.join(root, rel));
    // Never outside the app: `app://bp/../../secrets` must not reach the disk.
    if (file !== root && !file.startsWith(root + path.sep)) {
      return new Response('Forbidden', { status: 403 });
    }
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
      return new Response('Not found', { status: 404 });
    }
    const res = await net.fetch(pathToFileURL(file).toString());
    const type = MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
    return new Response(res.body, { status: 200, headers: { 'content-type': type } });
  });
}

/* ------------------------------------------------------------ window state */

interface Bounds { x?: number; y?: number; width: number; height: number; maximized?: boolean }

const stateFile = (): string => path.join(app.getPath('userData'), 'window.json');

function loadBounds(): Bounds {
  try {
    return JSON.parse(fs.readFileSync(stateFile(), 'utf8')) as Bounds;
  } catch {
    return { width: 1440, height: 900 };
  }
}

function saveBounds(win: BrowserWindow): void {
  try {
    const b = win.getNormalBounds();
    fs.writeFileSync(stateFile(), JSON.stringify({ ...b, maximized: win.isMaximized() }));
  } catch {
    // Not remembering the window size is not worth an error.
  }
}

/* ------------------------------------------------------------------ window */

function createWindow(): void {
  const saved = loadBounds();
  const win = new BrowserWindow({
    ...saved,
    minWidth: 800,
    minHeight: 500,
    title: 'BeamerPoint',
    backgroundColor: '#ffffff',
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // The app needs no bridge to Node: it is the web app, running as it does in a browser.
    },
  });
  if (saved.maximized === true) win.maximize();
  win.once('ready-to-show', () => win.show());
  win.on('close', () => saveBounds(win));

  // The app never navigates; anything that tries is a link, and links open in the browser.
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(ORIGIN)) {
      e.preventDefault();
      if (/^https?:/.test(url)) void shell.openExternal(url);
    }
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });

  void win.loadURL(`${ORIGIN}/index.html`);
}

/* ----------------------------------------------------------------- updates */

/**
 * Windows and Linux update themselves from GitHub Releases. An UNSIGNED macOS app cannot
 * install an update (Squirrel.Mac requires a signature), so there the user is told a new
 * version exists and pointed at the download.
 */
/** The releases page, from the `app-update.yml` electron-builder writes into the package. */
function releasesUrl(): string {
  try {
    const yml = fs.readFileSync(path.join(process.resourcesPath, 'app-update.yml'), 'utf8');
    const owner = /^owner:\s*(.+)$/m.exec(yml)?.[1]?.trim();
    const repo = /^repo:\s*(.+)$/m.exec(yml)?.[1]?.trim();
    if (owner && repo) return `https://github.com/${owner}/${repo}/releases/latest`;
  } catch {
    // Fall through to the generic page.
  }
  return 'https://github.com';
}

function checkForUpdates(): void {
  if (!app.isPackaged) return;
  if (process.platform === 'darwin') {
    autoUpdater.autoDownload = false;
    autoUpdater.on('update-available', (info) => {
      void dialog.showMessageBox({
        type: 'info',
        message: `BeamerPoint ${info.version} is available.`,
        detail: 'Download it from the releases page to update.',
        buttons: ['Open releases page', 'Later'],
      }).then(({ response }) => {
        if (response === 0) void shell.openExternal(releasesUrl());
      });
    });
    void autoUpdater.checkForUpdates().catch(() => undefined);
    return;
  }
  void autoUpdater.checkForUpdatesAndNotify().catch(() => undefined);
}

/* --------------------------------------------------------------------- app */

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const [win] = BrowserWindow.getAllWindows();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  void app.whenReady().then(() => {
    serveApp();
    // "Save to file" uses the File System Access API, which asks for this permission.
    session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
      callback(permission === 'fileSystem' || permission === 'clipboard-sanitized-write');
    });
    createWindow();
    checkForUpdates();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
