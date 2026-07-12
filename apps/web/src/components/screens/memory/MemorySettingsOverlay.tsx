import { useEffect } from 'react';
import { X } from 'lucide-react';
import type {
  BrainProjectSettings,
  BrainStatusResponse
} from '@/containers/voice-console/lib/types';
import { MemorySettings } from './MemorySettings';
import type { BrainSettingsUpdate } from './memory-settings-model';

interface MemorySettingsOverlayProps {
  open: boolean;
  status: BrainStatusResponse | null;
  busy: boolean;
  onClose: () => void;
  onUpdateSettings: BrainSettingsUpdate;
  onUpdateProject: (input: Partial<BrainProjectSettings>) => void;
  onReset: () => void;
}

/**
 * Slide-over that hosts the full Memory settings (capture/recall, per-project, ignore-globs, Local
 * God mode, reset) so they no longer permanently occupy the rail — opened from the canvas gear.
 */
export function MemorySettingsOverlay({
  open,
  status,
  busy,
  onClose,
  onUpdateSettings,
  onUpdateProject,
  onReset
}: MemorySettingsOverlayProps) {
  // Close on Escape while open.
  useEffect(() => {
    if (!open) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div className="memory-overlay" role="dialog" aria-modal="true" aria-label="Memory settings">
      <button
        type="button"
        className="memory-overlay__scrim"
        aria-label="Close settings"
        onClick={onClose}
      />
      <div className="memory-overlay__sheet">
        <div className="memory-overlay__head">
          <div>
            <p className="memory-eyebrow">Local Oplyr Brain</p>
            <h2>Memory settings</h2>
          </div>
          <button
            type="button"
            className="memory-overlay__close"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>
        <div className="memory-overlay__body">
          <MemorySettings
            status={status}
            busy={busy}
            onUpdateSettings={onUpdateSettings}
            onUpdateProject={onUpdateProject}
            onReset={onReset}
          />
        </div>
      </div>
    </div>
  );
}
