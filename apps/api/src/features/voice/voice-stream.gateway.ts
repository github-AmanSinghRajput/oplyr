import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import readline from 'node:readline';
import type { Server } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';
import { matchesLocalApiAuthToken } from '../../lib/local-api-auth.js';
import { getDefaultSttStreamWorkerCommand, resolveLoginShell } from '../../runtime-paths.js';

const TYPE_AUDIO = 0;
const TYPE_FINALIZE = 1;
const TYPE_RESET = 2;

// Hard cap on concurrent voice workers. Each connection spawns a native STT process; without a bound
// a buggy or hostile client could exhaust CPU/RAM/PIDs. The real product only ever opens one.
const MAX_CONCURRENT_STREAMS = 3;

interface VoiceStreamGatewayOptions {
  /** The resolved local API token — the SAME secret the HTTP layer enforces. Required to connect. */
  authToken?: string;
  /** Trusted browser origin (dev). The packaged file:// renderer sends a null/absent origin. */
  allowedOrigin?: string;
}

function isAllowedOrigin(origin: string | undefined, allowedOrigin: string): boolean {
  // The packaged renderer loads from file:// (origin absent or "null"); the dev renderer sends the
  // configured http origin. A hostile web page always sends its real http(s) origin, so it's rejected.
  if (!origin || origin === 'null') return true;
  if (origin === allowedOrigin) return true;
  return origin.startsWith('file://');
}

/** Environment for the STT worker, with the API token stripped — the worker never needs it. */
function workerEnv(): NodeJS.ProcessEnv {
  const clone: NodeJS.ProcessEnv = { ...process.env };
  delete clone.LOCAL_API_AUTH_TOKEN;
  return clone;
}

/** Attaches a /api/voice/stream WebSocket that bridges audio to the native speech worker (oplyr-stt). */
export function attachVoiceStreamGateway(server: Server, options: VoiceStreamGatewayOptions = {}) {
  const command = getDefaultSttStreamWorkerCommand();
  const expectedToken = options.authToken?.trim() ?? '';
  const allowedOrigin = options.allowedOrigin?.trim() || env.allowedOrigin;
  const wss = new WebSocketServer({ server, path: '/api/voice/stream' });
  let activeStreams = 0;

  wss.on('connection', (socket: WebSocket, request) => {
    // Fail closed: a matching token is REQUIRED, and the origin must be the trusted renderer. This
    // blocks any web page the user has open from opening the socket or spawning STT workers.
    const url = new URL(request.url ?? '', 'http://localhost');
    const providedToken = url.searchParams.get('token');
    if (
      !expectedToken ||
      !matchesLocalApiAuthToken(providedToken, expectedToken) ||
      !isAllowedOrigin(request.headers.origin, allowedOrigin)
    ) {
      socket.close(1008, 'Unauthorized');
      return;
    }

    if (activeStreams >= MAX_CONCURRENT_STREAMS) {
      logger.warn('voice.stream.rejected', { reason: 'max_concurrent', activeStreams });
      socket.close(1013, 'Too many active voice sessions');
      return;
    }

    if (!command) {
      socket.send(JSON.stringify({ type: 'error', message: 'Speech engine not configured.' }));
      socket.close();
      return;
    }

    activeStreams += 1;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      activeStreams -= 1;
    };

    const worker: ChildProcessWithoutNullStreams = spawn(resolveLoginShell(), ['-lc', command], {
      env: workerEnv(),
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
      release();
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
      release();
      if (!worker.killed) worker.kill('SIGTERM');
    });

    socket.on('error', () => {
      release();
      if (!worker.killed) worker.kill('SIGTERM');
    });
  });

  logger.info('voice.stream.gateway.attached', { path: '/api/voice/stream' });
  return wss;
}

function frame(type: number, payload: Buffer): Buffer {
  const header = Buffer.alloc(5);
  header[0] = type;
  header.writeUInt32BE(payload.length, 1);
  return Buffer.concat([header, payload]);
}
