import { cn } from '@/lib/cn';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type {
  ProviderUsageMeter,
  ProviderUsageSnapshot
} from '@/containers/voice-console/lib/types';

/**
 * Compact, live usage meters for the Topbar center — the account's rate-limit windows
 * (Codex 5h/weekly, Claude session/week) pulled from the authed CLI's own `/status`|`/usage`.
 * The full breakdown (every meter + context window + account) lives in Settings → Agents;
 * here we surface only the two most load-bearing windows so the bar stays glanceable.
 */

const MAX_METERS = 2;

/** Short labels so each meter fits the topbar; falls back to the CLI's own label. */
const SHORT_LABEL: Record<string, string> = {
  'five-hour': '5h',
  weekly: 'Weekly',
  'current-session': 'Session',
  'current-week': 'Week',
  'extra-usage': 'Extra'
};

function shortLabel(meter: ProviderUsageMeter): string {
  return SHORT_LABEL[meter.id] ?? meter.label.replace(/\s*(limit|usage)$/i, '');
}

/** Escalate color as the window fills — the whole point of the bar is "how close to the limit". */
function tone(percentUsed: number): { bar: string; text: string } {
  if (percentUsed >= 90) return { bar: 'bg-danger', text: 'text-danger' };
  if (percentUsed >= 70) return { bar: 'bg-warning', text: 'text-warning' };
  return { bar: 'bg-accent', text: 'text-text-secondary' };
}

export function TopbarUsageMeters({
  usage,
  loading
}: {
  usage: ProviderUsageSnapshot | null;
  loading: boolean;
}) {
  // Only meters with a real number are worth a bar; detail-only meters live in Settings.
  const meters = (usage?.available ? usage.meters : [])
    .filter((meter) => typeof meter.percentUsed === 'number')
    .slice(0, MAX_METERS);

  // No meters yet. While a capture is in flight (Codex's `/status` scrape can take ~15–25s), show a
  // subtle "reading usage" hint so the header doesn't look empty/broken; otherwise render nothing.
  if (meters.length === 0) {
    if (!loading) return null;
    return (
      <div
        className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-text-tertiary"
        aria-label="Reading provider usage"
      >
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
        Reading usage…
      </div>
    );
  }

  return (
    <div
      className={cn('flex items-center gap-4 transition-opacity', loading && 'opacity-60')}
      aria-label="Provider usage limits"
    >
      {meters.map((meter) => {
        const pct = Math.min(100, Math.max(0, meter.percentUsed as number));
        const { bar, text } = tone(pct);
        return (
          <Tooltip key={meter.id}>
            <TooltipTrigger asChild>
              <div className="flex cursor-default items-center gap-1.5">
                <span className="text-[10px] font-medium uppercase tracking-wide text-text-tertiary">
                  {shortLabel(meter)}
                </span>
                <div className="h-1.5 w-11 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className={cn(
                      'h-full rounded-full transition-[width] duration-500 ease-out',
                      bar
                    )}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className={cn('text-[10px] font-semibold tabular-nums', text)}>
                  {Math.round(pct)}%
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <div className="space-y-0.5 text-xs">
                <p className="font-medium text-text-primary">{meter.label}</p>
                {meter.detail && <p className="text-text-secondary">{meter.detail}</p>}
                {meter.resetAt && <p className="text-text-tertiary">Resets {meter.resetAt}</p>}
              </div>
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
