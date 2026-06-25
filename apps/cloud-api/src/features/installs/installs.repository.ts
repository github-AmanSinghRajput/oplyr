import { getDatabasePool } from '../../db/client.js';

export class InstallsRepository {
  async upsertInstall(input: {
    installId: string;
    leadId?: string;
    inviteId?: string;
    releaseChannel: string;
    appVersion?: string;
    osVersion?: string;
    osArch?: string;
  }) {
    const pool = getDatabasePool();
    const result = await pool.query(
      `INSERT INTO app_installs (
         install_id,
         lead_id,
         invite_id,
         release_channel,
         app_version,
         os_version,
         os_arch
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (install_id)
       DO UPDATE SET
         lead_id = COALESCE(EXCLUDED.lead_id, app_installs.lead_id),
         invite_id = COALESCE(EXCLUDED.invite_id, app_installs.invite_id),
         release_channel = EXCLUDED.release_channel,
         app_version = COALESCE(EXCLUDED.app_version, app_installs.app_version),
         os_version = COALESCE(EXCLUDED.os_version, app_installs.os_version),
         os_arch = COALESCE(EXCLUDED.os_arch, app_installs.os_arch),
         last_seen_at = NOW()
       RETURNING id, install_id, lead_id, invite_id, release_channel, app_version, os_version, os_arch, first_seen_at, last_seen_at`,
      [
        input.installId,
        input.leadId ?? null,
        input.inviteId ?? null,
        input.releaseChannel,
        input.appVersion ?? null,
        input.osVersion ?? null,
        input.osArch ?? null
      ]
    );

    return result.rows[0];
  }
}
