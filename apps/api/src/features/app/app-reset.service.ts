import { isDatabaseConfigured } from '../../db/client.js';
import { withTransaction } from '../../db/transaction.js';

const resetStatements = [
  'DELETE FROM note_chunks',
  'DELETE FROM notes',
  'DELETE FROM approval_events',
  'DELETE FROM conversation_attachments',
  'DELETE FROM conversation_messages',
  'DELETE FROM conversation_sessions',
  'DELETE FROM app_sessions',
  'DELETE FROM workspaces',
  'DELETE FROM app_preferences'
] as const;

export class AppResetService {
  async resetPersistedData() {
    if (!isDatabaseConfigured()) {
      return;
    }

    await withTransaction(async (database) => {
      for (const statement of resetStatements) {
        database.exec(statement);
      }
    });
  }
}
