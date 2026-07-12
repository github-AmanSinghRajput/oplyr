import type DatabaseConstructor from 'better-sqlite3';
import { getBrainDatabase } from './brain-client.js';

type BrainDatabase = InstanceType<typeof DatabaseConstructor>;

/**
 * Run `work` inside a real SQLite transaction. better-sqlite3 is fully synchronous, so we use its
 * own `.transaction()` wrapper (atomic BEGIN/COMMIT/ROLLBACK) rather than manual async exec — the
 * latter would let the event loop interleave other statements onto the same connection mid-transaction.
 * Re-entrant calls (already inside a transaction) just run the work directly.
 */
export function withBrainTransaction<T>(work: (database: BrainDatabase) => T): T {
  const database = getBrainDatabase();
  if (database.inTransaction) {
    return work(database);
  }
  return database.transaction(work)(database);
}
