import assert from 'node:assert/strict';
import test from 'node:test';
import { AppError } from '../../lib/errors.js';
import { BetaService } from './beta.service.js';

class BetaRepositoryStub {
  activeInvite: Record<string, unknown> | null = null;
  createdInvite: Record<string, unknown> | null = null;
  incrementedInviteId: string | null = null;
  listedLimit: number | null = null;
  leadInput: Record<string, unknown> | null = null;

  async upsertLead(input: Record<string, unknown>) {
    this.leadInput = input;
    return { id: 'lead-1', ...input };
  }

  async listLeads(limit: number) {
    this.listedLimit = limit;
    return [{ id: 'lead-1' }];
  }

  async createInvite(input: Record<string, unknown>) {
    this.createdInvite = input;
    return { id: 'invite-1', ...input };
  }

  async findActiveInvite() {
    return this.activeInvite;
  }

  async incrementInviteUse(inviteId: string) {
    this.incrementedInviteId = inviteId;
  }
}

test('BetaService uppercases invite codes and applies defaults when creating invites', async () => {
  const repository = new BetaRepositoryStub();
  const service = new BetaService(repository as never);

  await service.createInvite({
    code: ' beta-early ',
    releaseChannel: ' internal ',
    maxUses: undefined
  });

  assert.deepEqual(repository.createdInvite, {
    code: 'BETA-EARLY',
    leadId: undefined,
    releaseChannel: 'internal',
    maxUses: 1,
    expiresAt: undefined
  });
});

test('BetaService rejects missing invite codes', async () => {
  const service = new BetaService(new BetaRepositoryStub() as never);

  await assert.rejects(
    () => service.validateInvite('missing'),
    (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.statusCode, 404);
      assert.equal(error.code, 'INVITE_NOT_FOUND');
      return true;
    }
  );
});

test('BetaService rejects disabled invites', async () => {
  const repository = new BetaRepositoryStub();
  repository.activeInvite = {
    id: 'invite-1',
    code: 'BETA',
    status: 'disabled',
    max_uses: 1,
    use_count: 0,
    expires_at: null
  };
  const service = new BetaService(repository as never);

  await assert.rejects(
    () => service.validateInvite('beta'),
    (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.statusCode, 403);
      assert.equal(error.code, 'INVITE_DISABLED');
      return true;
    }
  );
});

test('BetaService rejects expired invites', async () => {
  const repository = new BetaRepositoryStub();
  repository.activeInvite = {
    id: 'invite-1',
    code: 'BETA',
    status: 'active',
    max_uses: 2,
    use_count: 0,
    expires_at: '2000-01-01T00:00:00.000Z'
  };
  const service = new BetaService(repository as never);

  await assert.rejects(
    () => service.validateInvite('beta'),
    (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.statusCode, 403);
      assert.equal(error.code, 'INVITE_EXPIRED');
      return true;
    }
  );
});

test('BetaService rejects exhausted invites', async () => {
  const repository = new BetaRepositoryStub();
  repository.activeInvite = {
    id: 'invite-1',
    code: 'BETA',
    status: 'active',
    max_uses: 2,
    use_count: 2,
    expires_at: null
  };
  const service = new BetaService(repository as never);

  await assert.rejects(
    () => service.validateInvite('beta'),
    (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.statusCode, 403);
      assert.equal(error.code, 'INVITE_EXHAUSTED');
      return true;
    }
  );
});

test('BetaService normalizes invite lookups and returns valid invites', async () => {
  const repository = new BetaRepositoryStub();
  repository.activeInvite = {
    id: 'invite-1',
    code: 'BETA',
    status: 'active',
    max_uses: 3,
    use_count: 1,
    expires_at: null
  };
  const service = new BetaService(repository as never);

  const invite = await service.validateInvite(' beta ');

  assert.equal(invite.id, 'invite-1');
});

test('BetaService delegates lead capture, list, and invite usage tracking', async () => {
  const repository = new BetaRepositoryStub();
  const service = new BetaService(repository as never);

  await service.captureLead({ email: 'founder@oplyr.com', source: 'website' });
  await service.listLeads(25);
  await service.markInviteUsed('invite-9');

  assert.deepEqual(repository.leadInput, {
    email: 'founder@oplyr.com',
    source: 'website'
  });
  assert.equal(repository.listedLimit, 25);
  assert.equal(repository.incrementedInviteId, 'invite-9');
});
