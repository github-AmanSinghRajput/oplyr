import { spawn } from 'node:child_process';
import readline from 'node:readline';
import { logger } from '../../lib/logger.js';
import { getDefaultSttProvisionCommand } from '../../runtime-paths.js';

/**
 * Downloads the speech model, reporting 0-100 progress via onProgress. Resolves when the model is
 * present (or immediately if the provision command can't be resolved, e.g. in tests). Rejects with
 * a generic error if the download fails.
 */
export function provisionSpeechModel(onProgress: (pct: number) => void): Promise<void> {
  const command = getDefaultSttProvisionCommand();
  if (!command) {
    // No runtime available to provision with (e.g. tests / pre-runtime). Treat as present.
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    const child = spawn('/bin/zsh', ['-lc', command], {
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let failed: string | null = null;
    let done = false;

    readline.createInterface({ input: child.stdout }).on('line', (line) => {
      let msg: { type?: string; pct?: number; message?: string };
      try {
        msg = JSON.parse(line);
      } catch {
        return;
      }
      if (msg.type === 'progress' && typeof msg.pct === 'number') {
        onProgress(Math.max(0, Math.min(100, msg.pct)));
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
        onProgress(100);
        resolve();
      } else {
        reject(new Error(failed ?? `Speech model provisioning exited with code ${code}.`));
      }
    });
  });
}
