import fs from 'node:fs';
import path from 'node:path';
import DatabaseConstructor from 'better-sqlite3';
import { env } from '../config/env.js';
import {
  getConfiguredRuntimeDatabasePath,
  getDefaultRuntimeDatabasePath as getFallbackRuntimeDatabasePath
} from '../runtime-paths.js';
import { getRootDir } from '../store.js';

type RuntimeDatabase = InstanceType<typeof DatabaseConstructor>;

let database: RuntimeDatabase | null = null;
let databasePath: string | null = null;

function resolveConfiguredPath() {
  return getConfiguredRuntimeDatabasePath(env.runtimeDatabasePath);
}

function getDefaultRuntimeDatabasePath() {
  if (env.appEnv === 'test') {
    return ':memory:';
  }

  const configured = resolveConfiguredPath();
  if (configured) {
    return configured;
  }

  return getFallbackRuntimeDatabasePath();
}

function ensureDatabaseDirectory(filePath: string) {
  if (filePath === ':memory:') {
    return;
  }

  // The runtime DB holds transcripts, chat history, and attachment records — private to this user.
  // Create the directory owner-only so a co-user on a shared Mac can't read it.
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
}

// Restrict the DB file (and its WAL/SHM sidecars) to the owner. Best-effort: chmod is a no-op on
// filesystems/platforms without POSIX modes, and must never block startup.
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

function applyMigrations(db: RuntimeDatabase) {
  // In a packaged app the source tree doesn't exist, so the migrations dir is shipped separately and
  // pointed at via OPLYR_MIGRATIONS_DIR. Falls back to the in-repo path for dev.
  const migrationsDir =
    process.env.OPLYR_MIGRATIONS_DIR?.trim() || path.join(getRootDir(), 'apps/api/database/sqlite');
  const files = fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  db.exec(`
    CREATE TABLE IF NOT EXISTS runtime_schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )
  `);

  const applied = new Set<string>(
    db
      .prepare('SELECT filename FROM runtime_schema_migrations ORDER BY filename')
      .all()
      .map((row) => String((row as { filename: string }).filename))
  );

  const insertMigration = db.prepare('INSERT INTO runtime_schema_migrations (filename) VALUES (?)');

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

function createDatabase(filePath: string) {
  ensureDatabaseDirectory(filePath);
  const db = new DatabaseConstructor(filePath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  applyMigrations(db);
  // WAL mode creates the -wal/-shm sidecars; lock them all down to the owner.
  restrictDatabaseFilePermissions(filePath);
  return db;
}

export function isDatabaseConfigured() {
  return true;
}

export function getRuntimeDatabasePath() {
  if (!databasePath) {
    databasePath = getDefaultRuntimeDatabasePath();
  }

  return databasePath;
}

export function getDatabase() {
  if (!database) {
    databasePath = getDefaultRuntimeDatabasePath();
    database = createDatabase(databasePath);
  }

  return database;
}

export async function initializeDatabase() {
  getDatabase();
  return {
    path: getRuntimeDatabasePath()
  };
}

export async function checkDatabaseConnection() {
  try {
    const db = getDatabase();
    db.prepare('select 1').get();
    return {
      configured: true,
      reachable: true,
      message: `SQLite runtime database ready at ${getRuntimeDatabasePath()}.`
    };
  } catch (error) {
    return {
      configured: true,
      reachable: false,
      message:
        error instanceof Error ? error.message : 'SQLite runtime database failed to initialize.'
    };
  }
}

export async function closeDatabasePool() {
  if (!database) {
    return;
  }

  database.close();
  database = null;
}
