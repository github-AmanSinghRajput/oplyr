import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { VoiceBootstrapService } from './voice-bootstrap.service.js';

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'oplyr-voice-bootstrap-'));
}

async function withEnv<T>(
  overrides: Record<string, string | undefined>,
  callback: () => Promise<T> | T
) {
  const previous = new Map<string, string | undefined>();

  for (const [key, value] of Object.entries(overrides)) {
    previous.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return await callback();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

function writeFile(targetPath: string) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, '');
}

function createBootstrapService(callLog: string[]) {
  return new VoiceBootstrapService({
    voiceSessionService: {
      enableBackgroundWarmup: async () => {
        callLog.push('enableBackgroundWarmup');
        return { ok: true };
      },
      refreshAudioState: async () => {
        callLog.push('refreshAudioState');
      }
    }
  });
}

test('VoiceBootstrapService warms and becomes ready, writing a provisioned marker', async () => {
  const tempRoot = createTempDir();
  const userDataDir = path.join(tempRoot, 'userdata');
  const callLog: string[] = [];

  try {
    await withEnv(
      {
        APP_ENV: 'test',
        OPLYR_APP_ROOT: tempRoot,
        OPLYR_USER_DATA_DIR: userDataDir,
        OPLYR_LOCAL_MODELS_DIR: path.join(userDataDir, 'models'),
        OPLYR_MODEL_SEED_DIR: undefined
      },
      async () => {
        const service = createBootstrapService(callLog);

        const initial = await service.getStatus();
        // No provisioned marker yet → the speech model still needs to be downloaded.
        assert.equal(initial.phase, 'install_required');

        await service.start();
        const ready = await service.getStatus();

        assert.equal(ready.phase, 'ready');
        assert.equal(ready.steps.filter((step) => step.state === 'completed').length >= 2, true);
        assert.deepEqual(callLog, ['enableBackgroundWarmup', 'refreshAudioState']);
        // A marker is written so subsequent launches skip the download.
        assert.equal(fs.existsSync(path.join(userDataDir, 'models', '.speech-model-ready')), true);
      }
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('VoiceBootstrapService treats a previously provisioned marker as ready', async () => {
  const tempRoot = createTempDir();
  const userDataDir = path.join(tempRoot, 'userdata');
  const callLog: string[] = [];

  try {
    // Simulate a prior successful provision.
    writeFile(path.join(userDataDir, 'models', '.speech-model-ready'));

    await withEnv(
      {
        APP_ENV: 'test',
        OPLYR_APP_ROOT: tempRoot,
        OPLYR_USER_DATA_DIR: userDataDir,
        OPLYR_LOCAL_MODELS_DIR: path.join(userDataDir, 'models'),
        OPLYR_MODEL_SEED_DIR: undefined
      },
      async () => {
        const service = createBootstrapService(callLog);

        const initial = await service.getStatus();
        assert.equal(initial.phase, 'idle');

        await service.start();
        const ready = await service.getStatus();

        assert.equal(ready.phase, 'ready');
        assert.deepEqual(callLog, ['enableBackgroundWarmup', 'refreshAudioState']);
      }
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
