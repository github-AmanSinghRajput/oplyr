import path from 'node:path';
import process from 'node:process';
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { accessSync, appendFileSync, constants as fsConstants, realpathSync, statSync } from 'node:fs';
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  shell,
  session,
  type OpenDialogOptions
} from 'electron';
import * as pty from 'node-pty';
import { resolveLocalApiAuthToken } from './local-api-auth.js';
import {
  setupAutoUpdater,
  checkForUpdatesNow,
  quitAndInstallUpdate,
  getUpdateStatus
} from './auto-update.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isDevelopment = !app.isPackaged;
const apiBaseUrl = process.env.ELECTRON_API_BASE_URL ?? 'http://127.0.0.1:8787';
const rendererUrl = process.env.ELECTRON_RENDERER_URL ?? 'http://localhost:5173';
const trustedDevOrigin = new URL(rendererUrl).origin;
const packagedRendererUrl = pathToFileURL(
  path.join(__dirname, '../../web/dist/index.html')
).toString();
const openDevTools = process.env.ELECTRON_OPEN_DEVTOOLS === 'true';

app.setName('Oplyr');
app.setPath('userData', path.join(app.getPath('appData'), 'Oplyr'));

type ApiOwner = 'electron' | 'external' | 'none';
type ApiPhase = 'idle' | 'starting' | 'running' | 'failed' | 'stopped';

interface DesktopRuntimeStatus {
  isDesktop: true;
  isDevelopment: boolean;
  apiBaseUrl: string;
  apiOwner: ApiOwner;
  apiPhase: ApiPhase;
  apiReachable: boolean;
  apiPid: number | null;
  apiError: string | null;
}

let mainWindow: BrowserWindow | null = null;
let apiProcess: ChildProcess | null = null;
let apiProcessOwnedByElectron = false;
let runtimeStatus: DesktopRuntimeStatus = {
  isDesktop: true,
  isDevelopment,
  apiBaseUrl,
  apiOwner: 'none',
  apiPhase: 'idle',
  apiReachable: false,
  apiPid: null,
  apiError: null
};

const ptyProcesses = new Map<string, pty.IPty>();
let ptyIdCounter = 0;

function getRuntimeAppRoot() {
  return path.join(__dirname, '../../..');
}

function getRuntimeModelsDir() {
  const configuredModelsDir = process.env.OPLYR_LOCAL_MODELS_DIR?.trim();
  if (configuredModelsDir) {
    return configuredModelsDir;
  }

  if (isDevelopment) {
    return path.join(getRuntimeAppRoot(), 'local-models');
  }

  return path.join(app.getPath('userData'), 'models');
}

function getBundledModelSeedDir() {
  const configuredSeedDir = process.env.OPLYR_MODEL_SEED_DIR?.trim();
  if (configuredSeedDir) {
    return configuredSeedDir;
  }

  if (isDevelopment) {
    return path.join(getRuntimeAppRoot(), 'local-models');
  }

  return path.join(process.resourcesPath, 'local-models');
}

function getRuntimeScriptDir() {
  const configuredScriptRoot = process.env.OPLYR_SCRIPT_ROOT?.trim();
  if (configuredScriptRoot) {
    return configuredScriptRoot;
  }

  return isDevelopment
    ? path.join(getRuntimeAppRoot(), 'apps/api/scripts')
    : path.join(process.resourcesPath, 'apps/api/scripts');
}

function isTrustedRendererUrl(url: string) {
  if (!url) {
    return false;
  }

  if (isDevelopment) {
    // Exact origin match — a prefix check would also accept http://localhost:5173.evil.com etc.
    try {
      return new URL(url).origin === trustedDevOrigin;
    } catch {
      return false;
    }
  }

  return url === packagedRendererUrl;
}

function assertTrustedSender(senderUrl: string) {
  if (!isTrustedRendererUrl(senderUrl)) {
    throw new Error('Untrusted renderer origin.');
  }
}

function getSenderUrl(event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent) {
  return event.senderFrame?.url ?? event.sender.getURL();
}

function isTrustedMediaOrigin(originOrUrl: string) {
  if (!originOrUrl) {
    return false;
  }

  if (isDevelopment) {
    try {
      return new URL(originOrUrl).origin === trustedDevOrigin;
    } catch {
      return false;
    }
  }

  // The packaged renderer is served from file:// (an opaque origin) and no other file:// content is
  // ever loaded (navigation is locked to the packaged renderer), so this is the only mic surface.
  return originOrUrl.startsWith('file://');
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 960,
    minWidth: 1200,
    minHeight: 760,
    backgroundColor: '#0b0d11',
    title: 'Oplyr',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Only ever hand http(s) links to the OS. Without this, renderer-originated `window.open` of
    // file:/, custom app schemes (vscode:, x-…:), etc. would be launched via the OS handler — a
    // classic openExternal-to-local-app abuse if the renderer is ever tricked into opening one.
    try {
      const { protocol } = new URL(url);
      if (protocol === 'https:' || protocol === 'http:') {
        void shell.openExternal(url);
      }
    } catch {
      /* malformed URL — ignore */
    }
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isTrustedRendererUrl(url)) {
      event.preventDefault();
    }
  });
  // Same lock for subframe navigations (top-level `will-navigate` doesn't cover iframes), so injected
  // or dependency-created frames can't navigate to attacker content.
  mainWindow.webContents.on('will-frame-navigate', (event) => {
    if (!isTrustedRendererUrl(event.url)) {
      event.preventDefault();
    }
  });
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow?.webContents.setZoomFactor(1);
  });

  if (isDevelopment) {
    void mainWindow.loadURL(rendererUrl);
    if (openDevTools) {
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
    return;
  }

  void mainWindow.loadFile(path.join(__dirname, '../../web/dist/index.html'));
}

async function isApiReachable() {
  try {
    const response = await fetch(`${apiBaseUrl}/api/health/live`);
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForApiHealthy(timeoutMs: number) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (await isApiReachable()) {
      return true;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 250);
    });
  }

  return false;
}

async function getRuntimeStatus() {
  const reachable = await isApiReachable();

  runtimeStatus = {
    ...runtimeStatus,
    apiReachable: reachable,
    apiPhase: reachable
      ? 'running'
      : apiProcessOwnedByElectron && apiProcess
        ? runtimeStatus.apiPhase
        : runtimeStatus.apiPhase === 'failed'
          ? 'failed'
          : 'stopped'
  };

  return runtimeStatus;
}

function publishRuntimeStatus() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.webContents.send('desktop:runtime-status', runtimeStatus);
}

function setRuntimeStatus(patch: Partial<DesktopRuntimeStatus>) {
  runtimeStatus = {
    ...runtimeStatus,
    ...patch
  };
  publishRuntimeStatus();
}

// Append the forked API's output to a log file in userData (and echo to the main process's stderr,
// visible when the app is launched from a terminal), so a packaged-API startup failure is diagnosable.
function appendApiLog(text: string) {
  try {
    appendFileSync(path.join(app.getPath('userData'), 'api-child.log'), text);
  } catch {
    /* logging must never crash startup */
  }
  process.stderr.write(`[api] ${text}`);
}

function attachApiLogging(child: ChildProcess) {
  child.stdout?.on('data', (d: Buffer) => appendApiLog(d.toString()));
  child.stderr?.on('data', (d: Buffer) => appendApiLog(d.toString()));
  child.on('error', (err) => appendApiLog(`[spawn-error] ${err.stack ?? String(err)}\n`));
}

function getPackagedApiEntry() {
  // esbuild bundle of the API (better-sqlite3 kept external), shipped under resources/api by
  // electron-builder (docs/DISTRIBUTION.md Phase 2).
  return path.join(process.resourcesPath, 'api', 'server.mjs');
}

function getPackagedSttBinary() {
  // Native oplyr-stt binary, shipped under resources/stt by electron-builder.
  return path.join(process.resourcesPath, 'stt', 'oplyr-stt');
}

function buildApiEnv(): NodeJS.ProcessEnv {
  const shared: NodeJS.ProcessEnv = {
    ...process.env,
    API_HOST: '127.0.0.1',
    LOCAL_API_AUTH_TOKEN: process.env.LOCAL_API_AUTH_TOKEN ?? '',
    OPLYR_APP_ROOT: getRuntimeAppRoot(),
    OPLYR_USER_DATA_DIR: app.getPath('userData'),
    OPLYR_LOCAL_MODELS_DIR: getRuntimeModelsDir(),
    OPLYR_MODEL_SEED_DIR: getBundledModelSeedDir(),
    OPLYR_SCRIPT_ROOT: getRuntimeScriptDir()
  };

  if (isDevelopment) {
    return shared;
  }

  // Packaged extras: run as production, keep the DB in writable userData, and point at the bundled
  // STT binary in resources.
  return {
    ...shared,
    NODE_ENV: 'production',
    APP_ENV: 'production',
    RUNTIME_DATABASE_PATH:
      process.env.RUNTIME_DATABASE_PATH ?? path.join(app.getPath('userData'), 'runtime.db'),
    OPLYR_STT_BINARY: process.env.OPLYR_STT_BINARY ?? getPackagedSttBinary(),
    // SQL migrations are shipped as files (not bundled into the JS) — point the API at them.
    OPLYR_MIGRATIONS_DIR: path.join(process.resourcesPath, 'api', 'database', 'sqlite'),
    // Same for the brain's own migrations, else the packaged brain.db is created with zero tables
    // and every capture/recall silently no-ops.
    OPLYR_BRAIN_MIGRATIONS_DIR: path.join(process.resourcesPath, 'api', 'database', 'brain'),
    // On-device embedding model (MiniLM) is shipped in resources; point the brain at it so semantic
    // recall works fully OFFLINE (no download). BRAIN_EMBEDDINGS_ALLOW_DOWNLOAD stays unset, so the
    // packaged app never reaches the network for the model.
    BRAIN_EMBEDDINGS_MODEL_DIR: path.join(process.resourcesPath, 'api', 'models'),
    BRAIN_EMBEDDINGS_CACHE_DIR: path.join(app.getPath('userData'), 'models'),
    // The API bundle keeps better-sqlite3 + @xenova/transformers external; resolve them from the
    // shipped module folder.
    NODE_PATH: path.join(process.resourcesPath, 'api', 'node_modules')
  };
}

function startApiProcess(): ChildProcess {
  if (isDevelopment) {
    const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    return spawn(npmCommand, ['run', 'dev', '--workspace', '@oplyr/runtime'], {
      cwd: getRuntimeAppRoot(),
      stdio: 'inherit',
      env: buildApiEnv()
    });
  }

  // Packaged: run the bundled API with Electron's own Node via ELECTRON_RUN_AS_NODE — no external
  // node/npm needed. We use spawn(execPath, [entry]) rather than fork() to avoid fork's IPC channel
  // (the API is a plain HTTP server, not an IPC child); this matches how it runs standalone.
  // Modules (incl. the better-sqlite3 native addon) resolve from resources/api/node_modules via NODE_PATH.
  const entry = getPackagedApiEntry();
  return spawn(process.execPath, [entry], {
    cwd: path.dirname(entry),
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...buildApiEnv(), ELECTRON_RUN_AS_NODE: '1' }
  });
}

async function ensureLocalApi() {
  if (await isApiReachable()) {
    setRuntimeStatus({
      apiOwner: 'external',
      apiPhase: 'running',
      apiReachable: true,
      apiPid: null,
      apiError: null
    });
    return;
  }

  setRuntimeStatus({
    apiOwner: 'electron',
    apiPhase: 'starting',
    apiReachable: false,
    apiPid: null,
    apiError: null
  });

  // Dev: spawn the workspace dev server. Packaged: run the bundled API with Electron's Node.
  apiProcess = startApiProcess();
  attachApiLogging(apiProcess);
  apiProcessOwnedByElectron = true;

  setRuntimeStatus({
    apiPid: apiProcess.pid ?? null
  });

  apiProcess.once('exit', (code, signal) => {
    apiProcess = null;
    const exitedCleanly = code === 0 || signal === 'SIGTERM';

    setRuntimeStatus({
      apiOwner: 'none',
      apiPhase: exitedCleanly ? 'stopped' : 'failed',
      apiReachable: false,
      apiPid: null,
      apiError: exitedCleanly
        ? null
        : `Local API exited unexpectedly (${code ?? signal ?? 'unknown'}).`
    });
  });

  const ready = await waitForApiHealthy(15_000);
  if (!ready) {
    setRuntimeStatus({
      apiPhase: 'failed',
      apiReachable: false,
      apiError: 'Local API did not become healthy in time.'
    });
    return;
  }

  setRuntimeStatus({
    apiPhase: 'running',
    apiReachable: true,
    apiError: null
  });
}

function stopLocalApi() {
  if (apiProcessOwnedByElectron && apiProcess && !apiProcess.killed) {
    apiProcess.kill('SIGTERM');
  }
}

function resolveShellPath(): string {
  const envShell = process.env.SHELL;
  if (envShell) {
    try {
      accessSync(envShell, fsConstants.X_OK);
      return envShell;
    } catch {
      // fall through
    }
  }

  for (const candidate of ['/bin/zsh', '/bin/bash', '/bin/sh']) {
    try {
      accessSync(candidate, fsConstants.X_OK);
      return candidate;
    } catch {
      continue;
    }
  }

  return '/bin/sh';
}

/**
 * GUI-launched macOS apps (Finder / `open`) inherit a minimal PATH
 * (`/usr/bin:/bin:/usr/sbin:/sbin`) that omits Homebrew, npm-global and nvm bin dirs — so spawned
 * agent CLIs (`codex`, `claude`, `gemini`) can't be found even though they run fine from a terminal.
 * Resolve the user's real login+interactive shell PATH once so the forked API (and everything it
 * spawns) can locate them. Returns null if the shell can't be probed (we then keep the inherited PATH).
 */
function resolveLoginShellPath(): string | null {
  try {
    const shell = resolveShellPath();
    const marker = '__OPLYR_PATH__';
    // Args passed as an array (no shell string) — nothing user-controlled is interpolated.
    const out = execFileSync(shell, ['-ilc', `printf '%s:%s' '${marker}' "$PATH"`], {
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'ignore']
    });
    const idx = out.lastIndexOf(`${marker}:`);
    if (idx === -1) return null;
    const value = out.slice(idx + marker.length + 1).trim();
    return value || null;
  } catch {
    return null;
  }
}

/**
 * Merge the login-shell PATH into the current process env (login-shell entries first), de-duped and
 * order-preserving, so the inherited minimal PATH is a fallback rather than a ceiling.
 */
function fixPackagedPath(): void {
  const loginPath = resolveLoginShellPath();
  if (!loginPath) return;
  const seen = new Set<string>();
  process.env.PATH = [loginPath, process.env.PATH ?? '']
    .join(':')
    .split(':')
    .filter((entry) => entry && !seen.has(entry) && (seen.add(entry), true))
    .join(':');
}

function ensurePtySpawnHelper() {
  const nodePtyDir = path.resolve(__dirname, '../../../node_modules/node-pty');
  const helperPath = path.join(
    nodePtyDir,
    'prebuilds',
    `${process.platform}-${process.arch}`,
    'spawn-helper'
  );
  try {
    const { statSync, chmodSync } = require('node:fs');
    const stat = statSync(helperPath);
    if (!(stat.mode & 0o111)) {
      chmodSync(helperPath, stat.mode | 0o755);
      console.log(`[pty] fixed spawn-helper permissions: ${helperPath}`);
    }
  } catch {
    // prebuild may not exist if compiled from source
  }
}

function resolveValidatedPtyCwd(inputCwd?: string) {
  const homeDir = realpathSync(process.env.HOME ?? '/');
  const resolvedCwd = path.resolve(inputCwd ?? homeDir);
  const realCwd = realpathSync(resolvedCwd);
  const relativeToHome = path.relative(homeDir, realCwd);

  if (relativeToHome === '..' || relativeToHome.startsWith(`..${path.sep}`)) {
    throw new Error('Terminal session cwd must stay inside your home directory.');
  }

  if (!statSync(realCwd).isDirectory()) {
    throw new Error('Terminal session cwd must be a directory.');
  }

  return realCwd;
}

function normalizePtySize(value: number | undefined, fallback: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, Math.round(value!)));
}

function createPtySession(config: { cwd?: string; cols?: number; rows?: number }): string {
  const id = `pty-${++ptyIdCounter}`;
  ensurePtySpawnHelper();
  const shellPath = resolveShellPath();
  const resolvedCwd = resolveValidatedPtyCwd(config.cwd);

  const term = pty.spawn(shellPath, ['-l'], {
    name: 'xterm-256color',
    cols: normalizePtySize(config.cols, 120, 48, 220),
    rows: normalizePtySize(config.rows, 30, 12, 80),
    cwd: resolvedCwd,
    env: {
      ...process.env,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      SHELL: shellPath,
      PATH: process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin'
    } as Record<string, string>
  });

  ptyProcesses.set(id, term);

  term.onData((data) => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return;
    }

    mainWindow.webContents.send('desktop:pty-data', { id, data });
  });

  term.onExit(({ exitCode }) => {
    ptyProcesses.delete(id);
    if (!mainWindow || mainWindow.isDestroyed()) {
      return;
    }

    mainWindow.webContents.send('desktop:pty-exit', { id, exitCode });
  });

  return id;
}

function writePty(id: string, data: string) {
  const term = ptyProcesses.get(id);
  if (term) {
    term.write(data);
  }
}

function resizePty(id: string, cols: number, rows: number) {
  const term = ptyProcesses.get(id);
  if (term) {
    term.resize(cols, rows);
  }
}

function killPty(id: string) {
  const term = ptyProcesses.get(id);
  if (term) {
    term.kill();
    ptyProcesses.delete(id);
  }
}

function killAllPtySessions() {
  for (const [id, term] of ptyProcesses) {
    term.kill();
    ptyProcesses.delete(id);
  }
}

app.whenReady().then(async () => {
  // Packaged GUI launches inherit a stripped PATH; recover the user's real shell PATH so the forked
  // API can find the agent CLIs (codex/claude/gemini). Dev is launched from a terminal (full PATH).
  if (!isDevelopment) {
    fixPackagedPath();
  }

  process.env.LOCAL_API_AUTH_TOKEN = await resolveLocalApiAuthToken(
    process.env.LOCAL_API_AUTH_TOKEN,
    // Packaged: keep the token file in writable userData, not inside the read-only .app bundle.
    isDevelopment ? undefined : path.join(app.getPath('userData'), '.local-api-auth-token')
  );

  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'media' && isTrustedMediaOrigin(webContents.getURL())) {
      callback(true);
      return;
    }

    callback(false);
  });

  session.defaultSession.setPermissionCheckHandler((_webContents, permission, requestingOrigin) => {
    if (permission === 'media' && isTrustedMediaOrigin(requestingOrigin)) {
      return true;
    }

    return false;
  });

  ipcMain.handle('desktop:get-runtime-status', async (event) => {
    assertTrustedSender(getSenderUrl(event));
    return getRuntimeStatus();
  });
  ipcMain.handle('desktop:pick-project-folder', async (event) => {
    assertTrustedSender(getSenderUrl(event));
    const targetWindow = mainWindow ?? BrowserWindow.getFocusedWindow();
    const dialogOptions: OpenDialogOptions = {
      title: 'Choose project folder',
      properties: ['openDirectory']
    };
    const result = targetWindow
      ? await dialog.showOpenDialog(targetWindow, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions);

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0] ?? null;
  });
  ipcMain.handle(
    'desktop:pty-create',
    (event, config: { cwd?: string; cols?: number; rows?: number }) => {
      assertTrustedSender(getSenderUrl(event));
      try {
        return createPtySession(config);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[pty] failed to create session: ${msg}`);
        throw new Error(`Terminal session failed: ${msg}`);
      }
    }
  );
  ipcMain.on('desktop:pty-write', (event, payload: { id: string; data: string }) => {
    assertTrustedSender(getSenderUrl(event));
    if (typeof payload?.id !== 'string' || typeof payload?.data !== 'string') {
      return;
    }
    writePty(payload.id, payload.data.slice(0, 8192));
  });
  ipcMain.on('desktop:pty-resize', (event, payload: { id: string; cols: number; rows: number }) => {
    assertTrustedSender(getSenderUrl(event));
    if (typeof payload?.id !== 'string') {
      return;
    }
    resizePty(
      payload.id,
      normalizePtySize(payload.cols, 120, 48, 220),
      normalizePtySize(payload.rows, 30, 12, 80)
    );
  });
  ipcMain.handle('desktop:pty-kill', (event, id: string) => {
    assertTrustedSender(getSenderUrl(event));
    killPty(id);
    return true;
  });

  // ── Auto-update ────────────────────────────────────────────────────────────
  ipcMain.handle('desktop:get-app-version', (event) => {
    assertTrustedSender(getSenderUrl(event));
    return app.getVersion();
  });
  ipcMain.handle('desktop:update-get-status', (event) => {
    assertTrustedSender(getSenderUrl(event));
    return getUpdateStatus();
  });
  ipcMain.handle('desktop:update-check', (event) => {
    assertTrustedSender(getSenderUrl(event));
    return checkForUpdatesNow();
  });
  ipcMain.handle('desktop:update-install', (event) => {
    assertTrustedSender(getSenderUrl(event));
    return quitAndInstallUpdate();
  });
  setupAutoUpdater(() => mainWindow);

  void ensureLocalApi().finally(() => {
    createWindow();
    publishRuntimeStatus();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
      publishRuntimeStatus();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  killAllPtySessions();
  stopLocalApi();
});
