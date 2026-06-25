import { getDatabase, isDatabaseConfigured } from '../../db/client.js';

interface RecordApprovalInput {
  workspaceId?: string | null;
  conversationSessionId?: string | null;
  taskTitle: string;
  taskSummary: string;
  approved: boolean;
}

export class ApprovalRepository {
  async recordDecision(input: RecordApprovalInput) {
    if (!isDatabaseConfigured()) {
      return;
    }

    const database = getDatabase();
    database
      .prepare(
        `
        INSERT INTO approval_events (workspace_id, conversation_session_id, task_title, task_summary, approved)
        VALUES (?, ?, ?, ?, ?)
      `
      )
      .run(
        input.workspaceId ?? null,
        input.conversationSessionId ?? null,
        input.taskTitle,
        input.taskSummary,
        input.approved ? 1 : 0
      );
  }

  async findWorkspaceIdByRootPath(rootPath: string) {
    if (!isDatabaseConfigured()) {
      return null;
    }

    const database = getDatabase();
    const result = database
      .prepare(
        `
        SELECT id
        FROM workspaces
        WHERE root_path = ?
        LIMIT 1
      `
      )
      .get(rootPath) as { id: string } | undefined;

    return result?.id ?? null;
  }

  async listRecent(limit = 20) {
    if (!isDatabaseConfigured()) {
      return [];
    }

    const database = getDatabase();
    const rows = database
      .prepare(
        `
        SELECT id, workspace_id, conversation_session_id, task_title, task_summary, approved, reviewed_at
        FROM approval_events
        ORDER BY reviewed_at DESC
        LIMIT ?
      `
      )
      .all(limit) as {
      id: string;
      workspace_id: string | null;
      conversation_session_id: string | null;
      task_title: string;
      task_summary: string;
      approved: number;
      reviewed_at: string;
    }[];

    return rows.map((row) => ({
      id: row.id,
      workspaceId: row.workspace_id,
      conversationSessionId: row.conversation_session_id,
      taskTitle: row.task_title,
      taskSummary: row.task_summary,
      approved: row.approved === 1,
      reviewedAt: new Date(row.reviewed_at).toISOString()
    }));
  }
}
