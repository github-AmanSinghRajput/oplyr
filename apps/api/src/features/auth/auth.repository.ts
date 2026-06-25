import { getDatabase, isDatabaseConfigured } from '../../db/client.js';

interface ReplaceSessionInput {
  userId?: string | null;
  provider: string;
  providerSubject?: string | null;
  accessScope?: string[];
}

export class AuthRepository {
  async replaceProviderSession(input: ReplaceSessionInput) {
    if (!isDatabaseConfigured()) {
      return;
    }

    const database = getDatabase();
    database.prepare('DELETE FROM app_sessions WHERE provider = ?').run(input.provider);
    database
      .prepare(
        `
        INSERT INTO app_sessions (user_id, provider, provider_subject, access_scope)
        VALUES (?, ?, ?, ?)
      `
      )
      .run(
        input.userId ?? null,
        input.provider,
        input.providerSubject ?? null,
        JSON.stringify(input.accessScope ?? [])
      );
  }

  async clearProviderSession(provider: string) {
    if (!isDatabaseConfigured()) {
      return;
    }

    const database = getDatabase();
    database.prepare('DELETE FROM app_sessions WHERE provider = ?').run(provider);
  }

  async listSessions(limit = 10) {
    if (!isDatabaseConfigured()) {
      return [];
    }

    const database = getDatabase();
    const rows = database
      .prepare(
        `
        SELECT id, provider, provider_subject, access_scope, created_at, expires_at
        FROM app_sessions
        ORDER BY created_at DESC
        LIMIT ?
      `
      )
      .all(limit) as {
      id: string;
      provider: string;
      provider_subject: string | null;
      access_scope: string | null;
      created_at: string;
      expires_at: string | null;
    }[];

    return rows.map((row) => ({
      id: row.id,
      provider: row.provider,
      providerSubject: row.provider_subject,
      accessScope: parseStringArray(row.access_scope),
      createdAt: new Date(row.created_at).toISOString(),
      expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : null
    }));
  }
}

function parseStringArray(value: string | null) {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}
