import type { LucideIcon } from 'lucide-react';

interface StandbyScreenProps {
  icon: LucideIcon;
  title: string;
  description: string;
  /** Small dimmed line under the description, e.g. a "coming soon" note. */
  footnote?: string;
}

/** Placeholder screen for features that are scaffolded in the nav but not built yet. */
export function StandbyScreen({ icon: Icon, title, description, footnote }: StandbyScreenProps) {
  return (
    <div className="flex h-[calc(100vh-var(--topbar-height)-120px)] min-h-[400px] flex-col items-center justify-center px-6 text-center">
      <div className="flex max-w-md flex-col items-center gap-4">
        <div
          className="flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-surface-1"
          aria-hidden
        >
          <Icon size={30} className="text-accent" />
        </div>
        <h2 className="text-xl font-semibold tracking-tight text-text-primary">{title}</h2>
        <p className="text-sm leading-relaxed text-text-secondary">{description}</p>
        {footnote ? (
          <span className="rounded-full border border-border bg-surface-1 px-3 py-1 text-xs font-medium text-text-tertiary">
            {footnote}
          </span>
        ) : null}
      </div>
    </div>
  );
}
