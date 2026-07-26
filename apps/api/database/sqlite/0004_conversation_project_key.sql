-- Per-project chat history.
--
-- Conversation sessions were keyed on `workspace_id`, which is always NULL in the local runtime, so
-- every connected folder shared ONE global conversation. Key sessions on the project instead (its
-- root path) so each folder gets its own chat history. The Brain stays global on purpose — only chat
-- is scoped here.
--
-- Existing rows keep `project_key = NULL`, so prior global history becomes the "no folder connected"
-- conversation — preserved, just re-scoped. No data loss.
ALTER TABLE conversation_sessions ADD COLUMN project_key TEXT;

CREATE INDEX IF NOT EXISTS idx_conversation_sessions_project_key
  ON conversation_sessions (project_key);
