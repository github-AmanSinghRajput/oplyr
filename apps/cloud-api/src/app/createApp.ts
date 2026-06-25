import crypto from 'node:crypto';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import { env } from '../config/env.js';
import { AppError, isAppError } from '../lib/errors.js';
import {
  asyncHandler,
  optionalDate,
  optionalPositiveInteger,
  optionalTrimmedString,
  requireTrimmedString
} from '../lib/http.js';
import { logger } from '../lib/logger.js';
import { createRateLimitMiddleware } from '../lib/rate-limit.js';
import { BetaService } from '../features/beta/beta.service.js';
import { ReleasesService } from '../features/releases/releases.service.js';
import { InstallsService } from '../features/installs/installs.service.js';
import { FeedbackService } from '../features/feedback/feedback.service.js';
import { SystemService } from '../features/system/system.service.js';

function requireAdmin(request: Request) {
  const expected = env.adminToken.trim();
  if (!expected) {
    throw new AppError(503, 'Admin token is not configured.', 'ADMIN_NOT_CONFIGURED');
  }

  const candidate =
    request
      .header('authorization')
      ?.replace(/^Bearer\s+/i, '')
      .trim() || '';
  if (candidate !== expected) {
    throw new AppError(401, 'Admin authentication is required.', 'UNAUTHORIZED');
  }
}

export function createApp() {
  const app = express();
  const betaService = new BetaService();
  const releasesService = new ReleasesService();
  const installsService = new InstallsService();
  const feedbackService = new FeedbackService();
  const systemService = new SystemService();

  app.set('etag', false);
  if (env.appEnv === 'production') {
    app.set('trust proxy', 1);
  }

  app.use(
    cors({
      origin: env.allowedOrigin
    })
  );
  app.use(createRateLimitMiddleware({ windowMs: 60_000, maxRequests: 120 }));
  app.use(express.json({ limit: '1mb' }));
  app.use((request: Request, response: Response, next: NextFunction) => {
    const requestId = request.header('x-request-id')?.trim() || crypto.randomUUID();
    response.locals.requestId = requestId;
    response.setHeader('x-request-id', requestId);

    logger.info('cloud.request.started', {
      requestId,
      method: request.method,
      path: request.path,
      ip: request.ip
    });

    response.on('finish', () => {
      logger.info('cloud.request.completed', {
        requestId,
        method: request.method,
        path: request.path,
        statusCode: response.statusCode
      });
    });

    next();
  });

  app.get('/api/health/live', (_request, response) => {
    response.json({
      ok: true,
      service: 'oplyr-cloud-api'
    });
  });

  app.get(
    '/api/health/ready',
    asyncHandler(async (_request, response) => {
      const readiness = await systemService.getReadiness();
      response.status(readiness.ready ? 200 : 503).json(readiness);
    })
  );

  app.post(
    '/api/beta/leads',
    asyncHandler(async (request, response) => {
      const body = (request.body ?? {}) as Record<string, unknown>;
      const lead = await betaService.captureLead({
        email: requireTrimmedString(body.email, 'email').toLowerCase(),
        fullName: optionalTrimmedString(body.fullName),
        role: optionalTrimmedString(body.role),
        company: optionalTrimmedString(body.company),
        useCase: optionalTrimmedString(body.useCase),
        source: optionalTrimmedString(body.source) ?? 'website'
      });

      response.status(201).json({
        lead
      });
    })
  );

  app.post(
    '/api/beta/invites/validate',
    asyncHandler(async (request, response) => {
      const body = (request.body ?? {}) as Record<string, unknown>;
      const invite = await betaService.validateInvite(requireTrimmedString(body.code, 'code'));
      const release = await releasesService.getLatestRelease(invite.release_channel);

      response.json({
        invite: {
          code: invite.code,
          releaseChannel: invite.release_channel,
          maxUses: invite.max_uses,
          useCount: invite.use_count
        },
        release
      });
    })
  );

  app.get(
    '/api/releases/latest',
    asyncHandler(async (request, response) => {
      const channel =
        typeof request.query.channel === 'string' && request.query.channel.trim()
          ? request.query.channel.trim()
          : 'beta';
      const release = await releasesService.getLatestRelease(channel);
      response.json({ release });
    })
  );

  app.post(
    '/api/releases/downloads',
    asyncHandler(async (request, response) => {
      const body = (request.body ?? {}) as Record<string, unknown>;
      const code = optionalTrimmedString(body.code);
      let inviteId: string | undefined;
      let leadId: string | undefined;
      let releaseChannel = optionalTrimmedString(body.channel) ?? 'beta';

      if (code) {
        const invite = await betaService.validateInvite(code);
        inviteId = invite.id;
        leadId = invite.lead_id ?? undefined;
        releaseChannel = invite.release_channel;
        await betaService.markInviteUsed(invite.id);
      }

      const release = await releasesService.getLatestRelease(releaseChannel);
      await releasesService.recordDownload({
        inviteId,
        leadId,
        releaseId: release.id,
        ipAddress: request.ip,
        userAgent: request.header('user-agent') ?? undefined
      });

      response.json({
        release
      });
    })
  );

  app.post(
    '/api/installs/register',
    asyncHandler(async (request, response) => {
      const body = (request.body ?? {}) as Record<string, unknown>;
      const code = optionalTrimmedString(body.code);
      let inviteId: string | undefined;
      let leadId: string | undefined;

      if (code) {
        const invite = await betaService.validateInvite(code);
        inviteId = invite.id;
        leadId = invite.lead_id ?? undefined;
      }

      const install = await installsService.registerInstall({
        installId: requireTrimmedString(body.installId, 'installId'),
        inviteId,
        leadId,
        releaseChannel: optionalTrimmedString(body.releaseChannel) ?? 'beta',
        appVersion: optionalTrimmedString(body.appVersion),
        osVersion: optionalTrimmedString(body.osVersion),
        osArch: optionalTrimmedString(body.osArch)
      });

      response.status(201).json({ install });
    })
  );

  app.post(
    '/api/feedback',
    asyncHandler(async (request, response) => {
      const body = (request.body ?? {}) as Record<string, unknown>;
      const feedback = await feedbackService.submitFeedback({
        installId: optionalTrimmedString(body.installId),
        email: optionalTrimmedString(body.email),
        category: requireTrimmedString(body.category, 'category'),
        message: requireTrimmedString(body.message, 'message')
      });

      response.status(201).json({ feedback });
    })
  );

  app.use('/api/admin', (request: Request, _response: Response, next: NextFunction) => {
    try {
      requireAdmin(request);
      next();
    } catch (error) {
      next(error);
    }
  });

  app.get(
    '/api/admin/leads',
    asyncHandler(async (request, response) => {
      const requested = typeof request.query.limit === 'string' ? Number(request.query.limit) : 50;
      const limit = Number.isFinite(requested) && requested > 0 ? Math.min(requested, 200) : 50;
      const leads = await betaService.listLeads(limit);
      response.json({ leads });
    })
  );

  app.post(
    '/api/admin/invites',
    asyncHandler(async (request, response) => {
      const body = (request.body ?? {}) as Record<string, unknown>;
      const invite = await betaService.createInvite({
        code: requireTrimmedString(body.code, 'code'),
        leadId: optionalTrimmedString(body.leadId),
        releaseChannel: optionalTrimmedString(body.releaseChannel) ?? 'beta',
        maxUses: optionalPositiveInteger(body.maxUses) ?? 1,
        expiresAt: optionalDate(body.expiresAt, 'expiresAt')
      });

      response.status(201).json({ invite });
    })
  );

  app.post(
    '/api/admin/releases',
    asyncHandler(async (request, response) => {
      const body = (request.body ?? {}) as Record<string, unknown>;
      const release = await releasesService.publishRelease({
        channel: optionalTrimmedString(body.channel) ?? 'beta',
        version: requireTrimmedString(body.version, 'version'),
        title: requireTrimmedString(body.title, 'title'),
        notes: optionalTrimmedString(body.notes),
        dmgUrl: requireTrimmedString(body.dmgUrl, 'dmgUrl'),
        minimumSupportedVersion: optionalTrimmedString(body.minimumSupportedVersion)
      });

      response.status(201).json({ release });
    })
  );

  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    if (isAppError(error)) {
      response.status(error.statusCode).json({
        error: error.message,
        code: error.code,
        details: error.details
      });
      return;
    }

    logger.error('cloud.request.failed', {
      message: error instanceof Error ? error.message : 'Unexpected error'
    });

    response.status(500).json({
      error: 'Unexpected server error.',
      code: 'INTERNAL_SERVER_ERROR'
    });
  });

  return { app };
}
