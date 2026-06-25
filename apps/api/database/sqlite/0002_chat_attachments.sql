ALTER TABLE conversation_messages ADD COLUMN attachments_json TEXT NOT NULL DEFAULT '[]';

CREATE TABLE IF NOT EXISTS conversation_attachments (
  id TEXT PRIMARY KEY NOT NULL,
  message_id TEXT REFERENCES conversation_messages(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  kind TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  excerpt_text TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_conversation_attachments_message_id
  ON conversation_attachments(message_id);
