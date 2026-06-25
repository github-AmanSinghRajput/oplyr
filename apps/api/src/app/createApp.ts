import crypto from 'node:crypto';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import {
  AssistantClientError,
  connectAssistantProvider,
  disconnectAssistantProvider,
  getAssistantState,
  initAssistantClient,
  setActiveAssistantProvider
} from '../assistant-client.js';
import { env } from '../config/env.js';
import { AuthService } from '../features/auth/auth.service.js';
import { ApprovalRepository } from '../features/approvals/approval.repository.js';
import { EventBus } from '../lib/event-bus.js';
import { ChatService } from '../features/chat/chat.service.js';
import { NotesService } from '../features/notes/notes.service.js';
import { SystemService } from '../features/system/system.service.js';
import { UserService } from '../features/users/user.service.js';
import { WorkspaceService } from '../features/workspaces/workspace.service.js';
import { CodebaseMapService } from '../features/codebase-map/codebase-map.service.js';
import { CodebaseMapRepository } from '../features/codebase-map/codebase-map.repository.js';
import { AppError, isAppError } from '../lib/errors.js';
import {
  asyncHandler,
  getRouteParam,
  optionalTrimmedString,
  requireBoolean,
  requireStringArray,
  requireTrimmedString
} from '../lib/http.js';
import { logger } from '../lib/logger.js';
import { localApiAuthHeader, matchesLocalApiAuthToken } from '../lib/local-api-auth.js';
import { isProtectedWorkspacePath } from '../lib/path-security.js';
import { createRateLimitMiddleware } from '../lib/rate-limit.js';
import { VoiceSessionService } from '../features/voice/voice-session.service.js';
import { VoiceSettingsService } from '../features/voice/voice-settings.service.js';
import { VoiceTranscriptionService } from '../features/voice/transcription.service.js';
import { VoiceBootstrapService } from '../features/voice/voice-bootstrap.service.js';
import { provisionSpeechModel } from '../features/voice/speech-model-provisioner.js';
import { CodexSettingsService } from '../features/codex/codex-settings.service.js';
import { ClaudeSettingsService } from '../features/claude/claude-settings.service.js';
import { GeminiSettingsService } from '../features/gemini/gemini-settings.service.js';
import { ProviderSettingsService } from '../features/providers/provider-settings.service.js';
import { ProviderUsageService } from '../features/providers/provider-usage.service.js';
import { VoiceCommandService } from '../features/voice/voice-command.service.js';
import { AppSettingsService } from '../features/app/app-settings.service.js';
import { AppResetService } from '../features/app/app-reset.service.js';
import type { AppTheme, AssistantProviderId, ChatSource } from '../types.js';
import {
  clearPendingApproval,
  getRuntimeState,
  resetVoiceSessionState,
  setActiveProviderId,
  setLastDiff,
  setVoiceSessionState,
  setWorkspaceState
} from '../runtime.js';

function getVoiceTurnId(request: Request) {
  return request.header('x-voice-turn-id')?.trim() || null;
}

function writeNdjson(response: Response, payload: Record<string, unknown>) {
  response.write(`${JSON.stringify(payload)}\n`);
}

async function sanitizeDiffForResponse(
  projectRoot: string | null,
  diff: ReturnType<typeof getRuntimeState>['lastDiff']
) {
  if (!projectRoot || !diff) {
    return diff;
  }

  const visibleFiles = [];
  const redactedFiles = [...(diff.redactedFiles ?? [])];

  for (const file of diff.files) {
    if (await isProtectedWorkspacePath(projectRoot, file.filePath)) {
      redactedFiles.push(file.filePath);
      continue;
    }

    visibleFiles.push(file);
  }

  const changedFiles = diff.changedFiles.filter((filePath) => !redactedFiles.includes(filePath));
  return {
    ...diff,
    changedFiles,
    files: visibleFiles,
    ...(redactedFiles.length > 0 ? { redactedFiles: Array.from(new Set(redactedFiles)) } : {})
  };
}

export function createApp(options?: { apiAuthToken?: string }) {
  const app = express();
  const eventBus = new EventBus();
  const chatService = new ChatService();
  const systemService = new SystemService();
  const authService = new AuthService();
  const approvalRepository = new ApprovalRepository();
  const notesService = new NotesService();
  const userService = new UserService();
  const workspaceService = new WorkspaceService();
  const codebaseMapService = new CodebaseMapService(new CodebaseMapRepository());
  const codexSettingsService = new CodexSettingsService();
  const claudeSettingsService = new ClaudeSettingsService();
  const geminiSettingsService = new GeminiSettingsService();
  const providerSettingsService = new ProviderSettingsService();
  const providerUsageService = new ProviderUsageService();
  initAssistantClient(
    codexSettingsService,
    claudeSettingsService,
    geminiSettingsService,
    providerSettingsService
  );
  const voiceSettingsService = new VoiceSettingsService();
  const appSettingsService = new AppSettingsService();
  const appResetService = new AppResetService();
  const voiceTranscriptionService = new VoiceTranscriptionService();
  const voiceCommandService = new VoiceCommandService(codexSettingsService);
  const voiceSessionService = new VoiceSessionService({
    eventBus,
    voiceTranscriptionService,
    voiceSettingsService
  });
  const voiceBootstrapService = new VoiceBootstrapService({
    voiceSessionService,
    provisionSpeechModel
  });

  app.set('etag', false);
  if (env.appEnv === 'production') {
    app.set('trust proxy', 1);
  }

  app.use(
    cors({
      origin: env.allowedOrigin
    })
  );
  app.use(createRateLimitMiddleware({ windowMs: 60_000, maxRequests: 240 }));
  app.use(express.json({ limit: '2mb' }));
  app.use((request: Request, response: Response, next: NextFunction) => {
    const requestId = request.header('x-request-id')?.trim() || crypto.randomUUID();
    response.locals.requestId = requestId;
    response.setHeader('x-request-id', requestId);

    const skipDetailedLog = [
      '/api/health/live',
      '/api/health/ready',
      '/api/status',
      '/api/voice/events'
    ].includes(request.path);

    if (!skipDetailedLog) {
      logger.info('http.request.started', {
        requestId,
        method: request.method,
        path: request.path,
        ip: request.ip
      });

      response.on('finish', () => {
        logger.info('http.request.completed', {
          requestId,
          method: request.method,
          path: request.path,
          statusCode: response.statusCode
        });
      });
    }

    next();
  });

  app.get('/api/health/live', (_request: Request, response: Response) => {
    response.json({
      ok: true,
      service: 'oplyr-api'
    });
  });

  app.get(
    '/api/health/ready',
    asyncHandler(async (_request: Request, response: Response) => {
      const readiness = await systemService.getReadiness();
      response.status(readiness.ready ? 200 : 503).json(readiness);
    })
  );

  app.use('/api', (request: Request, _response: Response, next: NextFunction) => {
    const expectedToken = options?.apiAuthToken?.trim();
    if (!expectedToken) {
      next();
      return;
    }

    const candidate =
      request.header(localApiAuthHeader)?.trim() ||
      request
        .header('authorization')
        ?.replace(/^Bearer\s+/i, '')
        .trim();

    if (!matchesLocalApiAuthToken(candidate, expectedToken)) {
      next(new AppError(401, 'Local API authentication is required.', 'UNAUTHORIZED'));
      return;
    }

    next();
  });

  app.get(
    '/api/system',
    asyncHandler(async (_request: Request, response: Response) => {
      const system = await systemService.getBackendStatus();
      response.json({
        ...system,
        auth: await authService.getStatus()
      });
    })
  );

  app.get(
    '/api/status',
    asyncHandler(async (_request: Request, response: Response) => {
      response.set('Cache-Control', 'no-store');
      const assistantProviders = await getAssistantState();
      const codexStatus =
        assistantProviders.providers.find((provider) => provider.id === 'codex') ?? null;
      const claudeStatus =
        assistantProviders.providers.find((provider) => provider.id === 'claude') ?? null;
      const geminiStatus =
        assistantProviders.providers.find((provider) => provider.id === 'gemini') ?? null;
      if (codexStatus) {
        await authService.syncCliSession('codex', codexStatus);
      }
      if (claudeStatus) {
        await authService.syncCliSession('claude', claudeStatus);
      }
      if (geminiStatus) {
        await authService.syncCliSession('gemini', geminiStatus);
      }
      const runtime = getRuntimeState();
      const readiness = await systemService.getReadiness();
      const appSettings = await appSettingsService.getSettings();
      const safeLastDiff = await sanitizeDiffForResponse(
        runtime.workspace.projectRoot,
        runtime.lastDiff
      );

      response.json({
        codexStatus,
        assistantProviders,
        appSettings,
        workspace: runtime.workspace,
        pendingApproval: runtime.pendingApproval,
        lastDiff: safeLastDiff,
        audio: runtime.audio,
        voiceSession: runtime.voiceSession,
        system: {
          database: readiness.database
        }
      });
    })
  );

  app.get('/api/voice/events', (request: Request, response: Response) => {
    response.setHeader('Content-Type', 'text/event-stream');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Connection', 'keep-alive');
    response.flushHeaders();

    eventBus.addClient(response);
    eventBus.emit({
      type: 'voice_state',
      payload: voiceSessionService.getStatus()
    });

    request.on('close', () => {
      eventBus.removeClient(response);
    });
  });

  app.post(
    '/api/voice/bootstrap/install',
    asyncHandler(async (_request: Request, response: Response) => {
      void voiceBootstrapService.start();
      response.status(202).json({
        bootstrap: await voiceBootstrapService.getStatus()
      });
    })
  );

  app.get(
    '/api/voice/bootstrap',
    asyncHandler(async (_request: Request, response: Response) => {
      response.json({
        bootstrap: await voiceBootstrapService.getStatus()
      });
    })
  );

  app.post(
    '/api/voice/session/warmup',
    asyncHandler(async (_request: Request, response: Response) => {
      await voiceSessionService.enableBackgroundWarmup();
      response.json({ ok: true });
    })
  );

  app.post('/api/voice/session/warmup/release', (_request: Request, response: Response) => {
    response.json(voiceSessionService.disableBackgroundWarmup());
  });

  app.get(
    '/api/app/settings',
    asyncHandler(async (_request: Request, response: Response) => {
      response.json(await appSettingsService.getSettings());
    })
  );

  app.put(
    '/api/app/settings',
    asyncHandler(async (request: Request, response: Response) => {
      const themeValue = optionalTrimmedString(request.body.theme);
      const welcomedAtValue = optionalTrimmedString(request.body.welcomedAt);
      const displayNameValue = request.body.displayName;
      const nextSettings = await appSettingsService.updateSettings({
        displayName:
          displayNameValue === undefined
            ? undefined
            : (optionalTrimmedString(displayNameValue) ?? null),
        welcomedAt: request.body.welcomedAt === undefined ? undefined : (welcomedAtValue ?? null),
        theme:
          themeValue === 'light' || themeValue === 'dark' ? (themeValue as AppTheme) : undefined
      });
      response.json(nextSettings);
    })
  );

  app.post(
    '/api/app/reset',
    asyncHandler(async (_request: Request, response: Response) => {
      voiceSessionService.stop();
      voiceSessionService.disableBackgroundWarmup();

      await chatService.clearConversationHistory();
      chatService.clearDiff();
      clearPendingApproval();
      setLastDiff(null);
      setActiveProviderId(null);
      setWorkspaceState({
        id: null,
        projectRoot: null,
        projectName: null,
        isGitRepo: false,
        writeAccessEnabled: false
      });
      await appResetService.resetPersistedData();
      const resetVoiceSettings = await voiceSettingsService.getResolvedSettings();
      resetVoiceSessionState('idle');
      setVoiceSessionState({
        silenceWindowMs: resetVoiceSettings.silenceWindowMs
      });

      eventBus.emit({
        type: 'status_refresh',
        payload: {}
      });

      response.json({ ok: true });
    })
  );

  app.post(
    '/api/voice/session/start',
    asyncHandler(async (_request: Request, response: Response) => {
      const voiceSession = await voiceSessionService.start();
      response.json({ ok: true, voiceSession });
    })
  );

  app.post('/api/voice/session/stop', (_request: Request, response: Response) => {
    const voiceSession = voiceSessionService.stop();
    response.json({ ok: true, voiceSession });
  });

  app.post('/api/voice/session/interrupt', (_request: Request, response: Response) => {
    const voiceSession = voiceSessionService.interrupt();
    response.json({ ok: true, voiceSession });
  });

  app.get(
    '/api/voice/settings',
    asyncHandler(async (_request: Request, response: Response) => {
      response.json(await voiceSettingsService.buildSettingsPayload(getRuntimeState().audio));
    })
  );

  app.put(
    '/api/voice/settings',
    asyncHandler(async (request: Request, response: Response) => {
      const silenceWindowMs =
        request.body.silenceWindowMs === undefined
          ? undefined
          : Number(request.body.silenceWindowMs);

      const payload = await voiceSettingsService.updateSettings({
        silenceWindowMs,
        voiceLocale: optionalTrimmedString(request.body.voiceLocale),
        transcriptionLanguageCode: optionalTrimmedString(request.body.transcriptionLanguageCode),
        transcriptionModel:
          request.body.transcriptionModel === 'parakeet'
            ? request.body.transcriptionModel
            : undefined,
        qualityProfile:
          request.body.qualityProfile === 'low_memory' ||
          request.body.qualityProfile === 'balanced' ||
          request.body.qualityProfile === 'demo'
            ? request.body.qualityProfile
            : undefined,
        noiseMode:
          request.body.noiseMode === 'normal' ||
          request.body.noiseMode === 'focused' ||
          request.body.noiseMode === 'noisy_room'
            ? request.body.noiseMode
            : undefined,
        autoResumeAfterReply:
          request.body.autoResumeAfterReply === undefined
            ? undefined
            : requireBoolean(request.body.autoResumeAfterReply, 'autoResumeAfterReply')
      });

      const runtime = getRuntimeState();
      if (runtime.voiceSession.active) {
        setVoiceSessionState({
          silenceWindowMs: payload.settings.silenceWindowMs
        });
      }

      response.json({
        ...payload,
        currentDevices: {
          inputLabel: runtime.audio.inputDeviceLabel,
          outputLabel: runtime.audio.outputDeviceLabel
        }
      });
    })
  );

  app.get(
    '/api/codex/settings',
    asyncHandler(async (_request: Request, response: Response) => {
      response.json(await codexSettingsService.getSettings());
    })
  );

  app.put(
    '/api/codex/settings',
    asyncHandler(async (request: Request, response: Response) => {
      response.json(
        await codexSettingsService.updateSettings({
          model: optionalTrimmedString(request.body.model),
          reasoningEffort: optionalTrimmedString(request.body.reasoningEffort) as
            | 'low'
            | 'medium'
            | 'high'
            | 'xhigh'
            | undefined,
          voiceModelMode: optionalTrimmedString(request.body.voiceModelMode) as
            | 'auto'
            | 'fast'
            | 'inherit'
            | undefined
        })
      );
    })
  );

  app.get(
    '/api/claude/settings',
    asyncHandler(async (_request: Request, response: Response) => {
      response.json(await claudeSettingsService.getSettings());
    })
  );

  app.get(
    '/api/gemini/settings',
    asyncHandler(async (_request: Request, response: Response) => {
      response.json(await geminiSettingsService.getSettings());
    })
  );

  app.put(
    '/api/claude/settings',
    asyncHandler(async (request: Request, response: Response) => {
      response.json(
        await claudeSettingsService.updateSettings({
          model: optionalTrimmedString(request.body.model),
          voiceModelMode: optionalTrimmedString(request.body.voiceModelMode) as
            | 'auto'
            | 'fast'
            | 'inherit'
            | undefined
        })
      );
    })
  );

  app.put(
    '/api/gemini/settings',
    asyncHandler(async (request: Request, response: Response) => {
      response.json(
        await geminiSettingsService.updateSettings({
          model: optionalTrimmedString(request.body.model),
          voiceModelMode: optionalTrimmedString(request.body.voiceModelMode) as
            | 'auto'
            | 'fast'
            | 'inherit'
            | undefined
        })
      );
    })
  );

  app.post(
    '/api/voice/commands/resolve',
    asyncHandler(async (request: Request, response: Response) => {
      const transcript = requireTrimmedString(request.body.transcript, 'transcript');
      response.json(await voiceCommandService.resolve(transcript));
    })
  );

  app.post(
    '/api/voice/commands/apply',
    asyncHandler(async (request: Request, response: Response) => {
      const action = request.body.action;
      if (!action || typeof action !== 'object') {
        throw new AppError(400, 'Unsupported voice command action.', 'INVALID_INPUT');
      }

      if (action.type === 'set_codex_model') {
        response.json({
          ok: true,
          ...(await voiceCommandService.applyAction({
            type: 'set_codex_model',
            model: requireTrimmedString(action.model, 'action.model'),
            reasoningEffort: optionalTrimmedString(action.reasoningEffort) as
              | 'low'
              | 'medium'
              | 'high'
              | 'xhigh'
              | null
          }))
        });
        return;
      }

      if (action.type === 'set_claude_model') {
        response.json({
          ok: true,
          ...(await voiceCommandService.applyAction({
            type: 'set_claude_model',
            model: requireTrimmedString(action.model, 'action.model')
          }))
        });
        return;
      }

      throw new AppError(400, 'Unsupported voice command action.', 'INVALID_INPUT');
    })
  );

  app.post(
    '/api/workspace/project',
    asyncHandler(async (request: Request, response: Response) => {
      const projectRoot = requireTrimmedString(request.body.projectRoot, 'projectRoot');
      const workspace = await workspaceService.selectProjectRoot(projectRoot);
      // Warm the codebase map in the background so it's ready the moment the user opens the Map
      // screen ("the moment you connect a repo"). Fire-and-forget; never blocks the response.
      if (workspace.projectRoot) {
        void codebaseMapService.ensureScan(
          workspace.projectRoot,
          workspace.projectName ?? 'Workspace'
        );
      }
      response.json({ workspace });
    })
  );

  app.get(
    '/api/workspace/codebase-map',
    asyncHandler(async (_request: Request, response: Response) => {
      const workspace = getRuntimeState().workspace;
      if (!workspace.projectRoot) {
        response.json({ map: null });
        return;
      }
      const map = await codebaseMapService.getMap(
        workspace.projectRoot,
        workspace.projectName ?? 'Workspace'
      );
      response.json({ map });
    })
  );

  app.post(
    '/api/workspace/codebase-map/rescan',
    asyncHandler(async (_request: Request, response: Response) => {
      const workspace = getRuntimeState().workspace;
      if (!workspace.projectRoot) {
        throw new AppError(400, 'Connect a workspace before scanning.', 'INVALID_INPUT');
      }
      const map = await codebaseMapService.rescan(
        workspace.projectRoot,
        workspace.projectName ?? 'Workspace'
      );
      response.json({ map });
    })
  );

  app.post(
    '/api/workspace/codebase-map/summary',
    asyncHandler(async (request: Request, response: Response) => {
      const filePath = requireTrimmedString(request.body.path, 'path');
      const symbol = optionalTrimmedString(request.body.symbol);
      const workspace = getRuntimeState().workspace;
      if (!workspace.projectRoot) {
        throw new AppError(
          400,
          'Connect a workspace before requesting summaries.',
          'INVALID_INPUT'
        );
      }
      const result = await codebaseMapService.summarizeFile(
        workspace.projectRoot,
        filePath,
        symbol
      );
      response.json(result);
    })
  );

  app.post(
    '/api/workspace/codebase-map/file-symbols',
    asyncHandler(async (request: Request, response: Response) => {
      const filePath = requireTrimmedString(request.body.path, 'path');
      const workspace = getRuntimeState().workspace;
      if (!workspace.projectRoot) {
        throw new AppError(400, 'Connect a workspace before requesting symbols.', 'INVALID_INPUT');
      }
      const result = await codebaseMapService.getFileSymbols(workspace.projectRoot, filePath);
      response.json(result);
    })
  );

  app.post(
    '/api/workspace/write-access',
    asyncHandler(async (request: Request, response: Response) => {
      const enabled = requireBoolean(request.body.enabled, 'enabled');
      const workspace = await workspaceService.updateWriteAccess(enabled);
      response.json({ workspace });
    })
  );

  app.post(
    '/api/assistant/active-provider',
    asyncHandler(async (request: Request, response: Response) => {
      const providerId = requireTrimmedString(request.body.providerId, 'providerId');
      if (providerId !== 'codex' && providerId !== 'claude' && providerId !== 'gemini') {
        throw new AppError(400, 'Unsupported assistant provider.', 'INVALID_INPUT');
      }

      response.json(await setActiveAssistantProvider(providerId as AssistantProviderId));
    })
  );

  app.post(
    '/api/assistant/providers/:providerId/connect',
    asyncHandler(async (request: Request, response: Response) => {
      const providerId = getRouteParam(request.params.providerId, 'providerId');
      if (providerId !== 'codex' && providerId !== 'claude' && providerId !== 'gemini') {
        throw new AppError(400, 'Unsupported assistant provider.', 'INVALID_INPUT');
      }

      const assistantProviders = await connectAssistantProvider(providerId as AssistantProviderId);
      response.json({
        ok: true,
        assistantProviders
      });
    })
  );

  app.post(
    '/api/assistant/providers/:providerId/disconnect',
    asyncHandler(async (request: Request, response: Response) => {
      const providerId = getRouteParam(request.params.providerId, 'providerId');
      if (providerId !== 'codex' && providerId !== 'claude' && providerId !== 'gemini') {
        throw new AppError(400, 'Unsupported assistant provider.', 'INVALID_INPUT');
      }

      voiceSessionService.stop();
      const assistantProviders = await disconnectAssistantProvider(
        providerId as AssistantProviderId
      );
      await workspaceService.updateWriteAccess(false);
      clearPendingApproval();
      response.json({ ok: true, assistantProviders });
    })
  );

  app.get(
    '/api/assistant/usage',
    asyncHandler(async (_request: Request, response: Response) => {
      response.set('Cache-Control', 'no-store');
      const assistantState = await getAssistantState();
      const activeProviderId = assistantState.activeProviderId;

      if (!activeProviderId) {
        response.json({
          usage: {
            providerId: null,
            providerName: null,
            command: null,
            capturedAt: new Date().toISOString(),
            available: false,
            error: 'No provider is currently connected in Oplyr.',
            model: null,
            accountLabel: null,
            sessionId: null,
            contextWindow: null,
            meters: [],
            details: []
          }
        });
        return;
      }

      response.json({
        usage: await providerUsageService.getUsage(activeProviderId, getRuntimeState().workspace)
      });
    })
  );

  app.get(
    '/api/logs',
    asyncHandler(async (_request: Request, response: Response) => {
      response.json({
        messages: await chatService.readRecentMessages(120)
      });
    })
  );

  app.post(
    '/api/chat/attachments',
    express.raw({
      type: () => true,
      limit: '20mb'
    }),
    asyncHandler(async (request: Request, response: Response) => {
      const encodedFileName = requireTrimmedString(request.header('x-file-name'), 'x-file-name');
      const fileName = decodeURIComponent(encodedFileName);
      const mimeType = request.header('x-file-type')?.trim() || 'application/octet-stream';
      const body = request.body;
      const fileBuffer =
        body instanceof Buffer ? body : Buffer.isBuffer(body) ? body : Buffer.alloc(0);

      if (fileBuffer.byteLength === 0) {
        throw new AppError(400, 'Attachment body was empty.', 'INVALID_INPUT');
      }

      const attachment = await chatService.uploadAttachment(fileName, mimeType, fileBuffer);
      response.status(201).json({ attachment });
    })
  );

  app.get(
    '/api/chat/attachments/:attachmentId/content',
    asyncHandler(async (request: Request, response: Response) => {
      const attachmentId = getRouteParam(request.params.attachmentId, 'attachmentId');
      const content = await chatService.getAttachmentContent(attachmentId);

      if (!content) {
        throw new AppError(404, 'Attachment not found.', 'NOT_FOUND');
      }

      response.type(content.attachment.mimeType);
      response.setHeader(
        'Content-Disposition',
        `${content.attachment.kind === 'image' ? 'inline' : 'attachment'}; filename="${content.attachment.name}"`
      );
      response.sendFile(content.storagePath);
    })
  );

  app.delete(
    '/api/logs',
    asyncHandler(async (_request: Request, response: Response) => {
      voiceSessionService.stop();
      await chatService.clearConversationHistory();
      chatService.clearDiff();
      clearPendingApproval();
      eventBus.emit({
        type: 'status_refresh',
        payload: {}
      });
      response.json({ ok: true });
    })
  );

  app.get(
    '/api/notes',
    asyncHandler(async (request: Request, response: Response) => {
      const limitParam = typeof request.query.limit === 'string' ? Number(request.query.limit) : 20;
      const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 100) : 20;

      response.json({
        notes: await notesService.listRecentNotes(limit)
      });
    })
  );

  app.post(
    '/api/notes',
    asyncHandler(async (request: Request, response: Response) => {
      const title = requireTrimmedString(request.body.title, 'title');
      const body = requireTrimmedString(request.body.body, 'body');
      const source = optionalTrimmedString(request.body.source);
      const chunks =
        request.body.chunks === undefined
          ? undefined
          : requireStringArray(request.body.chunks, 'chunks');

      const note = await notesService.createNote({
        title,
        body,
        source,
        chunks
      });

      response.status(201).json({
        note
      });
    })
  );

  app.put(
    '/api/notes/:noteId',
    asyncHandler(async (request: Request, response: Response) => {
      const title = requireTrimmedString(request.body.title, 'title');
      const body = requireTrimmedString(request.body.body, 'body');
      const source = optionalTrimmedString(request.body.source);
      const chunks =
        request.body.chunks === undefined
          ? undefined
          : requireStringArray(request.body.chunks, 'chunks');

      const note = await notesService.updateNote(getRouteParam(request.params.noteId, 'noteId'), {
        title,
        body,
        source,
        chunks
      });

      if (!note) {
        throw new AppError(404, 'Note not found.', 'NOT_FOUND');
      }

      response.json({
        note
      });
    })
  );

  app.delete(
    '/api/notes/:noteId',
    asyncHandler(async (request: Request, response: Response) => {
      const deleted = await notesService.deleteNote(getRouteParam(request.params.noteId, 'noteId'));

      if (!deleted) {
        throw new AppError(404, 'Note not found.', 'NOT_FOUND');
      }

      response.json({
        ok: true
      });
    })
  );

  app.get(
    '/api/approvals/history',
    asyncHandler(async (request: Request, response: Response) => {
      const limitParam = typeof request.query.limit === 'string' ? Number(request.query.limit) : 20;
      const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 100) : 20;

      response.json({
        approvals: await approvalRepository.listRecent(limit)
      });
    })
  );

  app.get(
    '/api/auth/sessions',
    asyncHandler(async (request: Request, response: Response) => {
      const limitParam = typeof request.query.limit === 'string' ? Number(request.query.limit) : 10;
      const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 50) : 10;

      response.json({
        sessions: await authService.listTrackedSessions(limit)
      });
    })
  );

  app.post('/api/chat/text/stream', async (request: Request, response: Response) => {
    response.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Connection', 'keep-alive');
    response.flushHeaders();

    const startedAt = Date.now();
    const requestId =
      typeof response.locals.requestId === 'string' ? response.locals.requestId : 'unknown';
    const voiceTurnId = getVoiceTurnId(request);
    const abortController = new AbortController();

    response.on('close', () => {
      if (!response.writableEnded) {
        abortController.abort();
      }
    });

    try {
      const attachmentIds =
        request.body.attachments === undefined
          ? []
          : requireStringArray(request.body.attachments, 'attachments');
      const text = optionalTrimmedString(request.body.message) ?? '';
      if (!text && attachmentIds.length === 0) {
        throw new AppError(400, 'Message or attachments are required.', 'INVALID_INPUT');
      }
      const source: ChatSource = request.body.source === 'voice' ? 'voice' : 'text';

      const result = await chatService.streamTurn(
        text,
        source,
        {
          onStarted: ({ userMessage, assistantMessage }) => {
            if (!abortController.signal.aborted) {
              writeNdjson(response, {
                type: 'started',
                userMessage,
                assistantMessage
              });
            }
          },
          onDelta: ({ assistantMessage }) => {
            if (!abortController.signal.aborted) {
              writeNdjson(response, {
                type: 'delta',
                assistantMessage
              });
            }
          },
          onActivity: ({ activity }) => {
            if (!abortController.signal.aborted) {
              writeNdjson(response, {
                type: 'activity',
                activity
              });
            }
          }
        },
        voiceTurnId ? { voiceTurnId } : undefined,
        abortController.signal,
        attachmentIds
      );

      logger.info('chat.turn.request.completed', {
        requestId,
        ...(voiceTurnId ? { voiceTurnId } : {}),
        source,
        durationMs: Date.now() - startedAt,
        messageLength: text.length,
        resultType: result.type,
        streamed: result.type === 'reply'
      });

      eventBus.emit({
        type: 'status_refresh',
        payload: {}
      });

      writeNdjson(response, {
        type: 'completed',
        result
      });
    } catch (error) {
      if (!abortController.signal.aborted) {
        logger.error('http.request.failed', {
          requestId,
          method: request.method,
          path: request.path,
          statusCode: isAppError(error) ? error.statusCode : 500,
          errorCode: isAppError(error) ? error.code : 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Unhandled API error'
        });
        const classified = error instanceof AssistantClientError ? error : null;
        writeNdjson(response, {
          type: 'error',
          error:
            classified?.friendlyMessage ??
            (error instanceof Error ? error.message : 'Unable to stream chat response.'),
          errorKind: classified?.kind ?? 'unknown'
        });
      }
    } finally {
      response.end();
    }
  });

  app.post(
    '/api/chat/text',
    asyncHandler(async (request: Request, response: Response) => {
      const startedAt = Date.now();
      const attachmentIds =
        request.body.attachments === undefined
          ? []
          : requireStringArray(request.body.attachments, 'attachments');
      const text = optionalTrimmedString(request.body.message) ?? '';
      if (!text && attachmentIds.length === 0) {
        throw new AppError(400, 'Message or attachments are required.', 'INVALID_INPUT');
      }
      const source: ChatSource = request.body.source === 'voice' ? 'voice' : 'text';
      const requestId =
        typeof response.locals.requestId === 'string' ? response.locals.requestId : 'unknown';
      const voiceTurnId = getVoiceTurnId(request);

      const result = await chatService.processTurn(
        text,
        source,
        voiceTurnId ? { voiceTurnId } : undefined,
        attachmentIds
      );
      logger.info('chat.turn.request.completed', {
        requestId,
        ...(voiceTurnId ? { voiceTurnId } : {}),
        source,
        durationMs: Date.now() - startedAt,
        messageLength: text.length,
        resultType: result.type
      });
      eventBus.emit({
        type: 'status_refresh',
        payload: {}
      });

      response.json(result);
    })
  );

  app.post(
    '/api/approvals/:approvalId/approve',
    asyncHandler(async (request: Request, response: Response) => {
      const execution = await chatService.approvePending(
        getRouteParam(request.params.approvalId, 'approvalId')
      );
      if (!execution) {
        throw new AppError(404, 'Pending approval not found.', 'NOT_FOUND');
      }

      eventBus.emit({
        type: 'status_refresh',
        payload: {}
      });

      response.json({
        ok: true,
        assistantMessage: execution.assistantMessage,
        diff: execution.diff
      });
    })
  );

  app.post(
    '/api/approvals/:approvalId/reject',
    asyncHandler(async (request: Request, response: Response) => {
      const rejectFeedback =
        typeof (request.body as { feedback?: unknown })?.feedback === 'string'
          ? (request.body as { feedback: string }).feedback
          : undefined;
      const rejection = await chatService.rejectPending(
        getRouteParam(request.params.approvalId, 'approvalId'),
        rejectFeedback
      );
      if (!rejection) {
        throw new AppError(404, 'Pending approval not found.', 'NOT_FOUND');
      }

      eventBus.emit({
        type: 'status_refresh',
        payload: {}
      });

      response.json({
        ok: true,
        assistantMessage: rejection.assistantMessage
      });
    })
  );

  app.use((error: unknown, request: Request, response: Response, _next: NextFunction) => {
    const requestId =
      typeof response.locals.requestId === 'string' ? response.locals.requestId : 'unknown';
    const details = isAppError(error) ? error.details : undefined;

    logger.error('http.request.failed', {
      requestId,
      method: request.method,
      path: request.path,
      statusCode: isAppError(error) ? error.statusCode : 500,
      errorCode: isAppError(error) ? error.code : 'INTERNAL_SERVER_ERROR',
      message: error instanceof Error ? error.message : 'Unhandled API error',
      details
    });

    const classified = error instanceof AssistantClientError ? error : null;
    response.status(isAppError(error) ? error.statusCode : 500).json({
      error:
        classified?.friendlyMessage ??
        (error instanceof Error ? error.message : 'Internal server error.'),
      code: isAppError(error) ? error.code : 'INTERNAL_SERVER_ERROR',
      errorKind: classified?.kind ?? undefined,
      requestId
    });
  });

  return {
    app,
    authService,
    userService,
    voiceBootstrapService,
    voiceSessionService,
    voiceTranscriptionService,
    workspaceService
  };
}
