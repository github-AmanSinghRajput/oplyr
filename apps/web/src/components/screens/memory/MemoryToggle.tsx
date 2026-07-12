import { cn } from '@/lib/cn';

interface MemoryToggleProps {
  checked: boolean;
  label: string;
  hint?: string;
  disabled?: boolean;
  tone?: 'default' | 'danger';
  onChange: (checked: boolean) => void;
}

/** Compact pill switch used across the Memory settings section (design mirrors the old brain UI). */
export function MemoryToggle({
  checked,
  label,
  hint,
  disabled,
  tone = 'default',
  onChange
}: MemoryToggleProps) {
  return (
    <button
      type="button"
      className={cn('memory-toggle', checked && 'is-on', tone === 'danger' && 'is-danger')}
      onClick={() => onChange(!checked)}
      disabled={disabled}
      aria-pressed={checked}
    >
      <span>
        <strong>{label}</strong>
        {hint ? <small>{hint}</small> : null}
      </span>
      <i />
    </button>
  );
}
