import { Bell, CalendarClock, ExternalLink, ListChecks } from 'lucide-react';
import { useToast } from '@/providers/ToastProvider';

const FEATURES = [
  {
    icon: ListChecks,
    title: 'Today & tomorrow at a glance',
    body: 'Past, happening now, and upcoming meetings with clear status indicators.'
  },
  {
    icon: ExternalLink,
    title: 'One-click join',
    body: 'Open the meeting link straight in your default browser.'
  },
  {
    icon: Bell,
    title: 'Heads-up alerts',
    body: 'A “meeting in 1 minute” banner flies in no matter which screen you’re on.'
  }
];

/**
 * Intro / connect state for the Meetings & Notes feature. Real Google Calendar sync, join links, and
 * the global meeting alerts are wired after the OAuth subsystem is designed — for now this explains
 * the feature and offers the (not-yet-live) connect action.
 */
export function MeetingsScreen() {
  const { pushToast } = useToast();

  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center gap-8 px-6 py-12 text-center">
      <div className="flex flex-col items-center gap-4">
        <div
          className="flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-surface-1"
          aria-hidden
        >
          <CalendarClock size={30} className="text-accent" />
        </div>
        <h2 className="text-2xl font-semibold tracking-tight text-text-primary">
          Meetings & Notes
        </h2>
        <p className="max-w-md text-sm leading-relaxed text-text-secondary">
          Connect your Google account and Oplyr keeps your calendar in view while you work — so you
          never miss a call you&apos;re heads-down through.
        </p>
      </div>

      <div className="grid w-full gap-3 sm:grid-cols-3">
        {FEATURES.map((feature) => (
          <div
            key={feature.title}
            className="flex flex-col items-center gap-2 rounded-[var(--radius-panel)] border border-border bg-surface-1 p-4 text-center"
          >
            <feature.icon size={18} className="text-accent" />
            <p className="text-sm font-medium text-text-primary">{feature.title}</p>
            <p className="text-xs leading-relaxed text-text-tertiary">{feature.body}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col items-center gap-2">
        <button
          type="button"
          onClick={() =>
            pushToast(
              'info',
              'Google sign-in coming soon',
              'Calendar connect lands in an upcoming beta build.'
            )
          }
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-surface-1 px-5 py-2.5 text-sm font-semibold text-text-primary transition-colors hover:bg-surface-2"
        >
          <span className="font-bold text-accent">G</span>
          Connect your Google account
        </button>
        <span className="text-xs text-text-tertiary">Google sign-in is coming soon.</span>
      </div>
    </div>
  );
}
