import { InstallsRepository } from './installs.repository.js';

export class InstallsService {
  constructor(private readonly repository = new InstallsRepository()) {}

  registerInstall(input: {
    installId: string;
    leadId?: string;
    inviteId?: string;
    releaseChannel?: string;
    appVersion?: string;
    osVersion?: string;
    osArch?: string;
  }) {
    return this.repository.upsertInstall({
      installId: input.installId.trim(),
      leadId: input.leadId,
      inviteId: input.inviteId,
      releaseChannel: input.releaseChannel?.trim() || 'beta',
      appVersion: input.appVersion?.trim(),
      osVersion: input.osVersion?.trim(),
      osArch: input.osArch?.trim()
    });
  }
}
