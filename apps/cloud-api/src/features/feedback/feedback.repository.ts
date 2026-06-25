import { getDatabasePool } from '../../db/client.js';

export class FeedbackRepository {
  async create(input: { installId?: string; email?: string; category: string; message: string }) {
    const pool = getDatabasePool();
    const result = await pool.query(
      `INSERT INTO app_feedback (install_id, email, category, message)
       VALUES ($1, $2, $3, $4)
       RETURNING id, install_id, email, category, message, created_at`,
      [input.installId ?? null, input.email ?? null, input.category, input.message]
    );

    return result.rows[0];
  }
}
