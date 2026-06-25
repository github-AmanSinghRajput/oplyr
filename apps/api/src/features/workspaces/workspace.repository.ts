import { getDatabase, isDatabaseConfigured } from '../../db/client.js';

interface PersistWorkspaceInput {
  name: string;
  rootPath: string;
  writeAccessEnabled: boolean;
}

export class WorkspaceRepository {
  async upsertWorkspace(input: PersistWorkspaceInput) {
    if (!isDatabaseConfigured()) {
      return null;
    }

    const database = getDatabase();
    const existing = database
      .prepare(
        `
        SELECT id
        FROM workspaces
        WHERE root_path = ?
        LIMIT 1
      `
      )
      .get(input.rootPath) as { id: string } | undefined;

    if (existing?.id) {
      const result = database
        .prepare(
          `
          UPDATE workspaces
          SET name = ?,
              write_access_enabled = ?,
              updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
          WHERE id = ?
          RETURNING id, name, root_path, write_access_enabled, updated_at
        `
        )
        .get(input.name, input.writeAccessEnabled ? 1 : 0, existing.id) as {
        id: string;
        name: string;
        root_path: string;
        write_access_enabled: number;
        updated_at: string;
      };

      return result ?? null;
    }

    const result = database
      .prepare(
        `
        INSERT INTO workspaces (name, root_path, write_access_enabled)
        VALUES (?, ?, ?)
        RETURNING id, name, root_path, write_access_enabled, updated_at
      `
      )
      .get(input.name, input.rootPath, input.writeAccessEnabled ? 1 : 0) as {
      id: string;
      name: string;
      root_path: string;
      write_access_enabled: number;
      updated_at: string;
    };

    return result ?? null;
  }

  async findLatestWorkspace() {
    if (!isDatabaseConfigured()) {
      return null;
    }

    const database = getDatabase();
    const result = database
      .prepare(
        `
        SELECT id, name, root_path, write_access_enabled, updated_at
        FROM workspaces
        ORDER BY updated_at DESC
        LIMIT 1
      `
      )
      .get() as
      | {
          id: string;
          name: string;
          root_path: string;
          write_access_enabled: number;
          updated_at: string;
        }
      | undefined;

    return result ?? null;
  }

  async findByRootPath(rootPath: string) {
    if (!isDatabaseConfigured()) {
      return null;
    }

    const database = getDatabase();
    const result = database
      .prepare(
        `
        SELECT id, name, root_path, write_access_enabled, updated_at
        FROM workspaces
        WHERE root_path = ?
        LIMIT 1
      `
      )
      .get(rootPath) as
      | {
          id: string;
          name: string;
          root_path: string;
          write_access_enabled: number;
          updated_at: string;
        }
      | undefined;

    return result ?? null;
  }
}
