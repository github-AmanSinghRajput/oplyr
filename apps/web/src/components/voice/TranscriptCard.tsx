import { cn } from '@/lib/cn';

interface TranscriptCardProps {
  label: string;
  text: string;
  variant?: 'primary' | 'muted';
  badge?: string;
  badgeActive?: boolean;
}

export function TranscriptCard({
  label,
  text,
  variant = 'muted',
  badge,
  badgeActive
}: TranscriptCardProps) {
  return (
    <div
      className={cn(
        'rounded-[var(--radius-panel)] border p-4',
        variant === 'primary'
          ? 'bg-surface-1 border-accent-border/30'
          : 'bg-surface-1/50 border-border'
      )}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-text-tertiary uppercase tracking-wider">
          {label}
        </span>
        {badge && (
          <span
            className={cn(
              'text-[10px] font-medium px-2 py-0.5 rounded-full',
              badgeActive ? 'bg-success-muted text-success' : 'bg-surface-2 text-text-tertiary'
            )}
          >
            {badge}
          </span>
        )}
      </div>
      <p
        className={cn(
          'text-sm leading-relaxed line-clamp-4',
          variant === 'primary' ? 'text-text-primary' : 'text-text-secondary'
        )}
      >
        {text}
      </p>
    </div>
  );
}
