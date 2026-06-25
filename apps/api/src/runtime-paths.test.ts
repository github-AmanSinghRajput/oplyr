import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  getDefaultSttStreamWorkerCommand,
  getPortableAssistantCwd,
  getUserDataDir,
  resolvePortablePath
} from './runtime-paths.js';

function withEnv<T>(overrides: Record<string, string | undefined>, callback: () => T) {
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
    return callback();
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

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'oplyr-runtime-paths-'));
}

test('resolvePortablePath preserves absolute paths and resolves relative ones against the provided base directory', () => {
  assert.equal(resolvePortablePath('/tmp/oplyr-models'), path.normalize('/tmp/oplyr-models'));
  assert.equal(
    resolvePortablePath('models', '/tmp/oplyr-base'),
    path.normalize('/tmp/oplyr-base/models')
  );
  assert.equal(resolvePortablePath('   '), '');
});

test('getUserDataDir honors the configured Oplyr user data directory', () => {
  const customDir = createTempDir();

  try {
    const userDataDir = withEnv(
      {
        OPLYR_USER_DATA_DIR: customDir,
        APP_ENV: 'production'
      },
      () => getUserDataDir()
    );

    assert.equal(userDataDir, customDir);
  } finally {
    fs.rmSync(customDir, { recursive: true, force: true });
  }
});

test('getPortableAssistantCwd creates a portable session directory inside the user data directory', () => {
  const customDir = createTempDir();

  try {
    const assistantDir = withEnv({ OPLYR_USER_DATA_DIR: customDir }, () =>
      getPortableAssistantCwd()
    );

    assert.equal(assistantDir, path.join(customDir, 'assistant-session'));
    assert.equal(fs.existsSync(assistantDir), true);
  } finally {
    fs.rmSync(customDir, { recursive: true, force: true });
  }
});

test('getDefaultSttStreamWorkerCommand resolves the OPLYR_STT_BINARY override as a shell-escaped path', () => {
  const tempRoot = createTempDir();
  const binary = path.join(tempRoot, 'oplyr-stt');

  try {
    fs.writeFileSync(binary, '');

    const command = withEnv({ OPLYR_STT_BINARY: binary }, () => getDefaultSttStreamWorkerCommand());

    assert.equal(command, `'${binary}'`);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('getDefaultSttStreamWorkerCommand shell-escapes a single quote in the OPLYR_STT_BINARY path', () => {
  const tempRoot = createTempDir();
  const dir = path.join(tempRoot, "o'malley");
  const binary = path.join(dir, 'oplyr-stt');

  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(binary, '');

    const command = withEnv({ OPLYR_STT_BINARY: binary }, () => getDefaultSttStreamWorkerCommand());

    // POSIX single-quote escaping: each `'` becomes `'\''`, then the whole value is wrapped in `'...'`.
    const expected = `'${binary.replace(/'/g, "'\\''")}'`;
    assert.equal(command, expected);
    assert.equal(command.includes(`'\\''`), true);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
