import { useState } from 'react';
import type { ChatMemoryAtom } from '@/containers/voice-console/lib/types';

// The transparency affordance beneath an assistant reply: "🧠 Used N memories", expandable to show
// exactly which memories the brain injected — their source (this project / global / another project)
// and which agents asserted them. This is what lets us honestly say "you can see what memory did".

const PROVIDER_LABELS: Record<string, string> = {
  codex: 'Codex',
  claude: 'Claude Code',
  gemini: 'Gemini CLI'
};

function sourceLabel(atom: ChatMemoryAtom): string {
  if (atom.crossProject) {
    return `from ${atom.projectKey ?? 'another project'}`;
  }
  return atom.scope === 'global' ? 'global' : 'this project';
}

export function MemoryChip({ atoms }: { atoms: ChatMemoryAtom[] }) {
  const [open, setOpen] = useState(false);
  if (atoms.length === 0) {
    return null;
  }

  return (
    <div className="mt-2 pt-2 border-t border-border/50">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-1.5 text-[11px] text-text-tertiary hover:text-text-secondary transition-colors"
        aria-expanded={open}
      >
        <span aria-hidden="true">🧠</span>
        <span>
          Used {atoms.length} {atoms.length === 1 ? 'memory' : 'memories'}
        </span>
        <span className="opacity-60" aria-hidden="true">
          {open ? '▾' : '▸'}
        </span>
      </button>

      {open && (
        <ul className="mt-1.5 flex flex-col gap-1.5">
          {atoms.map((atom) => (
            <li key={atom.id} className="text-[11px] leading-relaxed text-text-secondary">
              <span className="text-text-tertiary">
                [{sourceLabel(atom)}
                {atom.contributors.length > 0
                  ? ` · ${atom.contributors.map((id) => PROVIDER_LABELS[id] ?? id).join(', ')}`
                  : ''}
                ]
              </span>{' '}
              {atom.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
