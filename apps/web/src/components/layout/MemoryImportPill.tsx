import { useEffect } from 'react';
import { BrainCircuit, Check } from 'lucide-react';
import { useMemoryImport } from '@/providers/MemoryImportProvider';
import { useNavigation } from '@/providers/NavigationProvider';
import { cn } from '@/lib/cn';

/**
 * Global progress pill for an in-flight memory import. Because it reads the app-root import context,
 * it stays visible while you navigate between screens. Hidden unless a run is active or just finished.
 */
export function MemoryImportPill() {
  const { run, dismissDone } = useMemoryImport();
  const { setActiveScreen } = useNavigation();

  // Clear the "done" state a few seconds after the run finishes, so the pill fades on its own.
  useEffect(() => {
    if (run.status !== 'done') return;
    const timer = window.setTimeout(() => dismissDone(), 4500);
    return () => window.clearTimeout(timer);
  }, [run.status, dismissDone]);

  if (run.status !== 'running' && run.status !== 'done') return null;

  const done = run.status === 'done';
  const pct = run.total > 0 ? Math.round((run.current / run.total) * 100) : 0;

  return (
    <button
      type="button"
      onClick={() => setActiveScreen('memory')}
      title={
        done
          ? 'View your brain'
          : run.activeLabel
            ? `Adding ${run.activeLabel}…`
            : 'Adding memories to your brain…'
      }
      className={cn(
        'flex h-7 items-center gap-2 rounded-[var(--radius-control)] border px-2.5 text-xs font-medium transition-colors',
        done
          ? 'border-success/40 bg-success/10 text-success'
          : 'border-accent-border/40 bg-accent-muted/50 text-accent hover:bg-accent-muted/80'
      )}
    >
      {done ? (
        <Check size={13} className="shrink-0" />
      ) : (
        <BrainCircuit size={13} className="shrink-0 animate-pulse" />
      )}
      <span>
        {done
          ? `Added ${run.atomsAdded} ${run.atomsAdded === 1 ? 'memory' : 'memories'}`
          : `Adding memories ${run.current}/${run.total}`}
      </span>
      {!done && (
        <span className="h-1 w-10 shrink-0 overflow-hidden rounded-full bg-surface-2">
          <span
            className="block h-full rounded-full bg-accent transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </span>
      )}
    </button>
  );
}
