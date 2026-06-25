import { getDatabase, isDatabaseConfigured } from '../../db/client.js';

interface UserRecord {
  id: string;
  email: string | null;
  displayName: string | null;
  createdAt: string;
  updatedAt: string;
}

export class UserRepository {
  async upsertLocalOperator(input: { email: string; displayName: string }) {
    if (!isDatabaseConfigured()) {
      return null;
    }

    const database = getDatabase();
    const result = database
      .prepare(
        `
        INSERT INTO app_users (email, display_name)
        VALUES (?, ?)
        ON CONFLICT (email)
        DO UPDATE SET
          display_name = excluded.display_name,
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        RETURNING id, email, display_name, created_at, updated_at
      `
      )
      .get(input.email, input.displayName) as
      | {
          id: string;
          email: string | null;
          display_name: string | null;
          created_at: string;
          updated_at: string;
        }
      | undefined;

    return this.toRecord(result ?? null);
  }

  private toRecord(
    row: {
      id: string;
      email: string | null;
      display_name: string | null;
      created_at: string;
      updated_at: string;
    } | null
  ): UserRecord | null {
    if (!row) {
      return null;
    }

    return {
      id: row.id,
      email: row.email,
      displayName: row.display_name,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString()
    };
  }
}
