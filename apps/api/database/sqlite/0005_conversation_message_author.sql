-- Agentic Chat (multi-agent room): every message has an author — the user, or a specific AI agent.
-- Track which provider authored each assistant reply so the transcript reads as a real "room" and the
-- next agent in a turn can see who said what. NULL = the user, or a pre-room single-agent reply.
ALTER TABLE conversation_messages ADD COLUMN author_provider_id TEXT;
