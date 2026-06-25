import type DatabaseConstructor from 'better-sqlite3';
import { getDatabase } from './client.js';

type RuntimeDatabase = InstanceType<typeof DatabaseConstructor>;

export async function withTransaction<T>(work: (database: RuntimeDatabase) => Promise<T>) {
  const database = getDatabase();
  try {
    database.exec('BEGIN');
    const result = await work(database);
    database.exec('COMMIT');
    return result;
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}
