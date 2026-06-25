import { AppError } from '../../lib/errors.js';
import { BetaRepository, type BetaLeadInput } from './beta.repository.js';

export class BetaService {
  constructor(private readonly repository = new BetaRepository()) {}

  captureLead(input: BetaLeadInput) {
    return this.repository.upsertLead(input);
  }

  async listLeads(limit: number) {
    return this.repository.listLeads(limit);
  }

  async createInvite(input: {
    code: string;
    leadId?: string;
    releaseChannel?: string;
    maxUses?: number;
    expiresAt?: Date;
  }) {
    return this.repository.createInvite({
      code: input.code.trim().toUpperCase(),
      leadId: input.leadId,
      releaseChannel: input.releaseChannel?.trim() || 'beta',
      maxUses: input.maxUses ?? 1,
      expiresAt: input.expiresAt
    });
  }

  async validateInvite(code: string) {
    const invite = await this.repository.findActiveInvite(code.trim().toUpperCase());

    if (!invite) {
      throw new AppError(404, 'Invite code not found.', 'INVITE_NOT_FOUND');
    }

    if (invite.status !== 'active') {
      throw new AppError(403, 'Invite code is not active.', 'INVITE_DISABLED');
    }

    if (invite.expires_at && new Date(invite.expires_at).getTime() < Date.now()) {
      throw new AppError(403, 'Invite code has expired.', 'INVITE_EXPIRED');
    }

    if (invite.use_count >= invite.max_uses) {
      throw new AppError(403, 'Invite code usage limit reached.', 'INVITE_EXHAUSTED');
    }

    return invite;
  }

  markInviteUsed(inviteId: string) {
    return this.repository.incrementInviteUse(inviteId);
  }
}
