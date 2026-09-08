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

function createBootstrapService(
  callLog: string[],
  provisionSpeechRefinement?: (onProgress: (pct: number) => void) => Promise<void>
) {
  return new VoiceBootstrapService({
    provisionSpeechRefinement,
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

// ── Speech refinement (keyterm biasing) ────────────────────────────────────────────────────────
// It is an accuracy upgrade, never a gate. These pin the three things that must stay true:
// an existing install still fetches it, a finished fetch is not repeated, and a failure is harmless.

test('an already-provisioned install still fetches speech refinement, in the background', async () => {
  const tempRoot = createTempDir();
  const userDataDir = path.join(tempRoot, 'userdata');
  const callLog: string[] = [];

  try {
    // The shape of an existing 0.4.x install: speech model present, refinement never heard of.
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
        let fetched = 0;
        const service = createBootstrapService(callLog, async () => {
          fetched += 1;
        });

        await service.start();

        const status = await service.getStatus();
        assert.equal(status.phase, 'ready', 'voice must be usable without waiting for refinement');
        assert.equal(fetched, 1, 'and the refinement fetch must still have been kicked off');

        // Asserted above that nothing waits on the fetch. Now wait, because it writes its marker
        // into the models directory this test is about to delete, and racing that removal failed
        // intermittently with ENOTEMPTY.
        await service.whenRefinementSettled();
        assert.equal((await service.getStatus()).speechRefinement, 'ready');
      }
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('a completed refinement fetch is not repeated on the next launch', async () => {
  const tempRoot = createTempDir();
  const userDataDir = path.join(tempRoot, 'userdata');
  const callLog: string[] = [];

  try {
    writeFile(path.join(userDataDir, 'models', '.speech-model-ready'));
    writeFile(path.join(userDataDir, 'models', '.speech-refinement-ready'));

    await withEnv(
      {
        APP_ENV: 'test',
        OPLYR_APP_ROOT: tempRoot,
        OPLYR_USER_DATA_DIR: userDataDir,
        OPLYR_LOCAL_MODELS_DIR: path.join(userDataDir, 'models'),
        OPLYR_MODEL_SEED_DIR: undefined
      },
      async () => {
        let fetched = 0;
        const service = createBootstrapService(callLog, async () => {
          fetched += 1;
        });

        await service.start();

        assert.equal(
          fetched,
          0,
          'no process should be spawned once the model is known to be there'
        );
        assert.equal((await service.getStatus()).speechRefinement, 'ready');
      }
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('a failed refinement fetch leaves voice ready and reports itself', async () => {
  const tempRoot = createTempDir();
  const userDataDir = path.join(tempRoot, 'userdata');
  const callLog: string[] = [];

  try {
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
        const service = createBootstrapService(callLog, async () => {
          throw new Error('offline');
        });

        await service.start();
        // The fetch is detached, so let its rejection settle. Waiting on the task rather than on a
        // timer, which would still lose the race on a loaded machine.
        await service.whenRefinementSettled();

        const status = await service.getStatus();
        assert.equal(status.phase, 'ready', 'a failed accuracy upgrade must not fail voice');
        assert.equal(status.error, null, 'and must not surface as an error');
        assert.equal(status.speechRefinement, 'unavailable');
        assert.equal(
          fs.existsSync(path.join(userDataDir, 'models', '.speech-refinement-ready')),
          false,
          'a failure must not be marked done, so the next launch retries'
        );
      }
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
