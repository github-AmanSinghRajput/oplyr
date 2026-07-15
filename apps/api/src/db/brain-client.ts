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
      execMigrationIdempotent(db, sql);
      insertMigration.run(file);
    });
    transaction();
  }
}

/**
 * Apply a migration that may already be partly (or fully) present. This handles brain.db files from
 * older builds where the schema was created before this filename-based tracking existed, so the
 * tracking table is empty even though columns/tables/indexes already exist — replaying the raw SQL
 * would otherwise crash on `duplicate column name` (SQLite has no `ADD COLUMN IF NOT EXISTS`).
 *
 * Fast path: run the whole file. If that throws an "already exists" class error, fall back to
 * running each statement on its own and tolerating ONLY that class of error — so any genuinely
 * missing statement still applies while pre-existing ones are skipped. Any other error propagates
 * (and rolls the migration back, since we're inside a transaction).
 */
function execMigrationIdempotent(db: BrainDatabase, sql: string) {
  try {
    db.exec(sql);
    return;
  } catch (error) {
    if (!isAlreadyExistsError(error)) {
      throw error;
    }
  }

  for (const statement of splitSqlStatements(sql)) {
    try {
      db.exec(statement);
    } catch (error) {
      if (!isAlreadyExistsError(error)) {
        throw error;
      }
    }
  }
}

function isAlreadyExistsError(error: unknown): boolean {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return message.includes('duplicate column name') || message.includes('already exists');
}

/**
 * Split a migration file into individual statements. The brain migrations are plain DDL — no
 * triggers/procedural bodies and no semicolons inside string or identifier literals — so splitting
 * on `;` after stripping line comments is safe here.
 */
function splitSqlStatements(sql: string): string[] {
  return sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean);
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
