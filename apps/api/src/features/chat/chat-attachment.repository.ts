import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getDatabase, getRuntimeDatabasePath, isDatabaseConfigured } from '../../db/client.js';
import { getRootDir } from '../../store.js';
import type { ChatAttachment, ChatAttachmentKind } from '../../types.js';

interface StoredChatAttachment extends ChatAttachment {
  messageId: string | null;
  storagePath: string;
}

const textExtensions = new Set([
  '.txt',
  '.md',
  '.mdx',
  '.json',
  '.yaml',
  '.yml',
  '.xml',
  '.csv',
  '.log'
]);

const codeExtensions = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.py',
  '.rb',
  '.go',
  '.rs',
  '.java',
  '.kt',
  '.swift',
  '.cpp',
  '.c',
  '.h',
  '.css',
  '.scss',
  '.html',
  '.sql',
  '.sh'
]);

function sanitizeFileName(fileName: string) {
  const trimmed = fileName.trim() || 'attachment';
  return trimmed.replace(/[/\\?%*:|"<>]/g, '-').slice(0, 120);
}

function getAttachmentKind(fileName: string, mimeType: string): ChatAttachmentKind {
  if (mimeType.startsWith('image/')) {
    return 'image';
  }

  const extension = path.extname(fileName).toLowerCase();
  if (codeExtensions.has(extension)) {
    return 'code';
  }

  if (mimeType.startsWith('text/') || textExtensions.has(extension)) {
    return 'text';
  }

  return 'file';
}

function getAttachmentStorageDir() {
  const databasePath = getRuntimeDatabasePath();
  if (databasePath === ':memory:') {
    return path.join(getRootDir(), '.local', 'attachments');
  }

  return path.join(path.dirname(databasePath), 'attachments');
}

function buildExcerpt(kind: ChatAttachmentKind, buffer: Buffer) {
  if (kind !== 'text' && kind !== 'code') {
    return null;
  }

  return buffer.toString('utf8', 0, Math.min(buffer.length, 4000)).trim() || null;
}

function toAttachment(row: {
  id: string;
  message_id: string | null;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  kind: ChatAttachmentKind;
  storage_path: string;
  excerpt_text: string | null;
  created_at: string;
}): StoredChatAttachment {
  return {
    id: row.id,
    name: row.file_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    kind: row.kind,
    createdAt: new Date(row.created_at).toISOString(),
    excerpt: row.excerpt_text,
    messageId: row.message_id,
    storagePath: row.storage_path
  };
}

export class ChatAttachmentRepository {
  async createUpload(input: {
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    buffer: Buffer;
  }): Promise<ChatAttachment> {
    if (!isDatabaseConfigured()) {
      throw new Error('Runtime database is unavailable.');
    }

    const database = getDatabase();
    const id = crypto.randomUUID();
    const safeFileName = sanitizeFileName(input.fileName);
    const extension = path.extname(safeFileName);
    const storageDir = getAttachmentStorageDir();
    const storagePath = path.join(storageDir, `${id}${extension}`);
    const kind = getAttachmentKind(safeFileName, input.mimeType);
    const excerpt = buildExcerpt(kind, input.buffer);

    await fs.mkdir(storageDir, { recursive: true });
    await fs.writeFile(storagePath, input.buffer);

    const row = database
      .prepare(
        `
        INSERT INTO conversation_attachments (
          id,
          message_id,
          file_name,
          mime_type,
          size_bytes,
          kind,
          storage_path,
          excerpt_text
        )
        VALUES (?, NULL, ?, ?, ?, ?, ?, ?)
        RETURNING id, message_id, file_name, mime_type, size_bytes, kind, storage_path, excerpt_text, created_at
      `
      )
      .get(id, safeFileName, input.mimeType, input.sizeBytes, kind, storagePath, excerpt) as {
      id: string;
      message_id: string | null;
      file_name: string;
      mime_type: string;
      size_bytes: number;
      kind: ChatAttachmentKind;
      storage_path: string;
      excerpt_text: string | null;
      created_at: string;
    };

    const attachment = toAttachment(row);
    return {
      id: attachment.id,
      name: attachment.name,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
      kind: attachment.kind,
      createdAt: attachment.createdAt,
      excerpt: attachment.excerpt
    };
  }

  async listByIds(ids: string[]) {
    if (!isDatabaseConfigured() || ids.length === 0) {
      return [];
    }

    const database = getDatabase();
    const placeholders = ids.map(() => '?').join(', ');
    const rows = database
      .prepare(
        `
        SELECT id, message_id, file_name, mime_type, size_bytes, kind, storage_path, excerpt_text, created_at
        FROM conversation_attachments
        WHERE id IN (${placeholders})
      `
      )
      .all(...ids) as {
      id: string;
      message_id: string | null;
      file_name: string;
      mime_type: string;
      size_bytes: number;
      kind: ChatAttachmentKind;
      storage_path: string;
      excerpt_text: string | null;
      created_at: string;
    }[];

    const attachments = rows.map(toAttachment);
    const order = new Map(ids.map((id, index) => [id, index]));
    attachments.sort((left, right) => (order.get(left.id) ?? 0) - (order.get(right.id) ?? 0));
    return attachments;
  }

  async assignToMessage(attachmentIds: string[], messageId: string) {
    if (!isDatabaseConfigured() || attachmentIds.length === 0) {
      return;
    }

    const database = getDatabase();
    const statement = database.prepare(
      `
        UPDATE conversation_attachments
        SET message_id = ?
        WHERE id = ?
      `
    );

    for (const attachmentId of attachmentIds) {
      statement.run(messageId, attachmentId);
    }
  }

  async getContent(attachmentId: string) {
    if (!isDatabaseConfigured()) {
      return null;
    }

    const database = getDatabase();
    const row = database
      .prepare(
        `
        SELECT id, message_id, file_name, mime_type, size_bytes, kind, storage_path, excerpt_text, created_at
        FROM conversation_attachments
        WHERE id = ?
      `
      )
      .get(attachmentId) as
      | {
          id: string;
          message_id: string | null;
          file_name: string;
          mime_type: string;
          size_bytes: number;
          kind: ChatAttachmentKind;
          storage_path: string;
          excerpt_text: string | null;
          created_at: string;
        }
      | undefined;

    if (!row) {
      return null;
    }

    const attachment = toAttachment(row);
    return {
      attachment,
      storagePath: attachment.storagePath
    };
  }

  async clearAll() {
    if (!isDatabaseConfigured()) {
      return;
    }

    const attachments = await this.listAll();
    const database = getDatabase();
    database.prepare('DELETE FROM conversation_attachments').run();

    await Promise.all(
      attachments.map((attachment) =>
        fs.rm(attachment.storagePath, { force: true }).catch(() => undefined)
      )
    );
  }

  private async listAll() {
    const database = getDatabase();
    const rows = database
      .prepare(
        `
        SELECT id, message_id, file_name, mime_type, size_bytes, kind, storage_path, excerpt_text, created_at
        FROM conversation_attachments
        ORDER BY created_at ASC
      `
      )
      .all() as {
      id: string;
      message_id: string | null;
      file_name: string;
      mime_type: string;
      size_bytes: number;
      kind: ChatAttachmentKind;
      storage_path: string;
      excerpt_text: string | null;
      created_at: string;
    }[];

    return rows.map(toAttachment);
  }
}
