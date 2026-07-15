import { app, type BrowserWindow } from 'electron';
import electronUpdater, { type UpdateInfo, type ProgressInfo } from 'electron-updater';
import log from 'electron-log';

const { autoUpdater } = electronUpdater;

// The renderer-facing update state. One object, pushed on every transition + readable on demand, so
// the banner can render from a single source of truth.
export type UpdateStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'none' }
  | { state: 'available'; version: string; notes?: string }
  | { state: 'downloading'; version: string; percent: number }
  | { state: 'ready'; version: string; notes?: string }
  | { state: 'error'; message: string };

let status: UpdateStatus = { state: 'idle' };
let getWindowRef: (() => BrowserWindow | null) | null = null;

export function getUpdateStatus(): UpdateStatus {
  return status;
}

function setStatus(next: UpdateStatus) {
  status = next;
  const win = getWindowRef?.();
  if (win && !win.isDestroyed()) {
    win.webContents.send('desktop:update-status', next);
  }
}

// electron-updater's releaseNotes can be a string or an array of { version, note }. Flatten to a
// short plain-text blurb for the banner; never trust it to be huge.
function normalizeNotes(notes: unknown): string | undefined {
  if (!notes) return undefined;
  if (typeof notes === 'string') return notes.replace(/<[^>]+>/g, '').trim().slice(0, 1500) || undefined;
  if (Array.isArray(notes)) {
    const text = notes
      .map((n) => (n && typeof n === 'object' && 'note' in n ? String((n as { note?: unknown }).note ?? '') : ''))
      .join('\n')
      .replace(/<[^>]+>/g, '')
      .trim();
    return text.slice(0, 1500) || undefined;
  }
  return undefined;
}

/**
 * Wire electron-updater to the given window. Auto-update only runs in a packaged, code-signed build
 * (macOS refuses to apply updates to an unsigned/dev app). Downloads happen in the background; the
 * renderer decides when to prompt "restart to update". Safe to call once from app.whenReady().
 */
export function setupAutoUpdater(getWindow: () => BrowserWindow | null) {
  getWindowRef = getWindow;

  if (!app.isPackaged) {
    // Dev: no feed, no signing — leave status idle so the banner never shows.
    return;
  }

  autoUpdater.logger = log;
  autoUpdater.autoDownload = true; // fetch the update in the background as soon as one is found
  autoUpdater.autoInstallOnAppQuit = true; // if the user just quits, apply it on next launch

  autoUpdater.on('checking-for-update', () => setStatus({ state: 'checking' }));
  autoUpdater.on('update-available', (info: UpdateInfo) =>
    setStatus({ state: 'available', version: info.version, notes: normalizeNotes(info.releaseNotes) })
  );
  autoUpdater.on('update-not-available', () => setStatus({ state: 'none' }));
  autoUpdater.on('download-progress', (progress: ProgressInfo) =>
    setStatus({
      state: 'downloading',
      version: (status.state === 'available' || status.state === 'downloading' ? status.version : '') || '',
      percent: Math.max(0, Math.min(100, Math.round(progress.percent)))
    })
  );
  autoUpdater.on('update-downloaded', (info: UpdateInfo) =>
    setStatus({ state: 'ready', version: info.version, notes: normalizeNotes(info.releaseNotes) })
  );
  autoUpdater.on('error', (error: Error) => {
    log.warn('auto-update error', error);
    setStatus({ state: 'error', message: error?.message ?? 'Update failed.' });
  });

  // Check shortly after launch (don't contend with startup) and periodically after that.
  const check = () => {
    autoUpdater.checkForUpdates().catch((error: unknown) => log.warn('auto-update check failed', error));
  };
  setTimeout(check, 8000);
  setInterval(check, 6 * 60 * 60 * 1000);
}

/** Manual "check for updates" (Settings button). Returns the current status immediately. */
export function checkForUpdatesNow(): UpdateStatus {
  if (app.isPackaged) {
    autoUpdater.checkForUpdates().catch((error: unknown) => log.warn('auto-update manual check failed', error));
  }
  return status;
}

/** Quit and apply a downloaded update. No-op unless an update is actually ready. */
export function quitAndInstallUpdate(): boolean {
  if (!app.isPackaged || status.state !== 'ready') {
    return false;
  }
  // Defer a tick so the IPC reply is flushed before the app quits.
  setImmediate(() => autoUpdater.quitAndInstall());
  return true;
}
