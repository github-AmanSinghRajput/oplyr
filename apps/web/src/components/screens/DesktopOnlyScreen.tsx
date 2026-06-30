import { Monitor } from 'lucide-react';

// Where browser visitors are sent to get the real app (invite-only beta lives at the #beta section).
const OPLYR_SITE_URL = 'https://www.oplyr.com/#beta';

/**
 * Shown when the web bundle is loaded in a plain browser instead of the Oplyr desktop shell.
 * Oplyr is desktop-only — voice, the terminal, the local workspace, and the runtime bridge don't
 * exist in a browser tab — so we refuse to mount the app and point people to the desktop build.
 */
export function DesktopOnlyScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6 text-text-primary">
      <div className="flex max-w-md flex-col items-center gap-5 text-center">
        <div
          className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-surface-1"
          aria-hidden
        >
          <Monitor size={26} className="text-text-secondary" />
        </div>

        <h1 className="text-xl font-semibold tracking-tight">Oplyr runs as a desktop app</h1>

        <p className="text-sm leading-relaxed text-text-secondary">
          Voice, the built-in terminal, and your local project workspace aren&apos;t available in a
          web browser. Open Oplyr from the desktop app to keep going.
        </p>

        <a
          href={OPLYR_SITE_URL}
          className="mt-1 inline-flex items-center justify-center rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-background transition-opacity hover:opacity-90"
        >
          Get Oplyr for Mac
        </a>

        <p className="text-xs text-text-tertiary">
          Already installed? Launch the Oplyr app from your Applications folder.
        </p>
      </div>
    </div>
  );
}
