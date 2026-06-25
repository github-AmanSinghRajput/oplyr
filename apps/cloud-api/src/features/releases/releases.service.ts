import { AppError } from '../../lib/errors.js';
import { ReleasesRepository } from './releases.repository.js';

export class ReleasesService {
  constructor(private readonly repository = new ReleasesRepository()) {}

  async getLatestRelease(channel = 'beta') {
    const release = await this.repository.getLatestPublished(channel);
    if (!release) {
      throw new AppError(404, 'No published release found for this channel.', 'RELEASE_NOT_FOUND');
    }

    return release;
  }

  publishRelease(input: {
    channel?: string;
    version: string;
    title: string;
    notes?: string;
    dmgUrl: string;
    minimumSupportedVersion?: string;
  }) {
    return this.repository.createRelease({
      channel: input.channel?.trim() || 'beta',
      version: input.version.trim(),
      title: input.title.trim(),
      notes: input.notes?.trim() || '',
      dmgUrl: input.dmgUrl.trim(),
      minimumSupportedVersion: input.minimumSupportedVersion?.trim()
    });
  }

  recordDownload(input: {
    leadId?: string;
    inviteId?: string;
    releaseId?: string;
    ipAddress?: string;
    userAgent?: string;
  }) {
    return this.repository.recordDownload(input);
  }
}
