import { getDatabase, isDatabaseConfigured } from '../../db/client.js';
import { withTransaction } from '../../db/transaction.js';
import { getWorkspaceState } from '../../runtime.js';
import type { ChatAttachment, ChatMessage } from '../../types.js';

interface PersistedSession {
  id: string;
  projectKey: string | null;
}

export class ChatRepository {
  private session: PersistedSession | null = null;

  // Chat history is scoped to the connected project. Mirror the Brain's key (`id ?? projectRoot`);
  // in the local runtime `id` is always null, so this is effectively the project's root path. A null
  // key = "no folder connected" (its own conversation, and where pre-scoping global history lives).
  private currentProjectKey(): string | null {
    const workspace = getWorkspaceState();
    return workspace.id ?? workspace.projectRoot ?? null;
  }

  /** The cached session, but only if it still belongs to the currently-connected project. */
  private cachedSessionForCurrentProject(): PersistedSession | null {
    const projectKey = this.currentProjectKey();
    return this.session && this.session.projectKey === projectKey ? this.session : null;
  }

  async listRecentMessages(limit = 120): Promise<ChatMessage[]> {
    if (!isDatabaseConfigured()) {
      return [];
    }

    const database = getDatabase();
    const session = await this.resolveSession();
    if (!session) {
      return [];
    }

    const rows = database
      .prepare(
        `
        SELECT id, role, source, content, attachments_json, created_at, author_provider_id
        FROM conversation_messages
        WHERE session_id = ?
        ORDER BY created_at DESC
        LIMIT ?
      `
      )
      .all(session.id, limit) as {
      id: string;
      role: ChatMessage['role'];
      source: ChatMessage['source'];
      content: string;
      attachments_json: string;
      created_at: string;
      author_provider_id: ChatMessage['authorProviderId'];
    }[];

    return rows.reverse().map((row) => ({
      id: row.id,
      role: row.role,
      source: row.source,
      text: row.content,
      attachments: parseAttachments(row.attachments_json),
      authorProviderId: row.author_provider_id ?? null,
      createdAt: new Date(row.created_at).toISOString()
    }));
  }

  async appendMessages(messages: ChatMessage[]) {
    if (!isDatabaseConfigured() || messages.length === 0) {
      return;
    }

    const session = await this.ensureSession();
    await withTransaction(async (database) => {
      const statement = database.prepare(
        `
          INSERT INTO conversation_messages (id, session_id, role, source, content, attachments_json, created_at, author_provider_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `
      );

      for (const message of messages) {
        statement.run(
          message.id,
          session.id,
          message.role,
          message.source,
          message.text || '',
          JSON.stringify(message.attachments ?? []),
          message.createdAt,
          message.authorProviderId ?? null
        );
      }
    });
  }

  async clearMessages() {
    if (!isDatabaseConfigured()) {
      return;
    }

    const session = await this.resolveSession();
    if (!session) {
      return;
    }

    await withTransaction(async (database) => {
      database.prepare('DELETE FROM conversation_messages WHERE session_id = ?').run(session.id);
      database.prepare('DELETE FROM conversation_sessions WHERE id = ?').run(session.id);
    });

    this.session = null;
  }

  async getActiveSessionId() {
    const session = await this.resolveSession();
    return session?.id ?? null;
  }

  private async ensureSession() {
    const cached = this.cachedSessionForCurrentProject();
    if (cached) {
      return cached;
    }

    const database = getDatabase();
    const projectKey = this.currentProjectKey();

    // Reuse this project's existing session if there is one; only create a new one otherwise. (The
    // old code always inserted, which could strand history across app restarts.)
    const existing = database
      .prepare(
        `
        SELECT id
        FROM conversation_sessions
        WHERE project_key IS ?
        ORDER BY created_at DESC
        LIMIT 1
      `
      )
      .get(projectKey) as { id: string } | undefined;

    const id =
      existing?.id ??
      (
        database
          .prepare(
            `
            INSERT INTO conversation_sessions (project_key)
            VALUES (?)
            RETURNING id
          `
          )
          .get(projectKey) as { id: string }
      ).id;

    this.session = { id, projectKey };
    return this.session;
  }

  private async resolveSession() {
    const cached = this.cachedSessionForCurrentProject();
    if (cached) {
      return cached;
    }

    const database = getDatabase();
    const projectKey = this.currentProjectKey();
    const result = database
      .prepare(
        `
        SELECT id, project_key
        FROM conversation_sessions
        WHERE project_key IS ?
        ORDER BY created_at DESC
        LIMIT 1
      `
      )
      .get(projectKey) as { id: string; project_key: string | null } | undefined;

    if (!result) {
      // Don't cache a miss — ensureSession may create the session on the next write.
      return null;
    }

    this.session = { id: result.id, projectKey: result.project_key };
    return this.session;
  }
}

function parseAttachments(value: string | null) {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isChatAttachment);
  } catch {
    return [];
  }
}

function isChatAttachment(value: unknown): value is ChatAttachment {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.mimeType === 'string' &&
    typeof candidate.sizeBytes === 'number' &&
    (candidate.kind === 'image' ||
      candidate.kind === 'text' ||
      candidate.kind === 'code' ||
      candidate.kind === 'file') &&
    typeof candidate.createdAt === 'string' &&
    (candidate.excerpt === null || typeof candidate.excerpt === 'string')
  );
}
