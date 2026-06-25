import { getDatabasePool } from '../../db/client.js';

export interface BetaLeadInput {
  email: string;
  fullName?: string;
  role?: string;
  company?: string;
  useCase?: string;
  source?: string;
}

export class BetaRepository {
  async upsertLead(input: BetaLeadInput) {
    const pool = getDatabasePool();
    const result = await pool.query(
      `INSERT INTO beta_leads (email, full_name, role, company, use_case, source)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (email)
       DO UPDATE SET
         full_name = COALESCE(EXCLUDED.full_name, beta_leads.full_name),
         role = COALESCE(EXCLUDED.role, beta_leads.role),
         company = COALESCE(EXCLUDED.company, beta_leads.company),
         use_case = COALESCE(EXCLUDED.use_case, beta_leads.use_case),
         source = COALESCE(EXCLUDED.source, beta_leads.source),
         updated_at = NOW()
       RETURNING id, email, full_name, role, company, use_case, status, created_at, updated_at`,
      [
        input.email,
        input.fullName ?? null,
        input.role ?? null,
        input.company ?? null,
        input.useCase ?? null,
        input.source ?? 'website'
      ]
    );

    return result.rows[0];
  }

  async listLeads(limit: number) {
    const pool = getDatabasePool();
    const result = await pool.query(
      `SELECT id, email, full_name, role, company, use_case, status, created_at, updated_at
       FROM beta_leads
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit]
    );

    return result.rows;
  }

  async createInvite(input: {
    code: string;
    leadId?: string;
    releaseChannel: string;
    maxUses: number;
    expiresAt?: Date;
  }) {
    const pool = getDatabasePool();
    const result = await pool.query(
      `INSERT INTO beta_invites (code, lead_id, release_channel, max_uses, expires_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, code, lead_id, release_channel, status, max_uses, use_count, expires_at, created_at`,
      [
        input.code,
        input.leadId ?? null,
        input.releaseChannel,
        input.maxUses,
        input.expiresAt ?? null
      ]
    );

    return result.rows[0];
  }

  async findActiveInvite(code: string) {
    const pool = getDatabasePool();
    const result = await pool.query(
      `SELECT id, code, lead_id, release_channel, status, max_uses, use_count, expires_at, created_at
       FROM beta_invites
       WHERE code = $1
       LIMIT 1`,
      [code]
    );

    return result.rows[0] ?? null;
  }

  async incrementInviteUse(inviteId: string) {
    const pool = getDatabasePool();
    await pool.query(
      `UPDATE beta_invites
       SET use_count = use_count + 1,
           updated_at = NOW()
       WHERE id = $1`,
      [inviteId]
    );
  }
}
