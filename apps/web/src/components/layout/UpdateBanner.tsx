import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import type { DesktopUpdateStatus } from '@/desktop-shell';

// "update" = a patch (bug fixes); "upgrade" = a minor/major (new features). Derive from semver so the
// banner's wording matches what actually changed, per the product's update-vs-upgrade distinction.
function changeKind(current: string | null, next: string): 'update' | 'upgrade' {
  if (!current || !next) return 'update';
  const parse = (v: string) => v.split(/[.+-]/).map((p) => Number.parseInt(p, 10) || 0);
  const c = parse(current);
  const n = parse(next);
  if ((n[0] ?? 0) !== (c[0] ?? 0) || (n[1] ?? 0) !== (c[1] ?? 0)) return 'upgrade';
  return 'update';
}

/**
 * Floating "a new version is available / ready to install" banner for the packaged desktop app.
 * Renders nothing in the browser (no desktopShell) or while idle. Reads the live update status
 * pushed from the Electron main process (electron-updater); "ready" shows a Restart action.
 */
export function UpdateBanner() {
  const shell = typeof window !== 'undefined' ? window.desktopShell : undefined;
  const [status, setStatus] = useState<DesktopUpdateStatus>({ state: 'idle' });
  const [version, setVersion] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (!shell?.subscribeUpdateStatus) return undefined;
    let active = true;
    void shell
      .getAppVersion?.()
      .then((v) => active && setVersion(v))
      .catch(() => {});
    void shell
      .getUpdateStatus?.()
      .then((s) => active && setStatus(s))
      .catch(() => {});
    const unsubscribe = shell.subscribeUpdateStatus((next) => {
      setStatus(next);
      setDismissed(false); // a new transition (e.g. download finished) re-surfaces the banner
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [shell]);

  if (!shell) return null;

  const actionable =
    status.state === 'available' || status.state === 'downloading' || status.state === 'ready';
  const show = actionable && !dismissed;
  const noun =
    actionable && changeKind(version, status.version) === 'upgrade' ? 'upgrade' : 'update';

  const install = async () => {
    setInstalling(true);
    try {
      await shell.installUpdate?.();
    } catch {
      setInstalling(false);
    }
  };

  return (
    <AnimatePresence>
      {show ? (
        <motion.div
          key="update-banner"
          initial={{ opacity: 0, y: -18 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -18 }}
          transition={{ type: 'spring', stiffness: 320, damping: 26 }}
          className="fixed left-1/2 top-4 z-[60] flex max-w-[92vw] -translate-x-1/2 items-center gap-3 rounded-[var(--radius-control)] border border-border bg-surface-1 px-4 py-2.5 text-sm shadow-xl"
          role="status"
          aria-live="polite"
        >
          <div className="text-text-primary">
            {status.state === 'ready' ? (
              <>
                A new {noun}
                {status.version ? ` (${status.version})` : ''} is ready to install.
              </>
            ) : status.state === 'downloading' ? (
              <>
                Downloading {noun}
                {status.version ? ` ${status.version}` : ''}… {status.percent}%
              </>
            ) : (
              <>
                A new {noun}
                {status.version ? ` (${status.version})` : ''} is available — downloading in the
                background.
              </>
            )}
          </div>
          {status.state === 'ready' ? (
            <div className="flex flex-none items-center gap-1.5">
              <Button size="sm" onClick={() => void install()} disabled={installing}>
                {installing ? 'Restarting…' : `Restart to ${noun}`}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setDismissed(true)}>
                Later
              </Button>
            </div>
          ) : null}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
