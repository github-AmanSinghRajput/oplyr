import { BaseApiService, normalizeApiErrorText } from './BaseApiService';
import type {
  AppSettings,
  AppSseEvent,
  AssistantErrorKind,
  AssistantProviderId,
  BrainGraphResponse,
  BrainProjectSettings,
  BrainSearchResponse,
  BrainSettings,
  BrainStatusResponse,
  ChatAttachment,
  AssistantProvidersState,
  ApprovalHistoryResponse,
  ApprovalRequiredResponse,
  ApprovalResponse,
  AuthSessionsResponse,
  ChatStreamEvent,
  ClaudeSettingsResponse,
  CodexSettingsResponse,
  GeminiSettingsResponse,
  ClearResponse,
  CodebaseMapResponse,
  WorkspaceReposResponse,
  CodebaseFileSummaryResponse,
  CodebaseFileSymbolsResponse,
  ImportManifest,
  ImportProgressEvent,
  ImportRunSummary,
  ImportSelector,
  LogsResponse,
  MarkdownContentResponse,
  MarkdownListResponse,
  ProviderUsageResponse,
  ReplyResponse,
  SetWorkspaceResponse,
  StatusResponse,
  SystemResponse,
  VoiceBootstrapResponse,
  VoiceCommandAction,
  VoiceCommandApplyResponse,
  VoiceCommandResolveResponse,
  VoiceSettingsResponse,
  VoiceSessionResponse
} from '../../containers/voice-console/lib/types';

export class OperatorConsoleApiService extends BaseApiService {
  getStatus() {
    return this.request<StatusResponse>('/api/status', {
      cache: 'no-store'
    });
  }

  getSystem() {
    return this.request<SystemResponse>('/api/system');
  }

  getAppSettings() {
    return this.request<AppSettings>('/api/app/settings');
  }

  updateAppSettings(input: Partial<AppSettings>) {
    return this.request<AppSettings>('/api/app/settings', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(input)
    });
  }

  getBrainStatus() {
    return this.request<BrainStatusResponse>('/api/brain/status', {
      cache: 'no-store'
    });
  }

  updateBrainSettings(
    input: Partial<
      Pick<
        BrainSettings,
        | 'mode'
        | 'enabled'
        | 'recallEnabled'
        | 'captureEnabled'
        | 'crossProjectEnabled'
        | 'rawArchiveEnabled'
        | 'allowSensitiveCapture'
        | 'allowSensitiveInjection'
        | 'maxRecallAtoms'
        | 'maxRecallCharacters'
        | 'maxGraphHops'
      >
    > & {
      agentWritePermissions?: Partial<Record<'codex' | 'claude' | 'gemini', boolean>>;
    }
  ) {
    return this.request<BrainSettings>('/api/brain/settings', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(input)
    });
  }

  deleteBrainAtom(atomId: string) {
    return this.request<ClearResponse>(`/api/brain/atoms/${atomId}`, {
      method: 'DELETE'
    });
  }

  resetBrain() {
    return this.request<ClearResponse>('/api/brain/reset', {
      method: 'POST'
    });
  }

  getBrainGraph() {
    return this.request<BrainGraphResponse>('/api/brain/graph', {
      cache: 'no-store'
    });
  }

  searchBrain(query: string) {
    return this.request<BrainSearchResponse>('/api/brain/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query })
    });
  }

  /** Read-only scan of the user's existing agent memory files (paths + byte counts, never bodies). */
  scanMemoryImport() {
    return this.request<ImportManifest>('/api/brain/import/scan', {
      cache: 'no-store'
    });
  }

  /**
   * Import selected agent memory files into the Brain. POSTs the selectors and reads the NDJSON
   * progress stream line-by-line (mirrors `streamMessage`'s reader), invoking `onEvent` for every
   * progress line and the final summary line.
   */
  async runMemoryImport(
    body: { selectors: ImportSelector[]; includeProjectScope: boolean },
    onEvent: (event: ImportProgressEvent | ImportRunSummary) => void
  ) {
    const response = await fetch(`${this.baseUrl}/api/brain/import/run`, {
      method: 'POST',
      headers: {
        ...Object.fromEntries(this.createHeaders().entries()),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const raw = await response.text();
      let parsed: { error?: string } = {};
      if (raw) {
        try {
          parsed = JSON.parse(raw) as typeof parsed;
        } catch {
          parsed = { error: raw.slice(0, 200) };
        }
      }
      throw new Error(normalizeApiErrorText(parsed.error ?? 'Unable to import memory.'));
    }

    if (!response.body) {
      throw new Error('Memory import response body was unavailable.');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });

      let newlineIndex = buffer.indexOf('\n');
      while (newlineIndex >= 0) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        if (line) {
          try {
            onEvent(JSON.parse(line) as ImportProgressEvent | ImportRunSummary);
          } catch (parseError) {
            if (parseError instanceof SyntaxError) {
              console.warn('[import] skipping malformed NDJSON line', line.slice(0, 120));
            } else {
              throw parseError;
            }
          }
        }
        newlineIndex = buffer.indexOf('\n');
      }

      if (done) {
        const tail = buffer.trim();
        if (tail) {
          try {
            onEvent(JSON.parse(tail) as ImportProgressEvent | ImportRunSummary);
          } catch (parseError) {
            if (parseError instanceof SyntaxError) {
              console.warn('[import] skipping malformed NDJSON tail', tail.slice(0, 120));
            } else {
              throw parseError;
            }
          }
        }
        break;
      }
    }
  }

  updateBrainProjectSettings(
    projectKey: string,
    input: { isolate?: boolean; captureEnabled?: boolean }
  ) {
    return this.request<BrainProjectSettings>(
      `/api/brain/projects/${encodeURIComponent(projectKey)}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(input)
      }
    );
  }

  getLogs() {
    return this.request<LogsResponse>('/api/logs');
  }

  clearLogs() {
    return this.request<ClearResponse>('/api/logs', {
      method: 'DELETE'
    });
  }

  resetApp() {
    return this.request<ClearResponse>('/api/app/reset', {
      method: 'POST'
    });
  }

  setProjectRoot(projectRoot: string) {
    return this.request<SetWorkspaceResponse>('/api/workspace/project', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ projectRoot })
    });
  }

  setWriteAccess(enabled: boolean) {
    return this.request<SetWorkspaceResponse>('/api/workspace/write-access', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ enabled })
    });
  }

  setActiveProvider(providerId: 'codex' | 'claude' | 'gemini') {
    return this.request<AssistantProvidersState>('/api/assistant/active-provider', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ providerId })
    });
  }

  connectProvider(providerId: 'codex' | 'claude' | 'gemini') {
    return this.request<ClearResponse>(`/api/assistant/providers/${providerId}/connect`, {
      method: 'POST'
    });
  }

  disconnectProvider(providerId: 'codex' | 'claude' | 'gemini') {
    return this.request<ClearResponse>(`/api/assistant/providers/${providerId}/disconnect`, {
      method: 'POST'
    });
  }

  /** `force` bypasses the server's snapshot cache — used by the Refresh button so a user who just
   *  fixed the underlying problem (reconnected, re-logged-in) isn't served a cached failure. */
  getAssistantUsage(force = false) {
    return this.request<ProviderUsageResponse>(`/api/assistant/usage${force ? '?force=1' : ''}`, {
      cache: 'no-store'
    });
  }

  /** Ask the provider's CLI to publish its current models (Codex refreshes its cache). Re-fetch the
   *  provider's settings afterwards to pick up the new list. */
  refreshProviderModels(providerId: AssistantProviderId) {
    return this.request<{ providerId: AssistantProviderId; refreshed: boolean; detail: string }>(
      `/api/assistant/providers/${providerId}/refresh-models`,
      { method: 'POST', cache: 'no-store' }
    );
  }

  /** Run the provider CLI's own self-update (`codex update` / `claude update`). */
  updateProviderCli(providerId: AssistantProviderId) {
    return this.request<{ providerId: AssistantProviderId; ok: boolean; message: string }>(
      `/api/assistant/providers/${providerId}/update-cli`,
      { method: 'POST', cache: 'no-store' }
    );
  }

  getVoiceBootstrapStatus() {
    return this.request<VoiceBootstrapResponse>('/api/voice/bootstrap', {
      cache: 'no-store'
    });
  }

  startVoiceBootstrap() {
    return this.request<VoiceBootstrapResponse>('/api/voice/bootstrap/install', {
      method: 'POST'
    });
  }

  getCodexSettings() {
    return this.request<CodexSettingsResponse>('/api/codex/settings');
  }

  updateCodexSettings(input: Partial<CodexSettingsResponse['settings']>) {
    return this.request<CodexSettingsResponse>('/api/codex/settings', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(input)
    });
  }

  getClaudeSettings() {
    return this.request<ClaudeSettingsResponse>('/api/claude/settings');
  }

  updateClaudeSettings(input: Partial<ClaudeSettingsResponse['settings']>) {
    return this.request<ClaudeSettingsResponse>('/api/claude/settings', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(input)
    });
  }

  getGeminiSettings() {
    return this.request<GeminiSettingsResponse>('/api/gemini/settings');
  }

  updateGeminiSettings(input: Partial<GeminiSettingsResponse['settings']>) {
    return this.request<GeminiSettingsResponse>('/api/gemini/settings', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(input)
    });
  }

  sendMessage(
    message: string,
    source: 'voice' | 'text',
    voiceTurnId?: string,
    attachments: string[] = []
  ) {
    return this.request<ReplyResponse | ApprovalRequiredResponse>('/api/chat/text', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(voiceTurnId ? { 'X-Voice-Turn-Id': voiceTurnId } : {})
      },
      body: JSON.stringify({ message, source, attachments })
    });
  }

  async streamMessage(
    message: string,
    source: 'voice' | 'text',
    onEvent: (event: ChatStreamEvent) => void,
    options?: { voiceTurnId?: string; signal?: AbortSignal; attachments?: string[] }
  ) {
    const response = await fetch(`${this.baseUrl}/api/chat/text/stream`, {
      method: 'POST',
      headers: {
        ...Object.fromEntries(this.createHeaders().entries()),
        'Content-Type': 'application/json',
        ...(options?.voiceTurnId ? { 'X-Voice-Turn-Id': options.voiceTurnId } : {})
      },
      body: JSON.stringify({ message, source, attachments: options?.attachments ?? [] }),
      signal: options?.signal
    });

    if (!response.ok) {
      const raw = await response.text();
      let body: {
        error?: string;
        errorKind?: AssistantErrorKind;
        details?: unknown;
      } = {};
      if (raw) {
        try {
          body = JSON.parse(raw) as typeof body;
        } catch {
          body = { error: raw.slice(0, 200) };
        }
      }
      const error = normalizeApiErrorText(body.error ?? 'Unable to stream chat response.');
      onEvent({
        type: 'error',
        error,
        errorKind: body.errorKind ?? (response.status === 429 ? 'rate_limit' : 'unknown')
      });
      throw new Error(error);
    }

    if (!response.body) {
      throw new Error('Streaming chat response body was unavailable.');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });

      let newlineIndex = buffer.indexOf('\n');
      while (newlineIndex >= 0) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        if (line) {
          try {
            onEvent(JSON.parse(line) as ChatStreamEvent);
          } catch (parseError) {
            if (parseError instanceof SyntaxError) {
              console.warn('[stream] skipping malformed NDJSON line', line.slice(0, 120));
            } else {
              throw parseError;
            }
          }
        }
        newlineIndex = buffer.indexOf('\n');
      }

      if (done) {
        const tail = buffer.trim();
        if (tail) {
          try {
            onEvent(JSON.parse(tail) as ChatStreamEvent);
          } catch (parseError) {
            if (parseError instanceof SyntaxError) {
              console.warn('[stream] skipping malformed NDJSON tail', tail.slice(0, 120));
            } else {
              throw parseError;
            }
          }
        }
        break;
      }
    }
  }

  /**
   * Subscribe to the server-sent `/api/voice/events` stream via fetch (not EventSource) so the
   * local API auth token can ride in the header layer the runtime enforces — EventSource cannot set
   * headers. Parses SSE `data:` frames and invokes `onEvent` per event. Resolves when the stream
   * ends or the signal aborts.
   */
  async streamAppEvents(onEvent: (event: AppSseEvent) => void, options?: { signal?: AbortSignal }) {
    const response = await fetch(`${this.baseUrl}/api/voice/events`, {
      headers: {
        ...Object.fromEntries(this.createHeaders().entries()),
        Accept: 'text/event-stream'
      },
      cache: 'no-store',
      signal: options?.signal
    });

    if (!response.ok || !response.body) {
      throw new Error('Unable to open the event stream.');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    const flush = (block: string) => {
      const dataLines = block
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim());
      if (dataLines.length === 0) {
        return;
      }
      try {
        onEvent(JSON.parse(dataLines.join('\n')) as AppSseEvent);
      } catch {
        // Ignore keep-alives / non-JSON frames.
      }
    };

    try {
      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });

        // SSE events are separated by a blank line.
        let boundary = buffer.indexOf('\n\n');
        while (boundary >= 0) {
          flush(buffer.slice(0, boundary));
          buffer = buffer.slice(boundary + 2);
          boundary = buffer.indexOf('\n\n');
        }

        if (done) {
          if (buffer.trim()) {
            flush(buffer);
          }
          break;
        }
      }
    } finally {
      // Release the ReadableStream lock on abort/drop so the connection is torn down cleanly.
      reader.cancel().catch(() => {});
    }
  }

  async uploadChatAttachment(file: File) {
    const response = await fetch(`${this.baseUrl}/api/chat/attachments`, {
      method: 'POST',
      headers: {
        ...Object.fromEntries(this.createHeaders().entries()),
        'X-File-Name': encodeURIComponent(file.name),
        'X-File-Type': file.type || 'application/octet-stream'
      },
      body: file
    });

    const body = (await response.json()) as {
      attachment?: ChatAttachment;
      error?: string;
      details?: unknown;
    };

    if (!response.ok || !body.attachment) {
      throw new Error(body.error ?? 'Unable to upload attachment.');
    }

    return body.attachment;
  }

  startVoiceSession() {
    return this.request<VoiceSessionResponse>('/api/voice/session/start', {
      method: 'POST'
    });
  }

  warmVoiceSession() {
    return this.request<{ ok: boolean }>('/api/voice/session/warmup', {
      method: 'POST'
    });
  }

  releaseVoiceWarmup() {
    return this.request<{ ok: boolean }>('/api/voice/session/warmup/release', {
      method: 'POST'
    });
  }

  stopVoiceSession() {
    return this.request<VoiceSessionResponse>('/api/voice/session/stop', {
      method: 'POST'
    });
  }

  interruptVoiceSession() {
    return this.request<VoiceSessionResponse>('/api/voice/session/interrupt', {
      method: 'POST'
    });
  }

  resolveVoiceCommand(transcript: string) {
    return this.request<VoiceCommandResolveResponse>('/api/voice/commands/resolve', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ transcript })
    });
  }

  applyVoiceCommandAction(action: VoiceCommandAction) {
    return this.request<VoiceCommandApplyResponse>('/api/voice/commands/apply', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ action })
    });
  }

  getVoiceSettings() {
    return this.request<VoiceSettingsResponse>('/api/voice/settings');
  }

  updateVoiceSettings(input: Partial<VoiceSettingsResponse['settings']>) {
    return this.request<VoiceSettingsResponse>('/api/voice/settings', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(input)
    });
  }

  approveChange(approvalId: string) {
    return this.request<ApprovalResponse>(`/api/approvals/${approvalId}/approve`, {
      method: 'POST'
    });
  }

  rejectChange(approvalId: string, feedback?: string) {
    return this.request<ApprovalResponse>(`/api/approvals/${approvalId}/reject`, {
      method: 'POST',
      ...(feedback && feedback.trim()
        ? {
            // Content-Type is required or express.json() skips the body and the feedback is dropped.
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ feedback: feedback.trim() })
          }
        : {})
    });
  }

  getWorkspaceRepos() {
    return this.request<WorkspaceReposResponse>('/api/workspace/repos');
  }

  getCodebaseMap(repo?: string) {
    const query = repo ? `?repo=${encodeURIComponent(repo)}` : '';
    return this.request<CodebaseMapResponse>(`/api/workspace/codebase-map${query}`);
  }

  rescanCodebaseMap(repo?: string) {
    return this.request<CodebaseMapResponse>('/api/workspace/codebase-map/rescan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(repo ? { repo } : {})
    });
  }

  summarizeCodebaseFile(path: string, symbol?: string, repo?: string) {
    return this.request<CodebaseFileSummaryResponse>('/api/workspace/codebase-map/summary', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ path, ...(symbol ? { symbol } : {}), ...(repo ? { repo } : {}) })
    });
  }

  getCodebaseFileSymbols(path: string, repo?: string) {
    return this.request<CodebaseFileSymbolsResponse>('/api/workspace/codebase-map/file-symbols', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ path, ...(repo ? { repo } : {}) })
    });
  }

  listMarkdownDocs() {
    return this.request<MarkdownListResponse>('/api/workspace/markdown');
  }

  getMarkdownDoc(path: string) {
    return this.request<MarkdownContentResponse>('/api/workspace/markdown/content', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ path })
    });
  }

  getApprovals(limit = 16) {
    return this.request<ApprovalHistoryResponse>(`/api/approvals/history?limit=${limit}`);
  }

  getAuthSessions(limit = 10) {
    return this.request<AuthSessionsResponse>(`/api/auth/sessions?limit=${limit}`);
  }
}
