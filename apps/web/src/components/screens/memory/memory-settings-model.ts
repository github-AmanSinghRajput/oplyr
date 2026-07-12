import type { AssistantProviderId, BrainSettings } from '@/containers/voice-console/lib/types';

/** The subset of BrainSettings the UI can PUT, plus the compact agent-permission shorthand. */
export type BrainSettingsUpdateInput = Partial<
  Pick<
    BrainSettings,
    | 'mode'
    | 'enabled'
    | 'recallEnabled'
    | 'captureEnabled'
    | 'crossProjectEnabled'
    | 'rawArchiveEnabled'
    | 'allowSensitiveCapture'
    | 'allowSensitiveInjection'
    | 'maxRecallAtoms'
    | 'maxRecallCharacters'
    | 'maxGraphHops'
  >
> & {
  agentWritePermissions?: Partial<Record<AssistantProviderId, boolean>>;
};

/**
 * Applies a settings change. `optimistic` (when provided) updates local state immediately so
 * toggles feel instant; the orchestrator reconciles with the server response and rolls back on
 * error.
 */
export type BrainSettingsUpdate = (
  input: BrainSettingsUpdateInput,
  optimistic?: (settings: BrainSettings) => BrainSettings
) => void;
