import { app, powerMonitor, type BrowserWindow } from 'electron';
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
/**
 * How often a running app looks for a new release.
 *
 * Deliberately short. The feed is `github.com/<owner>/<repo>/releases.atom` — a few KB of Atom,
 * served by github.com rather than `api.github.com`, so the 60-requests-per-hour REST limit does
 * not apply and a per-minute poll is the same load as an ordinary feed reader.
 *
 * The reason it matters: a release that fixes a build which cannot start is only useful if it
 * reaches people quickly, and those users cannot help themselves — a broken app looks like a broken
 * app, not like something to wait out. This used to be six hours, which meant the only reliable
 * recovery was quitting and relaunching until it happened to check.
 */
const UPDATE_CHECK_INTERVAL_MS = 60 * 1000;
/** Back off after consecutive failures so an outage is not polled once a minute forever. */
const MAX_BACKOFF_MS = 15 * 60 * 1000;
/** Don't re-check more than this often just because the window regained focus. */
const FOCUS_CHECK_DEBOUNCE_MS = 30 * 1000;

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

  // Check shortly after launch (don't contend with startup), then on a cadence that matches how
  // often early access actually ships. Six hours meant a release could sit unseen for most of a
  // day, and the only way to get it was to quit and relaunch — which is exactly what users
  // reported doing, repeatedly.
  // A self-rescheduling timer rather than setInterval, so a failing feed can back off and a
  // finished download can stop the polling entirely.
  let consecutiveFailures = 0;
  let timer: NodeJS.Timeout | undefined;

  const scheduleNext = () => {
    if (timer) clearTimeout(timer);
    // Once an update is downloaded there is nothing left to look for; it applies on quit.
    if (status.state === 'ready') return;
    const backoff = Math.min(
      UPDATE_CHECK_INTERVAL_MS * 2 ** consecutiveFailures,
      MAX_BACKOFF_MS
    );
    timer = setTimeout(check, backoff);
  };

  const check = () => {
    autoUpdater
      .checkForUpdates()
      .then(() => {
        consecutiveFailures = 0;
      })
      .catch((error: unknown) => {
        consecutiveFailures += 1;
        log.warn('auto-update check failed', error);
      })
      .finally(scheduleNext);
  };

  // Tracked in `timer` like every other scheduled check, so a focus or resume check that lands
  // first cancels it instead of leaving two chains running in parallel.
  timer = setTimeout(check, 8000);

  const checkNow = () => {
    consecutiveFailures = 0;
    if (timer) clearTimeout(timer);
    check();
  };

  // Coming back to the app is when a user expects it to have noticed. Debounced, so tabbing in and
  // out does not hammer the feed.
  let lastFocusCheck = 0;
  app.on('browser-window-focus', () => {
    const now = Date.now();
    if (now - lastFocusCheck < FOCUS_CHECK_DEBOUNCE_MS) return;
    lastFocusCheck = now;
    checkNow();
  });

  // Timers do not fire while the machine is asleep, so a laptop opened after a night away would
  // otherwise wait out a full interval before looking.
  powerMonitor.on('resume', checkNow);
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
