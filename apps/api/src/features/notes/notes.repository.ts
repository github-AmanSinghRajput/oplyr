import { getDatabase, isDatabaseConfigured } from '../../db/client.js';
import { withTransaction } from '../../db/transaction.js';

interface CreateNoteInput {
  title: string;
  body: string;
  source?: string;
  workspaceId?: string | null;
  ownerUserId?: string | null;
  chunks?: string[];
}

interface UpdateNoteInput {
  title: string;
  body: string;
  source?: string;
  chunks?: string[];
}

export class NotesRepository {
  async createNote(input: CreateNoteInput) {
    if (!isDatabaseConfigured()) {
      return null;
    }

    return withTransaction(async (database) => {
      const noteResult = database
        .prepare(
          `
          INSERT INTO notes (owner_user_id, workspace_id, title, body, source)
          VALUES (?, ?, ?, ?, ?)
          RETURNING id
        `
        )
        .get(
          input.ownerUserId ?? null,
          input.workspaceId ?? null,
          input.title,
          input.body,
          input.source ?? 'meeting'
        ) as { id: string };

      const noteId = noteResult.id;
      const chunks = input.chunks ?? [];
      const chunkStatement = database.prepare(
        `
          INSERT INTO note_chunks (note_id, chunk_index, content)
          VALUES (?, ?, ?)
        `
      );

      for (const [index, chunk] of chunks.entries()) {
        chunkStatement.run(noteId, index, chunk);
      }

      return {
        id: noteId
      };
    });
  }

  async listRecentNotes(limit = 20) {
    if (!isDatabaseConfigured()) {
      return [];
    }

    const database = getDatabase();
    const rows = database
      .prepare(
        `
        SELECT id, title, body, source, created_at, updated_at
        FROM notes
        ORDER BY created_at DESC
        LIMIT ?
      `
      )
      .all(limit) as {
      id: string;
      title: string;
      body: string;
      source: string;
      created_at: string;
      updated_at: string;
    }[];

    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      body: row.body,
      source: row.source,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString()
    }));
  }

  async updateNote(noteId: string, input: UpdateNoteInput) {
    if (!isDatabaseConfigured()) {
      return null;
    }

    return withTransaction(async (database) => {
      const noteResult = database
        .prepare(
          `
          UPDATE notes
          SET title = ?,
              body = ?,
              source = ?,
              updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
          WHERE id = ?
          RETURNING id
        `
        )
        .get(input.title, input.body, input.source ?? 'meeting', noteId) as
        | { id: string }
        | undefined;

      if (!noteResult?.id) {
        return null;
      }

      database.prepare('DELETE FROM note_chunks WHERE note_id = ?').run(noteId);
      const chunkStatement = database.prepare(
        `
          INSERT INTO note_chunks (note_id, chunk_index, content)
          VALUES (?, ?, ?)
        `
      );

      for (const [index, chunk] of (input.chunks ?? []).entries()) {
        chunkStatement.run(noteId, index, chunk);
      }

      return {
        id: noteId
      };
    });
  }

  async deleteNote(noteId: string) {
    if (!isDatabaseConfigured()) {
      return false;
    }

    const database = getDatabase();
    const result = database
      .prepare(
        `
        DELETE FROM notes
        WHERE id = ?
      `
      )
      .run(noteId);

    return result.changes > 0;
  }
}
