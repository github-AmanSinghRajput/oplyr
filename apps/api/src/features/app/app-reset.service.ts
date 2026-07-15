import { isDatabaseConfigured } from '../../db/client.js';
import { withTransaction } from '../../db/transaction.js';
import { isBrainDatabaseConfigured } from '../../db/brain-client.js';
import { withBrainTransaction } from '../../db/brain-transaction.js';
import { logger } from '../../lib/logger.js';

const resetStatements = [
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
    if (isDatabaseConfigured()) {
      await withTransaction(async (database) => {
        for (const statement of resetStatements) {
          database.exec(statement);
        }
      });
    }

    // The brain lives in its OWN database (brain.db), completely separate from runtime.db. The wipe
    // above never touched it — which is why Oplyr "kept remembering" after a reset. Clear every
    // brain_* table so a reset truly forgets everything. Done in its own guarded block so a brain
    // hiccup can't undo the runtime reset that already succeeded.
    if (isBrainDatabaseConfigured()) {
      try {
        withBrainTransaction((database) => {
          // Discover tables dynamically (names come from our own schema via sqlite_master, never user
          // input) so this stays correct as brain migrations add/rename tables.
          const tables = database
            .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'brain_%'")
            .all() as { name: string }[];
          for (const { name } of tables) {
            database.exec(`DELETE FROM ${name}`);
          }
        });
      } catch (error) {
        logger.error('app.reset.brain_wipe_failed', {
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }
}
