import assert from 'node:assert/strict';
import test from 'node:test';
import { AppError } from '../../lib/errors.js';
import { ReleasesService } from './releases.service.js';

class ReleasesRepositoryStub {
  latestRelease: Record<string, unknown> | null = null;
  createdRelease: Record<string, unknown> | null = null;
  recordedDownload: Record<string, unknown> | null = null;

  async getLatestPublished() {
    return this.latestRelease;
  }

  async createRelease(input: Record<string, unknown>) {
    this.createdRelease = input;
    return { id: 'release-1', ...input };
  }

  async recordDownload(input: Record<string, unknown>) {
    this.recordedDownload = input;
  }
}

test('ReleasesService throws when no release exists for a channel', async () => {
  const service = new ReleasesService(new ReleasesRepositoryStub() as never);

  await assert.rejects(
    () => service.getLatestRelease('beta'),
    (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.statusCode, 404);
      assert.equal(error.code, 'RELEASE_NOT_FOUND');
      return true;
    }
  );
});

test('ReleasesService normalizes release publishing input', async () => {
  const repository = new ReleasesRepositoryStub();
  const service = new ReleasesService(repository as never);

  await service.publishRelease({
    channel: ' beta ',
    version: ' 0.1.0-beta.1 ',
    title: ' Beta build ',
    notes: '  Faster chat and safer runtime paths. ',
    dmgUrl: ' https://github.com/oplyr/oplyr/releases/download/v0.1.0-beta.1/Oplyr.dmg ',
    minimumSupportedVersion: ' 0.1.0-beta.0 '
  });

  assert.deepEqual(repository.createdRelease, {
    channel: 'beta',
    version: '0.1.0-beta.1',
    title: 'Beta build',
    notes: 'Faster chat and safer runtime paths.',
    dmgUrl: 'https://github.com/oplyr/oplyr/releases/download/v0.1.0-beta.1/Oplyr.dmg',
    minimumSupportedVersion: '0.1.0-beta.0'
  });
});

test('ReleasesService records download events without modification', async () => {
  const repository = new ReleasesRepositoryStub();
  const service = new ReleasesService(repository as never);

  await service.recordDownload({
    leadId: 'lead-1',
    inviteId: 'invite-1',
    releaseId: 'release-1',
    ipAddress: '127.0.0.1',
    userAgent: 'Oplyr QA'
  });

  assert.deepEqual(repository.recordedDownload, {
    leadId: 'lead-1',
    inviteId: 'invite-1',
    releaseId: 'release-1',
    ipAddress: '127.0.0.1',
    userAgent: 'Oplyr QA'
  });
});
