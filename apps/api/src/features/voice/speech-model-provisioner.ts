import { spawn } from 'node:child_process';
import readline from 'node:readline';
import { logger } from '../../lib/logger.js';
import {
  getDefaultSttProvisionCommand,
  getDefaultSttRefinementProvisionCommand,
  resolveLoginShell
} from '../../runtime-paths.js';
import { verifyModelIntegrity } from './model-integrity.js';

/**
 * Downloads the speech model, reporting 0-100 progress via onProgress. Resolves when the model is
 * present (or immediately if the provision command can't be resolved, e.g. in tests). Rejects with
 * a generic error if the download fails.
 */
/** Which model the native provisioner is currently fetching. */
export type ProvisionStage = 'speech' | 'refinement';

/**
 * Fetch the speech-refinement (CTC keyword-spotter) model that keyterm biasing needs.
 *
 * Runs in the BACKGROUND, after voice is already usable — it is an accuracy upgrade, not a
 * prerequisite, and blocking the whole app on 114MB for it would be wrong. `StreamWorker` reads the
 * cache and never downloads, so until this finishes dictation simply runs unbiased.
 */
export function provisionSpeechRefinement(
  onProgress: (pct: number) => void = () => {}
): Promise<void> {
  return runProvisionCommand(getDefaultSttRefinementProvisionCommand(), (pct) => onProgress(pct));
}

export function provisionSpeechModel(
  onProgress: (pct: number, stage: ProvisionStage) => void
): Promise<void> {
  return runProvisionCommand(getDefaultSttProvisionCommand(), onProgress);
}

/** Shared driver for both provisioning passes: spawn, parse the JSON-line protocol, resolve on done. */
function runProvisionCommand(
  command: string,
  onProgress: (pct: number, stage: ProvisionStage) => void
): Promise<void> {
  if (!command) {
    // No runtime available to provision with (e.g. tests / pre-runtime). Treat as present.
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    const child = spawn(resolveLoginShell(), ['-lc', command], {
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let failed: string | null = null;
    let done = false;

    readline.createInterface({ input: child.stdout }).on('line', (line) => {
      let msg: { type?: string; pct?: number; message?: string; stage?: string };
      try {
        msg = JSON.parse(line);
      } catch {
        return;
      }
      if (msg.type === 'progress' && typeof msg.pct === 'number') {
        // The refinement model has no progress hook, so the bar holds at its share while it
        // downloads — the stage is what lets the UI explain that rather than look stalled.
        const stage: ProvisionStage = msg.stage === 'refinement' ? 'refinement' : 'speech';
        onProgress(Math.max(0, Math.min(100, msg.pct)), stage);
      } else if (msg.type === 'done') {
        done = true;
      } else if (msg.type === 'error') {
        failed = msg.message ?? 'Speech model download failed.';
      }
    });

    readline
      .createInterface({ input: child.stderr })
      .on('line', (line) => logger.warn('voice.provision.stderr', { line }));

    child.on('error', (error) => reject(error));
    child.on('close', (code) => {
      // Success if the script reported done or exited cleanly — and never reported an error.
      // (The provision script hard-exits, but tolerate odd exit codes when 'done' was seen.)
      if (!failed && (done || code === 0)) {
        // Tamper canary: refuse a present-but-mismatched model (fail-open if not found).
        const integrity = verifyModelIntegrity();
        if (integrity.checked && !integrity.ok) {
          reject(
            new Error('The downloaded speech model failed its integrity check and was not loaded.')
          );
          return;
        }
        onProgress(100, 'refinement');
        resolve();
      } else {
        reject(new Error(failed ?? `Speech model provisioning exited with code ${code}.`));
      }
    });
  });
}
