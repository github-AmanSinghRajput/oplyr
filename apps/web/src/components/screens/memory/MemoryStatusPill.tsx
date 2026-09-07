import { BrainCircuit, Cpu, Database, FolderGit2, Globe, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { BrainStatusResponse } from '@/containers/voice-console/lib/types';

interface MemoryStatusPillProps {
  status: BrainStatusResponse | null;
  busy: boolean;
  onToggleEnabled: (enabled: boolean) => void;
}

/**
 * Compact translucent status pill that floats over the top-left of the canvas: atom counts (total /
 * this-project / global), whether recall is semantic, and the master on/off. Replaces the old full-width
 * header band while keeping the same at-a-glance signals.
 */
export function MemoryStatusPill({ status, busy, onToggleEnabled }: MemoryStatusPillProps) {
  const stats = status?.stats;
  const enabled = status?.settings.enabled ?? false;
  // Show WHETHER recall works by meaning (benefit), never the internal embedding model name.
  //
  // This used to read `Boolean(status?.embeddingsModel)` — but that field is the model's NAME, always
  // a non-empty string. So the pill claimed "Semantic" even while the embedder had failed to load and
  // recall had silently degraded to keyword matching. It advertised the feature that wasn't running.
  const semanticOn = status?.embeddingsAvailable === true;
  const semanticBroken = status != null && status.embeddingsAvailable === false;
  const hasProject = Boolean(status?.project.key);

  return (
    <div className="memory-status-pill">
      <button
        type="button"
        className={cn('memory-status-pill__toggle', enabled && 'is-on')}
        onClick={() => onToggleEnabled(!enabled)}
        disabled={busy || !status}
        aria-pressed={enabled}
        title={enabled ? 'Brain on — click to pause' : 'Brain off — click to enable'}
      >
        <BrainCircuit size={15} />
        <span className="memory-status-pill__dot" />
        {enabled ? 'Brain on' : 'Brain off'}
      </button>

      <span className="memory-status-pill__divider" aria-hidden />

      <div className="memory-status-pill__stats">
        <PillStat icon={<Database size={13} />} label="Total" value={stats?.totalAtoms} />
        <PillStat
          icon={<FolderGit2 size={13} />}
          label={hasProject ? 'Project' : 'No project'}
          value={stats?.projectAtoms}
        />
        <PillStat icon={<Globe size={13} />} label="Global" value={stats?.globalAtoms} />
      </div>

      {semanticOn ? (
        <>
          <span className="memory-status-pill__divider" aria-hidden />
          <span
            className="memory-status-pill__model"
            title="Recall searches your memory by meaning, not just keywords"
          >
            <Cpu size={12} />
            Semantic
          </span>
        </>
      ) : null}

      {semanticBroken ? (
        <>
          <span className="memory-status-pill__divider" aria-hidden />
          <span
            className="memory-status-pill__model is-warning"
            title={`Semantic recall is not running, so memory is matched by keyword only.\n\n${
              status?.embeddingsUnavailableReason ?? 'The on-device embedding model failed to load.'
            }`}
          >
            <TriangleAlert size={12} />
            Keyword only
          </span>
        </>
      ) : null}
    </div>
  );
}

function PillStat({
  icon,
  label,
  value
}: {
  icon: React.ReactNode;
  label: string;
  value: number | undefined;
}) {
  return (
    <span className="memory-status-pill__stat" title={`${label}: ${value ?? 0}`}>
      {icon}
      <strong>{value ?? 0}</strong>
      <small>{label}</small>
    </span>
  );
}
