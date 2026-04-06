import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { VoiceCommandOption } from '@/containers/voice-console/lib/types';

interface CommandPickerProps {
  title: string | null;
  prompt: string | null;
  options: VoiceCommandOption[];
  onApply: (option: VoiceCommandOption) => void;
  onDismiss: () => void;
}

export function CommandPicker({ title, prompt, options, onApply, onDismiss }: CommandPickerProps) {
  if (options.length === 0) return null;

  return (
    <motion.div
      className="rounded-[var(--radius-panel)] border border-accent-border/30 bg-surface-1 p-5"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <span className="text-xs text-text-tertiary uppercase tracking-wider">Voice command</span>
          <h3 className="text-sm font-semibold text-text-primary mt-1">
            {title ?? 'Choose an option'}
          </h3>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onDismiss}>
          <X size={14} />
        </Button>
      </div>
      {prompt && <p className="text-sm text-text-secondary mb-4">{prompt}</p>}
      <div className="flex flex-col gap-2">
        {options.map((opt) => (
          <button
            key={opt.id}
            className="flex flex-col items-start gap-0.5 p-3 rounded-[var(--radius-control)] border border-border hover:border-accent-border hover:bg-accent-muted/50 transition-colors text-left"
            onClick={() => onApply(opt)}
            type="button"
          >
            <span className="text-sm font-medium text-text-primary">{opt.label}</span>
            <span className="text-xs text-text-secondary">{opt.description}</span>
          </button>
        ))}
      </div>
    </motion.div>
  );
}
