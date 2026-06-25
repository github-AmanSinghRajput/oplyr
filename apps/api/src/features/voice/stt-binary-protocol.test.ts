import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { WebSocket } from 'ws';
import {
  getDefaultSttProvisionCommand,
  getDefaultSttStreamWorkerCommand
} from '../../runtime-paths.js';
import { provisionSpeechModel } from './speech-model-provisioner.js';
import { attachVoiceStreamGateway } from './voice-stream.gateway.js';

// NOTE: The repo's test runner discovers `src/**/*.test.ts` (see the api package.json `test`
// script: `find src -name '*.test.ts'`). The plan referenced `apps/api/test/voice/...`, but a
// file there would never be executed, so this hermetic test is colocated under `src` to match
// the established convention and actually run.
//
// This test is fully hermetic: it never touches the real `oplyr-stt` binary, downloads no model,
// and makes no network calls. A tiny fake Node executable (written to a tmp dir and pointed at via
// OPLYR_STT_BINARY) emits canned protocol JSON for both the streaming worker and `--provision`
// modes.

const FAKE_BINARY = `#!/usr/bin/env node
'use strict';
// Fake oplyr-stt. Two modes:
//  --provision : emit progress 50, progress 100, done.
//  (default)   : emit ready, a partial, then on a finalize stdin frame (type byte === 1) emit final.
const isProvision = process.argv.includes('--provision');
function emit(obj) { process.stdout.write(JSON.stringify(obj) + '\\n'); }

if (isProvision) {
  emit({ type: 'progress', pct: 50 });
  emit({ type: 'progress', pct: 100 });
  emit({ type: 'done' });
  process.exit(0);
}

emit({ type: 'ready' });
emit({ type: 'partial', text: 'hi' });

// Frame protocol: 1-byte type + 4-byte big-endian length + payload.
let buf = Buffer.alloc(0);
let finalized = false;
function pump() {
  while (buf.length >= 5) {
    const type = buf[0];
    const len = buf.readUInt32BE(1);
    if (buf.length < 5 + len) return;
    buf = buf.subarray(5 + len);
    if (type === 1 && !finalized) {
      finalized = true;
      emit({ type: 'final', text: 'hello world' });
    }
  }
}
process.stdin.on('data', (chunk) => { buf = Buffer.concat([buf, chunk]); pump(); });
process.stdin.on('end', () => {
  if (!finalized) { emit({ type: 'final', text: 'hello world' }); }
  process.exit(0);
});
`;

function writeFakeBinary() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oplyr-stt-fake-'));
  const binary = path.join(dir, 'oplyr-stt');
  fs.writeFileSync(binary, FAKE_BINARY, { mode: 0o755 });
  return { dir, binary };
}

async function withSttBinary(binary: string, callback: () => Promise<void>): Promise<void> {
  const previous = process.env.OPLYR_STT_BINARY;
  process.env.OPLYR_STT_BINARY = binary;
  try {
    await callback();
  } finally {
    if (previous === undefined) {
      delete process.env.OPLYR_STT_BINARY;
    } else {
      process.env.OPLYR_STT_BINARY = previous;
    }
  }
}

test('command resolvers point at the OPLYR_STT_BINARY override', async () => {
  const { dir, binary } = writeFakeBinary();
  try {
    await withSttBinary(binary, async () => {
      assert.equal(getDefaultSttStreamWorkerCommand(), `'${binary}'`);
      assert.equal(getDefaultSttProvisionCommand(), `'${binary}' --provision`);
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('provisionSpeechModel parses the fake binary progress/done and resolves reaching 100', async () => {
  const { dir, binary } = writeFakeBinary();
  const progress: number[] = [];

  try {
    await withSttBinary(binary, () => provisionSpeechModel((pct) => progress.push(pct)));

    assert.equal(progress.includes(50), true);
    assert.equal(progress.at(-1), 100, 'progress should reach 100');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('voice stream gateway relays the fake worker JSON lines to a WebSocket client', async () => {
  const { dir, binary } = writeFakeBinary();
  let server: Server | undefined;

  try {
    await withSttBinary(binary, async () => {
      server = createServer();
      const wss = attachVoiceStreamGateway(server);
      await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
      const { port } = server!.address() as { port: number };

      const received: Array<Record<string, unknown>> = [];

      await new Promise<void>((resolve, reject) => {
        const socket = new WebSocket(`ws://127.0.0.1:${port}/api/voice/stream`);
        const timer = setTimeout(() => {
          socket.terminate();
          reject(new Error('timed out waiting for final transcript'));
        }, 10_000);

        socket.on('open', () => {
          // A binary message is treated as an audio frame; then request finalize.
          socket.send(Buffer.from([0, 0])); // tiny fake PCM payload
          socket.send(JSON.stringify({ type: 'finalize' }));
        });

        socket.on('message', (data: Buffer) => {
          try {
            received.push(JSON.parse(data.toString()));
          } catch {
            return;
          }
          if (received.some((msg) => msg.type === 'final')) {
            clearTimeout(timer);
            socket.close();
            resolve();
          }
        });

        socket.on('error', (error) => {
          clearTimeout(timer);
          reject(error);
        });
      });

      wss.close();

      const types = received.map((msg) => msg.type);
      assert.equal(types.includes('ready'), true);
      assert.equal(types.includes('partial'), true);
      const final = received.find((msg) => msg.type === 'final');
      assert.ok(final, 'expected a final message');
      assert.equal(final?.text, 'hello world');
    });
  } finally {
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
    }
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
