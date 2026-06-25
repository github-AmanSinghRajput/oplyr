import { getDatabasePool } from '../../db/client.js';

export class ReleasesRepository {
  async getLatestPublished(channel: string) {
    const pool = getDatabasePool();
    const result = await pool.query(
      `SELECT id, channel, version, title, notes, dmg_url, minimum_supported_version, published_at
       FROM app_releases
       WHERE channel = $1
         AND published = TRUE
       ORDER BY published_at DESC
       LIMIT 1`,
      [channel]
    );

    return result.rows[0] ?? null;
  }

  async createRelease(input: {
    channel: string;
    version: string;
    title: string;
    notes: string;
    dmgUrl: string;
    minimumSupportedVersion?: string;
  }) {
    const pool = getDatabasePool();
    const result = await pool.query(
      `INSERT INTO app_releases (channel, version, title, notes, dmg_url, minimum_supported_version)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, channel, version, title, notes, dmg_url, minimum_supported_version, published_at`,
      [
        input.channel,
        input.version,
        input.title,
        input.notes,
        input.dmgUrl,
        input.minimumSupportedVersion ?? null
      ]
    );

    return result.rows[0];
  }

  async recordDownload(input: {
    leadId?: string;
    inviteId?: string;
    releaseId?: string;
    ipAddress?: string;
    userAgent?: string;
  }) {
    const pool = getDatabasePool();
    await pool.query(
      `INSERT INTO app_download_events (lead_id, invite_id, release_id, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        input.leadId ?? null,
        input.inviteId ?? null,
        input.releaseId ?? null,
        input.ipAddress ?? null,
        input.userAgent ?? null
      ]
    );
  }
}
