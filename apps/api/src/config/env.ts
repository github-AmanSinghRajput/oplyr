import path from 'node:path';
import dotenv from 'dotenv';
import { getRootDir } from '../store.js';
import { resolvePortablePath } from '../runtime-paths.js';

dotenv.config({ path: path.join(getRootDir(), '.env') });

function getNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function assertOneOf(value: string, fieldName: string, validValues: string[]) {
  if (!validValues.includes(value)) {
    throw new Error(`${fieldName} must be one of ${validValues.join(', ')}. Received: ${value}`);
  }
}

export const env = {
  appEnv: process.env.APP_ENV ?? 'development',
  port: getNumber(process.env.API_PORT, 8787),
  host: process.env.API_HOST?.trim() || '127.0.0.1',
  allowedOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  allowedWorkspaceRoots: (process.env.ALLOWED_WORKSPACE_ROOTS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
  localApiAuthToken: process.env.LOCAL_API_AUTH_TOKEN?.trim() || '',
  voiceLocale: process.env.VOICE_LOCALE ?? 'en-US',
  codexModel: process.env.CODEX_MODEL?.trim() || '',
  codexReasoningEffort: process.env.CODEX_REASONING_EFFORT?.trim() || '',
  speechModelVersion: process.env.SPEECH_MODEL_VERSION?.trim() || 'v3',
  transcriptionLanguageCode: process.env.TRANSCRIPTION_LANGUAGE_CODE?.trim() || 'en',
  runtimeDatabasePath: resolvePortablePath(process.env.RUNTIME_DATABASE_PATH) || '',
  queueProvider: process.env.QUEUE_PROVIDER ?? 'inline',
  emailProvider: process.env.EMAIL_PROVIDER ?? 'none',
  vectorProvider: process.env.VECTOR_PROVIDER ?? 'none',
  ragProvider: process.env.RAG_PROVIDER ?? 'none',
  ocrProvider: process.env.OCR_PROVIDER ?? 'none'
};

export function validateEnv() {
  const validEnvironments = new Set(['development', 'test', 'production']);
  const providerValues = ['none', 'inline', 'redis'];
  const integrationValues = ['none', 'postgres', 'provider'];

  if (!validEnvironments.has(env.appEnv)) {
    throw new Error(
      `APP_ENV must be one of development, test, production. Received: ${env.appEnv}`
    );
  }

  if (!env.allowedOrigin.trim()) {
    throw new Error('CORS_ORIGIN must not be empty.');
  }

  try {
    new URL(env.allowedOrigin);
  } catch {
    throw new Error(`CORS_ORIGIN must be a valid absolute URL. Received: ${env.allowedOrigin}`);
  }

  if (env.port <= 0) {
    throw new Error(`API_PORT must be a positive number. Received: ${env.port}`);
  }

  if (!env.host.trim()) {
    throw new Error('API_HOST must not be empty.');
  }

  if (env.codexReasoningEffort) {
    assertOneOf(env.codexReasoningEffort, 'CODEX_REASONING_EFFORT', [
      'minimal',
      'low',
      'medium',
      'high',
      'xhigh'
    ]);
  }

  assertOneOf(env.queueProvider, 'QUEUE_PROVIDER', providerValues);
  assertOneOf(env.emailProvider, 'EMAIL_PROVIDER', ['none', 'resend', 'sendgrid']);
  assertOneOf(env.vectorProvider, 'VECTOR_PROVIDER', integrationValues);
  assertOneOf(env.ragProvider, 'RAG_PROVIDER', ['none', 'postgres']);
  assertOneOf(env.ocrProvider, 'OCR_PROVIDER', ['none', 'textract', 'vision']);

  // STT (Parakeet) is intentionally not hard-validated here: first run happens before the
  // local model is installed, and the app must still boot so the voice bootstrap loader can
  // install and warm it. A missing/failed worker surfaces at use time as VOICE_STT_FAILED.

  if (env.runtimeDatabasePath) {
    const resolved = env.runtimeDatabasePath;
    if (resolved.includes('\0')) {
      throw new Error('RUNTIME_DATABASE_PATH must not contain null bytes.');
    }
  }
}
