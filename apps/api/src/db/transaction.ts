import type DatabaseConstructor from 'better-sqlite3';
import { getDatabase } from './client.js';

type RuntimeDatabase = InstanceType<typeof DatabaseConstructor>;

export async function withTransaction<T>(work: (database: RuntimeDatabase) => Promise<T>) {
  const database = getDatabase();

  // better-sqlite3 shares a single connection, so a nested withTransaction would otherwise throw
  // "cannot start a transaction within a transaction". Let the outermost call own the boundary.
  if (database.inTransaction) {
    return work(database);
  }

  database.exec('BEGIN');
  try {
    const result = await work(database);
    database.exec('COMMIT');
    return result;
  } catch (error) {
    // Only roll back if a transaction is still open; otherwise ROLLBACK throws and masks `error`.
    if (database.inTransaction) {
      database.exec('ROLLBACK');
    }
    throw error;
  }
}
