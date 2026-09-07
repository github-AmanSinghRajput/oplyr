import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { getDatabase, getRuntimeDatabasePath, isDatabaseConfigured } from '../../db/client.js';
import { withTransaction } from '../../db/transaction.js';
import { getBrainDatabase, isBrainDatabaseConfigured } from '../../db/brain-client.js';
import { withBrainTransaction } from '../../db/brain-transaction.js';
import {
  getModelsInstallDir,
  getPortableAssistantCwd,
  getUserDataDir
} from '../../runtime-paths.js';
import { logger } from '../../lib/logger.js';

/**
 * "Reset Oplyr" means the app looks freshly installed: no memories, no workspaces, no chats, no
 * codebase maps, no notes, no cached files. Everything Oplyr put on this Mac goes, discovered
 * dynamically rather than from a hand-maintained list — the previous version named seven tables
 * explicitly and so left the user record, codebase maps, AI file summaries and notes behind, plus
 * every attachment and cache on disk.
 *
 * Two deliberate exceptions, both because removing them would break the running app rather than
 * make it look new:
 *  - the `*_schema_migrations` ledgers, which record which migrations have run. They are the app's
 *    own bookkeeping, not user data; wiping them made every later boot re-run the whole set.
 *  - `.local-api-auth-token`, which the live renderer is authenticating with right now. The API
 *    keeps it in memory, so deleting the file would only desynchronise the two and 401 the session.
 *    A genuine reinstall regenerates it anyway.
 *
 * Electron's own profile data (Cache/, Cookies, GPUCache, Preferences, window bounds) is left alone
 * too: it belongs to the shell, not to Oplyr's data, and clearing it mid-run is a good way to
 * corrupt a window.
 */
export class AppResetService {
  async resetPersistedData() {
    await this.wipeDatabase();
    await this.wipeBrain();
    await this.wipeFiles();
  }

  /** Every table in runtime.db except the migration ledger. */
  private async wipeDatabase() {
    if (!isDatabaseConfigured()) {
      return;
    }
    try {
      const names = this.tableNames(getDatabase(), 'runtime_schema_migrations');
      await withTransaction(async (database) => {
        // Order is irrelevant with foreign_keys deferred inside a transaction, but delete children
        // first anyway so a partial failure can't leave orphans behind.
        for (const name of names) {
          database.exec(`DELETE FROM ${name}`);
        }
      });
      logger.info('app.reset.runtime_wiped', { tables: names.length });
    } catch (error) {
      logger.error('app.reset.runtime_wipe_failed', { error: describe(error) });
      throw error;
    }
  }

  /** The brain lives in its OWN database, so the wipe above never touches it. */
  private async wipeBrain() {
    if (!isBrainDatabaseConfigured()) {
      return;
    }
    // Guarded separately so a brain hiccup can't undo the runtime reset that already succeeded.
    try {
      const names = this.tableNames(getBrainDatabase(), 'brain_schema_migrations');
      withBrainTransaction((database) => {
        for (const name of names) {
          database.exec(`DELETE FROM ${name}`);
        }
      });
      logger.info('app.reset.brain_wiped', { tables: names.length });
    } catch (error) {
      logger.error('app.reset.brain_wipe_failed', { error: describe(error) });
    }
  }

  /** Files Oplyr owns: uploaded attachments, the assistant scratch dir, cached models, CLI caches. */
  private async wipeFiles() {
    const userData = getUserDataDir();
    const targets = [
      path.join(
        path.dirname(getRuntimeDatabasePath() || path.join(userData, 'runtime.db')),
        'attachments'
      ),
      getPortableAssistantCwd(),
      getModelsInstallDir(),
      path.join(userData, 'models'),
      path.join(os.homedir(), '.oplyr')
    ];

    for (const target of targets) {
      try {
        await fsp.rm(target, { recursive: true, force: true });
      } catch (error) {
        // Never fail the reset over one stubborn file — the databases are already cleared.
        logger.warn('app.reset.path_remove_failed', { target, error: describe(error) });
      }
    }

    // The log is held open by the shell that spawned us, so truncate rather than unlink: removing
    // the file would leave the writer pointing at an unlinked inode and lose future output.
    try {
      await fsp.writeFile(path.join(userData, 'api-child.log'), '');
    } catch {
      /* best effort */
    }

    logger.info('app.reset.files_wiped', { targets: targets.length });
  }

  /** Table names from our own schema via sqlite_master — never user input. */
  private tableNames(database: ReturnType<typeof getDatabase>, keep: string): string[] {
    return (
      database
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != ?"
        )
        .all(keep) as { name: string }[]
    ).map((row) => row.name);
  }
}

function describe(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
