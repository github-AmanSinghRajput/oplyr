import path from 'node:path';
import { promises as fs } from 'node:fs';
import { logger } from '../../lib/logger.js';
import { ensureDirectory, getModelsInstallDir } from '../../runtime-paths.js';
import type { VoiceSessionService } from './voice-session.service.js';

type VoiceBootstrapPhase =
  | 'idle'
  | 'install_required'
  | 'installing'
  | 'warming'
  | 'ready'
  | 'failed';

type VoiceBootstrapStepId = 'speech_model' | 'warmup';
type VoiceBootstrapStepState = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

interface VoiceBootstrapStep {
  id: VoiceBootstrapStepId;
  label: string;
  description: string;
  state: VoiceBootstrapStepState;
  detail: string | null;
}

export interface VoiceBootstrapStatus {
  phase: VoiceBootstrapPhase;
  progressPercent: number;
  message: string;
  error: string | null;
  installRoot: string;
  seedRoot: string | null;
  steps: VoiceBootstrapStep[];
  updatedAt: string;
}

interface VoiceAssetInspection {
  installRoot: string;
  // Whether the on-device speech model has already been provisioned (downloaded) on this machine.
  ready: boolean;
}

interface VoiceBootstrapDependencies {
  voiceSessionService: Pick<VoiceSessionService, 'enableBackgroundWarmup' | 'refreshAudioState'>;
  provisionSpeechModel?: (onProgress: (pct: number) => void) => Promise<void>;
}

const baseSteps: Record<VoiceBootstrapStepId, Omit<VoiceBootstrapStep, 'state' | 'detail'>> = {
  speech_model: {
    id: 'speech_model',
    label: 'Speech model',
    description: 'Download the on-device speech model.'
  },
  warmup: {
    id: 'warmup',
    label: 'Speech engine',
    description: 'Prepare the on-device speech engine.'
  }
};

function buildInitialSteps(): VoiceBootstrapStep[] {
  return (Object.keys(baseSteps) as VoiceBootstrapStepId[]).map((id) => ({
    ...baseSteps[id],
    state: 'pending' as VoiceBootstrapStepState,
    detail: null as string | null
  }));
}

function nowIso() {
  return new Date().toISOString();
}

function percentFromSteps(steps: VoiceBootstrapStep[]) {
  const relevantSteps = steps.filter((step) => step.state !== 'skipped');
  if (relevantSteps.length === 0) {
    return 100;
  }

  const score = relevantSteps.reduce((total, step) => {
    if (step.state === 'completed') return total + 1;
    if (step.state === 'running') return total + 0.5;
    return total;
  }, 0);

  return Math.min(100, Math.max(0, Math.round((score / relevantSteps.length) * 100)));
}

function createStatus(
  phase: VoiceBootstrapPhase,
  steps: VoiceBootstrapStep[],
  message: string,
  error: string | null,
  installRoot: string,
  seedRoot: string | null
): VoiceBootstrapStatus {
  return {
    phase,
    progressPercent: phase === 'ready' ? 100 : percentFromSteps(steps),
    message,
    error,
    installRoot,
    seedRoot,
    steps,
    updatedAt: nowIso()
  };
}

function cloneSteps(steps: VoiceBootstrapStep[]) {
  return steps.map((step) => ({ ...step }));
}

function updateStep(
  steps: VoiceBootstrapStep[],
  id: VoiceBootstrapStepId,
  patch: Partial<Pick<VoiceBootstrapStep, 'state' | 'detail'>>
) {
  return steps.map((step) => (step.id === id ? { ...step, ...patch } : step));
}

async function fileExists(targetPath: string | null) {
  if (!targetPath) {
    return false;
  }

  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export class VoiceBootstrapService {
  private status = createStatus(
    'idle',
    buildInitialSteps(),
    'Preparing to inspect local voice assets.',
    null,
    getModelsInstallDir(),
    null
  );
  private activePromise: Promise<void> | null = null;
  private modelDownloadPercent: number | null = null;

  constructor(private readonly dependencies: VoiceBootstrapDependencies) {}

  async getStatus() {
    // Only inspect when idle AND no bootstrap run is in flight. Otherwise a getStatus() call
    // that races with start()/run() can launch a concurrent inspect() that resolves last and
    // clobbers run()'s 'ready' back to 'idle' — leaving the loader stuck at "warming".
    if (this.status.phase === 'idle' && !this.activePromise) {
      await this.inspect();
    }

    const status = { ...this.status, steps: cloneSteps(this.status.steps) };
    if (this.status.phase === 'installing' && this.modelDownloadPercent !== null) {
      status.progressPercent = this.modelDownloadPercent;
    }
    return status;
  }

  start() {
    if (this.status.phase === 'ready') {
      return Promise.resolve();
    }

    if (this.activePromise) {
      return this.activePromise;
    }

    this.activePromise = this.run().finally(() => {
      this.activePromise = null;
    });

    return this.activePromise;
  }

  private setStatus(
    phase: VoiceBootstrapPhase,
    steps: VoiceBootstrapStep[],
    message: string,
    error: string | null = null
  ) {
    this.status = createStatus(
      phase,
      steps,
      message,
      error,
      this.status.installRoot,
      this.status.seedRoot
    );
  }

  private async inspect() {
    const inspection = await this.inspectAssets();
    const steps = this.stepsFromInspection(inspection);

    this.status = createStatus(
      inspection.ready ? 'idle' : 'install_required',
      steps,
      inspection.ready
        ? 'On-device speech model is installed. Oplyr can warm it now.'
        : 'Oplyr needs to download the on-device speech model before onboarding can continue.',
      null,
      inspection.installRoot,
      null
    );

    return inspection;
  }

  private async run() {
    const inspection = await this.inspect();
    let steps = cloneSteps(this.status.steps);

    // Speech model: download via the native oplyr-stt binary unless already provisioned.
    if (inspection.ready) {
      steps = updateStep(steps, 'speech_model', {
        state: 'completed',
        detail: 'On-device speech model ready.'
      });
      this.setStatus('warming', steps, 'Preparing the speech engine.');
    } else {
      steps = updateStep(steps, 'speech_model', {
        state: 'running',
        detail: 'Downloading the speech model.'
      });
      this.modelDownloadPercent = 0;
      this.setStatus('installing', steps, 'Downloading the speech model.');

      try {
        if (this.dependencies.provisionSpeechModel) {
          await this.dependencies.provisionSpeechModel((pct) => {
            this.modelDownloadPercent = pct;
            const detailSteps = updateStep(this.status.steps, 'speech_model', {
              state: 'running',
              detail: `Downloading… ${pct}%`
            });
            this.setStatus('installing', detailSteps, 'Downloading the speech model.');
          });
        }
        this.modelDownloadPercent = null;
        steps = updateStep(this.status.steps, 'speech_model', {
          state: 'completed',
          detail: 'Speech model ready.'
        });
        this.setStatus('warming', steps, 'Preparing the speech engine.');
      } catch (error) {
        this.modelDownloadPercent = null;
        const message =
          error instanceof Error ? error.message : 'Could not download the speech model.';
        steps = updateStep(this.status.steps, 'speech_model', {
          state: 'failed',
          detail: message
        });
        this.setStatus(
          'failed',
          steps,
          'Could not download the speech model. Check your connection and retry.',
          message
        );
        logger.error('voice.bootstrap.failed', { error: message });
        throw error;
      }
    }

    // Warm the speech engine.
    steps = updateStep(this.status.steps, 'warmup', {
      state: 'running',
      detail: 'Preparing the speech engine.'
    });
    this.setStatus('warming', steps, 'Warming up the speech models.');

    try {
      // The native STT worker is spawned per WebSocket connection; the model loads on first turn.
      await this.dependencies.voiceSessionService.enableBackgroundWarmup();
      await this.dependencies.voiceSessionService.refreshAudioState();
      await this.markProvisioned();
      steps = updateStep(this.status.steps, 'warmup', {
        state: 'completed',
        detail: 'Voice runtime is ready for onboarding.'
      });
      this.setStatus('ready', steps, 'Voice runtime is ready.');
      logger.info('voice.bootstrap.completed', { installRoot: this.status.installRoot });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to warm local voice runtime.';
      steps = updateStep(this.status.steps, 'warmup', { state: 'failed', detail: message });
      this.setStatus('failed', steps, 'Oplyr could not finish local voice setup.', message);
      logger.error('voice.bootstrap.failed', {
        error: message,
        installRoot: this.status.installRoot
      });
      throw error;
    }
  }

  private stepsFromInspection(inspection: VoiceAssetInspection) {
    let steps = buildInitialSteps();

    steps = updateStep(
      steps,
      'speech_model',
      inspection.ready
        ? { state: 'completed', detail: 'On-device speech model ready.' }
        : {
            state: 'pending',
            detail: 'The on-device speech model will be downloaded on first run.'
          }
    );
    steps = updateStep(steps, 'warmup', {
      state: 'pending',
      detail: 'Waiting for the speech model.'
    });

    return steps;
  }

  private markerPath() {
    return path.join(getModelsInstallDir(), '.speech-model-ready');
  }

  private async markProvisioned() {
    try {
      ensureDirectory(getModelsInstallDir());
      await fs.writeFile(this.markerPath(), nowIso(), 'utf8');
    } catch {
      // Non-fatal: the model still works this session; we just re-check on next launch.
    }
  }

  private async inspectAssets(): Promise<VoiceAssetInspection> {
    return {
      installRoot: getModelsInstallDir(),
      ready: await fileExists(this.markerPath())
    };
  }
}
