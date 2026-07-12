import fs from 'node:fs';
import path from 'node:path';
import DatabaseConstructor from 'better-sqlite3';
import { env } from '../config/env.js';
import {
  getConfiguredBrainDatabasePath,
  getDefaultBrainDatabasePath as getFallbackBrainDatabasePath
} from '../runtime-paths.js';
import { getRootDir } from '../store.js';

type BrainDatabase = InstanceType<typeof DatabaseConstructor>;

let database: BrainDatabase | null = null;
let databasePath: string | null = null;

function resolveConfiguredPath() {
  return getConfiguredBrainDatabasePath(env.brainDatabasePath);
}

function getDefaultBrainDatabasePath() {
  if (env.appEnv === 'test') {
    return ':memory:';
  }

  const configured = resolveConfiguredPath();
  if (configured) {
    return configured;
  }

  return getFallbackBrainDatabasePath();
}

function ensureDatabaseDirectory(filePath: string) {
  if (filePath === ':memory:') {
    return;
  }

  // The brain stores long-lived developer context. Keep it owner-only like runtime.db.
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
}

function restrictDatabaseFilePermissions(filePath: string) {
  if (filePath === ':memory:' || process.platform === 'win32') {
    return;
  }

  for (const suffix of ['', '-wal', '-shm']) {
    try {
      fs.chmodSync(`${filePath}${suffix}`, 0o600);
    } catch {
      /* file may not exist yet or fs has no mode support */
    }
  }
}

function resolveMigrationsDir(configuredMigrationsDir?: string) {
  return (
    configuredMigrationsDir?.trim() ||
    process.env.OPLYR_BRAIN_MIGRATIONS_DIR?.trim() ||
    path.join(getRootDir(), 'apps/api/database/brain')
  );
}

function applyMigrations(db: BrainDatabase, migrationsDir = resolveMigrationsDir()) {
  const files = fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  db.exec(`
    CREATE TABLE IF NOT EXISTS brain_schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )
  `);

  const applied = new Set<string>(
    db
      .prepare('SELECT filename FROM brain_schema_migrations ORDER BY filename')
      .all()
      .map((row) => String((row as { filename: string }).filename))
  );

  const insertMigration = db.prepare('INSERT INTO brain_schema_migrations (filename) VALUES (?)');

  for (const file of files) {
    if (applied.has(file)) {
      continue;
    }

    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    const transaction = db.transaction(() => {
      db.exec(sql);
      insertMigration.run(file);
    });
    transaction();
  }
}

export function createBrainDatabase(filePath: string, options?: { migrationsDir?: string }) {
  ensureDatabaseDirectory(filePath);
  const db = new DatabaseConstructor(filePath);
  // Lock the file down BEFORE any schema/data is written (belt-and-suspenders — the parent dir is
  // already 0700). Re-applied after migrations to also cover the -wal/-shm sidecars WAL creates.
  restrictDatabaseFilePermissions(filePath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  applyMigrations(db, resolveMigrationsDir(options?.migrationsDir));
  restrictDatabaseFilePermissions(filePath);
  return db;
}

export function isBrainDatabaseConfigured() {
  return true;
}

export function getBrainDatabasePath() {
  if (!databasePath) {
    databasePath = getDefaultBrainDatabasePath();
  }

  return databasePath;
}

export function getBrainDatabase() {
  if (!database) {
    databasePath = getDefaultBrainDatabasePath();
    database = createBrainDatabase(databasePath);
  }

  return database;
}

export async function initializeBrainDatabase() {
  getBrainDatabase();
  return {
    path: getBrainDatabasePath()
  };
}

export async function checkBrainDatabaseConnection() {
  try {
    const db = getBrainDatabase();
    db.prepare('select 1').get();
    return {
      configured: true,
      reachable: true,
      message: `SQLite brain database ready at ${getBrainDatabasePath()}.`
    };
  } catch (error) {
    return {
      configured: true,
      reachable: false,
      message:
        error instanceof Error ? error.message : 'SQLite brain database failed to initialize.'
    };
  }
}

export async function closeBrainDatabase() {
  if (!database) {
    return;
  }

  database.close();
  database = null;
}
