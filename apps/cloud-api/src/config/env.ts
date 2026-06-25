import path from 'node:path';
import dotenv from 'dotenv';
import { getRootDir } from '../store.js';

dotenv.config({ path: path.join(getRootDir(), '.env') });

function getNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getBoolean(value: string | undefined, fallback: boolean) {
  if (value === undefined) {
    return fallback;
  }

  return value === 'true';
}

export const env = {
  appEnv: process.env.APP_ENV ?? 'development',
  port: getNumber(process.env.CLOUD_API_PORT, 8788),
  host: process.env.CLOUD_API_HOST?.trim() || '127.0.0.1',
  allowedOrigin: process.env.CLOUD_ALLOWED_ORIGIN?.trim() || 'http://localhost:3000',
  databaseUrl: process.env.CLOUD_DATABASE_URL?.trim() || '',
  databaseSsl: getBoolean(process.env.CLOUD_DATABASE_SSL, false),
  adminToken: process.env.CLOUD_ADMIN_TOKEN?.trim() || ''
};

export function validateEnv() {
  const validEnvironments = new Set(['development', 'test', 'production']);

  if (!validEnvironments.has(env.appEnv)) {
    throw new Error(
      `APP_ENV must be one of development, test, production. Received: ${env.appEnv}`
    );
  }

  if (env.port <= 0) {
    throw new Error(`CLOUD_API_PORT must be a positive number. Received: ${env.port}`);
  }

  if (!env.host.trim()) {
    throw new Error('CLOUD_API_HOST must not be empty.');
  }

  if (!env.allowedOrigin.trim()) {
    throw new Error('CLOUD_ALLOWED_ORIGIN must not be empty.');
  }

  try {
    new URL(env.allowedOrigin);
  } catch {
    throw new Error(
      `CLOUD_ALLOWED_ORIGIN must be a valid absolute URL. Received: ${env.allowedOrigin}`
    );
  }

  if (env.appEnv === 'production' && !env.databaseUrl) {
    throw new Error('CLOUD_DATABASE_URL is required in production.');
  }

  if (env.databaseUrl) {
    try {
      const parsed = new URL(env.databaseUrl);
      if (!parsed.protocol.startsWith('postgres')) {
        throw new Error('CLOUD_DATABASE_URL must use postgres:// or postgresql://.');
      }
    } catch (error) {
      throw new Error(
        error instanceof Error
          ? `CLOUD_DATABASE_URL is invalid. ${error.message}`
          : 'CLOUD_DATABASE_URL is invalid.'
      );
    }
  }
}
