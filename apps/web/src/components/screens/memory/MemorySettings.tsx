import { AlertTriangle, ShieldAlert, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import type {
  AssistantProviderId,
  BrainProjectSettings,
  BrainSettings,
  BrainStatusResponse
} from '@/containers/voice-console/lib/types';
import { providerLabels, providerOrder } from './memory-shared';
import { MemoryToggle } from './MemoryToggle';
import type { BrainSettingsUpdate } from './memory-settings-model';

interface MemorySettingsProps {
  status: BrainStatusResponse | null;
  busy: boolean;
  onUpdateSettings: BrainSettingsUpdate;
  onUpdateProject: (input: Partial<BrainProjectSettings>) => void;
  onReset: () => void;
}

export function MemorySettings({
  status,
  busy,
  onUpdateSettings,
  onUpdateProject,
  onReset
}: MemorySettingsProps) {
  const settings = status?.settings ?? null;
  const project = status?.project ?? null;

  if (!settings) {
    return (
      <section className="memory-panel memory-settings-panel">
        <p className="memory-inline-empty">Loading brain settings…</p>
      </section>
    );
  }

  const godMode = settings.mode === 'local_god';

  const enableGodMode = () => {
    const confirmed = window.confirm(
      'Enable Local God mode?\n\nThis unlocks capturing and injecting SENSITIVE memory (secret-like ' +
        'content, protected paths) and a raw archive. Everything stays on this machine, but sensitive ' +
        'capture is powerful and off by default. You can turn it back off at any time.'
    );
    if (confirmed) {
      onUpdateSettings({ mode: 'local_god' }, (current) => ({ ...current, mode: 'local_god' }));
    }
  };

  const disableGodMode = () => {
    // Leaving God mode also forces the sensitive switches off so they can never linger enabled.
    onUpdateSettings(
      { mode: 'standard', allowSensitiveCapture: false, allowSensitiveInjection: false },
      (current) => ({
        ...current,
        mode: 'standard',
        allowSensitiveCapture: false,
        allowSensitiveInjection: false
      })
    );
  };

  return (
    <section className="memory-panel memory-settings-panel">
      <div className="memory-panel__header">
        <div>
          <p className="memory-eyebrow">Controls</p>
          <h3>Capture &amp; recall</h3>
        </div>
      </div>

      <div className="memory-settings-block">
        <MemoryToggle
          checked={settings.captureEnabled}
          label="Capture"
          hint="Write new memory"
          disabled={busy}
          onChange={(captureEnabled) =>
            onUpdateSettings({ captureEnabled }, (current) => ({ ...current, captureEnabled }))
          }
        />
        <MemoryToggle
          checked={settings.recallEnabled}
          label="Recall"
          hint="Inject memory into turns"
          disabled={busy}
          onChange={(recallEnabled) =>
            onUpdateSettings({ recallEnabled }, (current) => ({ ...current, recallEnabled }))
          }
        />
        <MemoryToggle
          checked={settings.crossProjectEnabled}
          label="Cross-project"
          hint="Let related projects inform recall"
          disabled={busy}
          onChange={(crossProjectEnabled) =>
            onUpdateSettings({ crossProjectEnabled }, (current) => ({
              ...current,
              crossProjectEnabled
            }))
          }
        />
      </div>

      <div className="memory-settings-group">
        <p className="memory-settings-label">Agent write permissions</p>
        <div className="memory-provider-row">
          {providerOrder.map((providerId) => {
            const enabled = settings.agentWritePermissions[providerId]?.writeEnabled ?? false;
            return (
              <button
                type="button"
                key={providerId}
                className={cn('memory-provider-pill', enabled && 'is-active')}
                disabled={busy}
                aria-pressed={enabled}
                onClick={() => toggleAgent(settings, providerId, onUpdateSettings)}
              >
                {providerLabels[providerId]}
              </button>
            );
          })}
        </div>
      </div>

      {project?.key ? (
        <div className="memory-settings-group">
          <p className="memory-settings-label">This project</p>
          <p className="memory-settings-note">
            <code>{project.key}</code>
          </p>
          <div className="memory-settings-block">
            <MemoryToggle
              checked={project.captureEnabled}
              label="Capture here"
              hint="Capture for just this project"
              disabled={busy}
              onChange={(captureEnabled) => onUpdateProject({ captureEnabled })}
            />
            <MemoryToggle
              checked={project.isolate}
              label="Isolate"
              hint="No memory in or out of this project"
              disabled={busy}
              onChange={(isolate) => onUpdateProject({ isolate })}
            />
          </div>
        </div>
      ) : null}

      {/* Local God mode — high-friction, off by default, explicitly warned. */}
      <div className={cn('memory-god-mode', godMode && 'is-active')}>
        <div className="memory-god-mode__head">
          <ShieldAlert size={16} />
          <div>
            <p>Local God mode</p>
            <span>
              Unlocks sensitive capture/injection and a raw archive. All local. Off by default.
            </span>
          </div>
          {godMode ? <Badge variant="destructive">active</Badge> : null}
        </div>

        {godMode ? (
          <>
            <div className="memory-settings-block">
              <MemoryToggle
                checked={settings.allowSensitiveCapture}
                label="Capture sensitive"
                hint="Secret-like content"
                tone="danger"
                disabled={busy}
                onChange={(allowSensitiveCapture) =>
                  onUpdateSettings({ allowSensitiveCapture }, (current) => ({
                    ...current,
                    allowSensitiveCapture
                  }))
                }
              />
              <MemoryToggle
                checked={settings.allowSensitiveInjection}
                label="Inject sensitive"
                hint="Recall secret-like atoms"
                tone="danger"
                disabled={busy}
                onChange={(allowSensitiveInjection) =>
                  onUpdateSettings({ allowSensitiveInjection }, (current) => ({
                    ...current,
                    allowSensitiveInjection
                  }))
                }
              />
              <MemoryToggle
                checked={settings.rawArchiveEnabled}
                label="Raw archive"
                hint="Store un-redacted turns"
                tone="danger"
                disabled={busy}
                onChange={(rawArchiveEnabled) =>
                  onUpdateSettings({ rawArchiveEnabled }, (current) => ({
                    ...current,
                    rawArchiveEnabled
                  }))
                }
              />
            </div>
            <Button variant="outline" size="sm" onClick={disableGodMode} disabled={busy}>
              Turn off Local God mode
            </Button>
          </>
        ) : (
          <Button variant="outline" size="sm" onClick={enableGodMode} disabled={busy}>
            <AlertTriangle size={13} />
            Enable Local God mode
          </Button>
        )}
      </div>

      <div className="memory-danger-zone">
        <div>
          <p>Reset all memory</p>
          <span>Permanently deletes every atom, edge, and preference on this machine.</span>
        </div>
        <Button variant="destructive" size="sm" onClick={onReset} disabled={busy}>
          <Trash2 size={13} />
          Reset
        </Button>
      </div>
    </section>
  );
}

function toggleAgent(
  settings: BrainSettings,
  providerId: AssistantProviderId,
  onUpdateSettings: BrainSettingsUpdate
) {
  const next = !(settings.agentWritePermissions[providerId]?.writeEnabled ?? false);
  onUpdateSettings({ agentWritePermissions: { [providerId]: next } }, (current) => ({
    ...current,
    agentWritePermissions: {
      ...current.agentWritePermissions,
      [providerId]: { writeEnabled: next, updatedAt: new Date().toISOString() }
    }
  }));
}
