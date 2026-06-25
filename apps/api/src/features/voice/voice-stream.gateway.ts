import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import readline from 'node:readline';
import type { Server } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';
import { getDefaultSttStreamWorkerCommand } from '../../runtime-paths.js';

const TYPE_AUDIO = 0;
const TYPE_FINALIZE = 1;
const TYPE_RESET = 2;

function frame(type: number, payload: Buffer): Buffer {
  const header = Buffer.alloc(5);
  header[0] = type;
  header.writeUInt32BE(payload.length, 1);
  return Buffer.concat([header, payload]);
}

/** Attaches a /api/voice/stream WebSocket that bridges audio to the native speech worker (oplyr-stt). */
export function attachVoiceStreamGateway(server: Server) {
  const command = getDefaultSttStreamWorkerCommand();
  const wss = new WebSocketServer({ server, path: '/api/voice/stream' });

  wss.on('connection', (socket: WebSocket, request) => {
    const url = new URL(request.url ?? '', 'http://localhost');
    if (env.localApiAuthToken && url.searchParams.get('token') !== env.localApiAuthToken) {
      socket.close(1008, 'Unauthorized');
      return;
    }
    if (!command) {
      socket.send(JSON.stringify({ type: 'error', message: 'Speech engine not configured.' }));
      socket.close();
      return;
    }

    const worker: ChildProcessWithoutNullStreams = spawn('/bin/zsh', ['-lc', command], {
      env: { ...process.env },
      stdio: ['pipe', 'pipe', 'pipe']
    }) as ChildProcessWithoutNullStreams;

    worker.stdin.on('error', (error) => {
      logger.warn('voice.stream.worker.stdin.error', {
        code: (error as NodeJS.ErrnoException).code
      });
    });

    const out = readline.createInterface({ input: worker.stdout });
    out.on('line', (line) => {
      if (socket.readyState === socket.OPEN) socket.send(line);
    });
    readline
      .createInterface({ input: worker.stderr })
      .on('line', (line) => logger.warn('voice.stream.worker.stderr', { line }));
    worker.on('close', (code) => {
      logger.info('voice.stream.worker.closed', { code });
      if (socket.readyState === socket.OPEN) socket.close();
    });

    socket.on('message', (data: Buffer, isBinary: boolean) => {
      if (isBinary) {
        if (worker.stdin.writable) worker.stdin.write(frame(TYPE_AUDIO, data));
        return;
      }
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'finalize') {
          if (worker.stdin.writable) worker.stdin.write(frame(TYPE_FINALIZE, Buffer.alloc(0)));
        } else if (msg.type === 'reset') {
          if (worker.stdin.writable) worker.stdin.write(frame(TYPE_RESET, Buffer.alloc(0)));
        }
      } catch {
        /* ignore malformed control frames */
      }
    });

    socket.on('close', () => {
      if (!worker.killed) worker.kill('SIGTERM');
    });

    socket.on('error', () => {
      if (!worker.killed) worker.kill('SIGTERM');
    });
  });

  logger.info('voice.stream.gateway.attached', { path: '/api/voice/stream' });
  return wss;
}
