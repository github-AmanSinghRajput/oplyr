import assert from 'node:assert/strict';
import test from 'node:test';
import { InstallsService } from './installs.service.js';

class InstallsRepositoryStub {
  upsertInput: Record<string, unknown> | null = null;

  async upsertInstall(input: Record<string, unknown>) {
    this.upsertInput = input;
    return { id: 'install-1', ...input };
  }
}

test('InstallsService trims persisted install metadata and defaults the release channel', async () => {
  const repository = new InstallsRepositoryStub();
  const service = new InstallsService(repository as never);

  await service.registerInstall({
    installId: ' install-123 ',
    leadId: 'lead-1',
    inviteId: 'invite-1',
    appVersion: ' 0.1.0-beta.1 ',
    osVersion: ' 14.5 ',
    osArch: ' arm64 '
  });

  assert.deepEqual(repository.upsertInput, {
    installId: 'install-123',
    leadId: 'lead-1',
    inviteId: 'invite-1',
    releaseChannel: 'beta',
    appVersion: '0.1.0-beta.1',
    osVersion: '14.5',
    osArch: 'arm64'
  });
});
