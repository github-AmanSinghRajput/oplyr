import { BrainCircuit, Cpu, Database, FolderGit2, Globe } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { BrainStatusResponse } from '@/containers/voice-console/lib/types';

interface MemoryStatusPillProps {
  status: BrainStatusResponse | null;
  busy: boolean;
  onToggleEnabled: (enabled: boolean) => void;
}

/**
 * Compact translucent status pill that floats over the top-left of the canvas: atom counts (total /
 * this-project / global), the embeddings model, and the master on/off. Replaces the old full-width
 * header band while keeping the same at-a-glance signals.
 */
export function MemoryStatusPill({ status, busy, onToggleEnabled }: MemoryStatusPillProps) {
  const stats = status?.stats;
  const enabled = status?.settings.enabled ?? false;
  const model = status?.embeddingsModel ?? '—';
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

      <span className="memory-status-pill__divider" aria-hidden />

      <span className="memory-status-pill__model" title={`Embeddings model: ${model}`}>
        <Cpu size={12} />
        <code>{model}</code>
      </span>
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
