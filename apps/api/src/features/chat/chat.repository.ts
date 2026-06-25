import { getDatabase, isDatabaseConfigured } from '../../db/client.js';
import { withTransaction } from '../../db/transaction.js';
import { getWorkspaceState } from '../../runtime.js';
import type { ChatAttachment, ChatMessage } from '../../types.js';

interface PersistedSession {
  id: string;
  workspaceId: string | null;
}

export class ChatRepository {
  private session: PersistedSession | null = null;

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
        SELECT id, role, source, content, attachments_json, created_at
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
    }[];

    return rows.reverse().map((row) => ({
      id: row.id,
      role: row.role,
      source: row.source,
      text: row.content,
      attachments: parseAttachments(row.attachments_json),
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
          INSERT INTO conversation_messages (id, session_id, role, source, content, attachments_json, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
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
          message.createdAt
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
    if (this.session) {
      const workspaceId = getWorkspaceState().id ?? null;
      if (this.session.workspaceId === workspaceId) {
        return this.session;
      }
    }

    const database = getDatabase();
    const workspaceId = getWorkspaceState().id ?? null;
    const result = database
      .prepare(
        `
        INSERT INTO conversation_sessions (workspace_id)
        VALUES (?)
        RETURNING id
      `
      )
      .get(workspaceId) as { id: string };

    this.session = {
      id: result.id,
      workspaceId
    };

    return this.session;
  }

  private async resolveSession() {
    if (this.session) {
      return this.session;
    }

    const database = getDatabase();
    const result = database
      .prepare(
        `
        SELECT id, workspace_id
        FROM conversation_sessions
        WHERE workspace_id IS ?
        ORDER BY created_at DESC
        LIMIT 1
      `
      )
      .get(getWorkspaceState().id ?? null) as
      | { id: string; workspace_id: string | null }
      | undefined;

    if (!result) {
      return null;
    }

    this.session = {
      id: result.id,
      workspaceId: result.workspace_id
    };

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
