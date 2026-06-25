import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import type {
  BaselineUntrackedSnapshot,
  ChatMessage,
  DiffFileStatus,
  DiffSummary,
  PendingApproval,
  WorkspaceState
} from './types.js';
import { logger } from './lib/logger.js';
import { isProtectedWorkspacePath } from './lib/path-security.js';
import { getRootDir } from './store.js';
import { getPortableAssistantCwd } from './runtime-paths.js';
import type { CodexSettingsService } from './features/codex/codex-settings.service.js';

const execFileAsync = promisify(execFile);
let codexSettingsService: CodexSettingsService | null = null;

export function initCodexClient(settings: CodexSettingsService) {
  codexSettingsService = settings;
}

export type CodexErrorKind = 'auth' | 'rate_limit' | 'service' | 'unknown';

export class CodexClientError extends Error {
  readonly kind: CodexErrorKind;
  readonly friendlyMessage: string;

  constructor(kind: CodexErrorKind, message: string, friendlyMessage: string) {
    super(message);
    this.name = 'CodexClientError';
    this.kind = kind;
    this.friendlyMessage = friendlyMessage;
  }
}

function classifyCodexError(error: unknown): CodexClientError {
  const message = extractCodexErrorMessage(error);
  const lower = message.toLowerCase();

  if (/not logged in|login|auth|unauthorized|401|forbidden|403|session expired/i.test(lower)) {
    return new CodexClientError(
      'auth',
      message,
      'Your Codex session needs reconnecting. Run the login command to continue.'
    );
  }

  if (/rate.?limit|too many requests|429|quota|throttl/i.test(lower)) {
    return new CodexClientError(
      'rate_limit',
      message,
      /resets?\s|retry after|try again in|wait \d/i.test(lower)
        ? message
        : 'Codex is rate limited right now. Give it a moment and try again.'
    );
  }

  if (/timeout|timed out|econnrefused|econnreset|enotfound|network|socket/i.test(lower)) {
    return new CodexClientError(
      'service',
      message,
      'Codex is not responding right now. Check your connection and try again.'
    );
  }

  return new CodexClientError(
    'unknown',
    message,
    'Something went wrong with Codex. Try again or check the logs.'
  );
}

function extractCodexErrorMessage(error: unknown) {
  if (!(error instanceof Error)) {
    return String(error);
  }

  const detailCandidates = [
    (error as { stderr?: unknown }).stderr,
    (error as { stdout?: unknown }).stdout,
    error.message
  ]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map((value) =>
      value
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .filter((line) => !line.startsWith('Command failed:'))
        .join('\n')
    )
    .filter(Boolean);

  for (const candidate of detailCandidates) {
    const lines = candidate
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    const explicitLimit = lines.find((line) =>
      /rate.?limit|quota|too many requests|429|resets?\s|retry after|try again in/i.test(line)
    );
    if (explicitLimit) {
      return explicitLimit;
    }

    const usefulLine = lines.find((line) => !line.startsWith('Error:'));
    if (usefulLine) {
      return usefulLine;
    }
  }

  return error.message;
}

interface WriteDecision {
  intent: 'reply' | 'propose_write';
  assistant_text: string;
  proposal_title: string;
  proposal_summary: string;
  tasks: string[];
  agents: string[];
}

interface StreamReplyOptions {
  voiceTurnId?: string;
  signal?: AbortSignal;
  onTextSnapshot?: (text: string) => void;
  onActivityUpdate?: (activity: string) => void;
}

const systemPrompt = [
  'You are Codex Voice Buddy, a sharp coding assistant.',
  'Respond as if you are speaking to one engineer live.',
  'Be concise, practical, and technically strong.',
  'Prefer short explanations, direct recommendations, and code-minded reasoning.',
  'When the user asks for implementation advice, answer like a senior engineer.',
  'When you are about to propose code changes, first explain clearly what you plan to change and why.',
  'Describe the changes in plain spoken English — which files, what modifications, and the reasoning.',
  'Your explanation will be spoken aloud to the developer, so keep it natural and conversational.',
  'After proposing changes that require approval, tell the developer to review the diff and approve or reject.'
].join(' ');

function getCodexCommand() {
  return process.env.CODEX_COMMAND ?? 'codex';
}

function normalizeStatusText(output: string) {
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('WARNING:'))
    .join('\n')
    .trim();
}

function extractAccountLabel(statusText: string) {
  const emailMatch = statusText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  if (emailMatch?.[0]) {
    return emailMatch[0];
  }

  const explicitLabelPatterns = [
    /logged in as[:\s]+(.+)$/im,
    /account[:\s]+(.+)$/im,
    /user[:\s]+(.+)$/im
  ];

  for (const pattern of explicitLabelPatterns) {
    const match = statusText.match(pattern);
    const label = match?.[1]?.trim();
    if (label) {
      return label;
    }
  }

  return null;
}

function buildConversation(history: ChatMessage[]) {
  return history
    .slice(-12)
    .map((message) => `${message.role === 'user' ? 'User' : 'Assistant'}: ${message.text}`)
    .join('\n');
}

function workspaceLine(workspace: WorkspaceState) {
  if (!workspace.projectRoot) {
    return 'No project root selected. General assistant mode only. Do not inspect local files or assume repository context.';
  }

  return `Selected workspace: ${workspace.projectRoot}`;
}

function resolveAssistantCwd(workspace: WorkspaceState) {
  return workspace.projectRoot ?? getPortableAssistantCwd();
}

function getAssistantProjectLabel(workspace: WorkspaceState, cwd: string) {
  return workspace.projectRoot ? path.basename(cwd) : 'general-assistant';
}

function buildReadOnlyPrompt(userText: string, history: ChatMessage[], workspace: WorkspaceState) {
  const conversation = buildConversation(history);

  return [
    systemPrompt,
    '',
    workspaceLine(workspace),
    `Write access enabled: ${workspace.writeAccessEnabled ? 'yes' : 'no'}.`,
    `Never read or edit files that look like secrets. Blocked patterns: ${workspace.secretPolicy.join(', ')}.`,
    !workspace.projectRoot
      ? 'No workspace is mounted. Answer from general knowledge and the conversation only. Do not scan files, inspect folders, or infer anything from the current directory.'
      : null,
    workspace.writeAccessEnabled
      ? 'This workspace is approval-gated: file changes are ENABLED, and every edit is applied only after the user approves it. Respond to this message conversationally without editing files right now; when the user asks for a change, it will be routed through the approval flow and applied once they approve. Do NOT tell the user you are read-only or that you cannot edit files — you can, through the approval flow.'
      : 'File changes are turned OFF for this workspace. Operate in advisory mode: inspect, explain, and propose, but do not edit files.',
    '',
    conversation ? `Conversation so far:\n${conversation}\n` : '',
    `Latest user message:\n${userText}`,
    '',
    'Respond directly to the latest user message.'
  ]
    .filter(Boolean)
    .join('\n');
}

function buildWriteDecisionPrompt(
  userText: string,
  history: ChatMessage[],
  workspace: WorkspaceState
) {
  const conversation = buildConversation(history);

  return [
    systemPrompt,
    '',
    workspaceLine(workspace),
    `Write access enabled: ${workspace.writeAccessEnabled ? 'yes' : 'no'}.`,
    `Never read or edit files that look like secrets. Blocked patterns: ${workspace.secretPolicy.join(', ')}.`,
    'You are deciding whether the latest user request should remain a normal reply or become a write proposal requiring approval.',
    'Return reply ONLY for questions, explanations, or read-only investigations that change nothing.',
    'Return propose_write whenever the user asks to add, remove, delete, change, edit, update, fix, refactor, rename, move, create, or implement anything in the code or files — even a single line or word. When in doubt, choose propose_write.',
    'CRITICAL: the intent field MUST agree with your assistant_text. If your explanation describes modifying, removing, or adding to any file, then intent MUST be "propose_write" — never "reply". Do not say you will change something and then return reply.',
    'When returning propose_write, your assistant_text MUST be a clear spoken explanation of what you plan to change.',
    'Describe which files will be modified, what the changes are, and why — as if you are explaining to a colleague in person.',
    'End your explanation by asking the developer to review the diff and approve it before you proceed.',
    '',
    conversation ? `Conversation so far:\n${conversation}\n` : '',
    `Latest user message:\n${userText}`
  ]
    .filter(Boolean)
    .join('\n');
}

function buildWriteExecutionPrompt(
  approval: PendingApproval,
  history: ChatMessage[],
  workspace: WorkspaceState
) {
  const conversation = buildConversation(history);

  return [
    systemPrompt,
    '',
    `Execute the approved write task inside this project root only: ${approval.projectRoot}`,
    `Project name: ${workspace.projectName ?? path.basename(approval.projectRoot)}`,
    `Do not read or modify secret-like files. Blocked patterns: ${workspace.secretPolicy.join(', ')}.`,
    'Make the requested code changes now.',
    'After making changes, respond with a concise summary of what changed, any tests run, and any follow-up risk.',
    '',
    conversation ? `Conversation so far:\n${conversation}\n` : '',
    `Approved task title:\n${approval.title}`,
    '',
    `Approved task summary:\n${approval.summary}`,
    '',
    `Concrete tasks:\n${approval.tasks.map((task, index) => `${index + 1}. ${task}`).join('\n')}`,
    '',
    `Original user request:\n${approval.userRequest}`
  ]
    .filter(Boolean)
    .join('\n');
}

async function runCodexCommand(args: string[], cwd: string, timeoutMs = 10 * 60 * 1000) {
  const startedAt = Date.now();
  const command = args[0] ?? 'unknown';
  logger.info('codex.command.started', { command, cwd });

  return await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    // stdin MUST be closed: `codex exec` reads "additional input from stdin" and blocks forever
    // waiting for EOF if stdin stays open (which execFile leaves open). 'ignore' hands the child an
    // already-closed stdin so it uses the prompt arg and exits instead of hanging the whole turn.
    const child = spawn(getCodexCommand(), args, {
      cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };

    const timer = setTimeout(() => {
      settle(() => {
        child.kill('SIGKILL');
        const message = `Codex command timed out after ${Math.round(timeoutMs / 1000)}s.`;
        logger.error('codex.command.failed', {
          command,
          cwd,
          durationMs: Date.now() - startedAt,
          error: message,
          stderr: stderr.slice(-300)
        });
        reject(new Error(message));
      });
    }, timeoutMs);

    child.stdout?.on('data', (chunk) => {
      if (stdout.length < 12 * 1024 * 1024) stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk) => {
      if (stderr.length < 1024 * 1024) stderr += chunk.toString();
    });

    child.on('error', (error) => {
      settle(() => {
        logger.error('codex.command.failed', {
          command,
          cwd,
          durationMs: Date.now() - startedAt,
          error: error.message,
          stderr: stderr.slice(-300)
        });
        reject(error);
      });
    });

    child.on('close', (code) => {
      settle(() => {
        if (code === 0) {
          logger.info('codex.command.completed', {
            command,
            cwd,
            durationMs: Date.now() - startedAt
          });
          resolve({ stdout, stderr });
        } else {
          const message = stderr.trim() || `Codex command exited with code ${code ?? 'unknown'}.`;
          logger.error('codex.command.failed', {
            command,
            cwd,
            durationMs: Date.now() - startedAt,
            error: message.slice(0, 300)
          });
          reject(new Error(message));
        }
      });
    });
  });
}

async function runCodexPrompt(options: {
  cwd: string;
  sandbox: 'read-only' | 'workspace-write';
  prompt: string;
  outputSchema?: unknown;
  executionContext?: { surface: 'voice' | 'text'; intent: 'discussion' | 'write' };
}) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'oplyr-'));
  const outputFile = path.join(tempDir, 'last-message.txt');
  const args = [
    'exec',
    '--skip-git-repo-check',
    '--sandbox',
    options.sandbox,
    '--color',
    'never',
    '-C',
    options.cwd,
    '--output-last-message',
    outputFile
  ];

  const executionSettings = codexSettingsService
    ? await codexSettingsService.getExecutionOverrides(options.executionContext)
    : null;
  if (executionSettings?.model) {
    args.push('-c', `model=${executionSettings.model}`);
  }

  if (executionSettings?.reasoningEffort) {
    args.push('-c', `model_reasoning_effort=${executionSettings.reasoningEffort}`);
  }

  let schemaFile: string | null = null;
  if (options.outputSchema) {
    schemaFile = path.join(tempDir, 'schema.json');
    await fs.writeFile(schemaFile, JSON.stringify(options.outputSchema, null, 2), 'utf8');
    args.push('--output-schema', schemaFile);
  }

  args.push(options.prompt);

  try {
    await runCodexCommand(args, options.cwd);
    const raw = (await fs.readFile(outputFile, 'utf8')).trim();
    if (!raw) {
      throw new Error('Codex returned an empty response.');
    }
    return raw;
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

function getExecutionOverrides(context?: {
  surface: 'voice' | 'text';
  intent: 'discussion' | 'write';
}) {
  return codexSettingsService?.getExecutionOverrides(context) ?? Promise.resolve(null);
}

function createAbortError() {
  const error = new Error('Codex stream aborted.');
  error.name = 'AbortError';
  return error;
}

async function runCodexPromptStream(options: {
  cwd: string;
  prompt: string;
  signal?: AbortSignal;
  onTextSnapshot?: (text: string) => void;
  onActivityUpdate?: (activity: string) => void;
  executionContext?: { surface: 'voice' | 'text'; intent: 'discussion' | 'write' };
}) {
  const executionSettings = await getExecutionOverrides(options.executionContext);

  return new Promise<string>((resolve, reject) => {
    const args = ['app-server', '--listen', 'stdio://'];
    const child = spawn(getCodexCommand(), args, {
      cwd: options.cwd,
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdoutBuffer = '';
    let stderrBuffer = '';
    let settled = false;
    let requestId = 0;
    let threadId: string | null = null;
    let finalText = '';
    let latestText = '';
    let lastActivity = '';
    let abortListener: (() => void) | null = null;

    const cleanup = () => {
      if (abortListener && options.signal) {
        options.signal.removeEventListener('abort', abortListener);
      }
      child.stdout.removeAllListeners();
      child.stderr.removeAllListeners();
      child.removeAllListeners();
    };

    const rejectOnce = (error: unknown) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      reject(error instanceof Error ? error : new Error(String(error)));
    };

    const resolveOnce = (value: string) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve(value);
    };

    const send = (message: Record<string, unknown>) => {
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`);
    };

    const startTurn = (nextThreadId: string) => {
      const params: Record<string, unknown> = {
        threadId: nextThreadId,
        input: [
          {
            type: 'text',
            text: options.prompt,
            text_elements: []
          }
        ],
        cwd: options.cwd,
        approvalPolicy: 'never',
        sandboxPolicy: {
          type: 'readOnly',
          access: { type: 'fullAccess' },
          networkAccess: false
        }
      };

      if (executionSettings?.model) {
        params.model = executionSettings.model;
      }

      if (executionSettings?.reasoningEffort) {
        params.effort = executionSettings.reasoningEffort;
      }

      send({
        id: ++requestId,
        method: 'turn/start',
        params
      });
    };

    const handleLine = (line: string) => {
      let message: Record<string, unknown>;
      try {
        message = JSON.parse(line) as Record<string, unknown>;
      } catch {
        return;
      }

      if (typeof message.id === 'number' && 'error' in message) {
        const errorBody = message.error;
        const errorMessage =
          errorBody && typeof errorBody === 'object' && 'message' in errorBody
            ? String((errorBody as { message?: unknown }).message ?? 'Codex stream failed.')
            : 'Codex stream failed.';
        rejectOnce(new Error(errorMessage));
        child.kill('SIGTERM');
        return;
      }

      if (message.id === 1 && 'result' in message) {
        send({ method: 'initialized' });

        const params: Record<string, unknown> = {
          cwd: options.cwd,
          approvalPolicy: 'never',
          sandbox: 'read-only',
          experimentalRawEvents: false,
          persistExtendedHistory: false
        };

        if (executionSettings?.model) {
          params.model = executionSettings.model;
        }

        send({
          id: ++requestId,
          method: 'thread/start',
          params
        });
        return;
      }

      if (message.id === 2 && 'result' in message) {
        const result = message.result;
        if (!result || typeof result !== 'object') {
          rejectOnce(new Error('Codex app-server did not return a thread.'));
          child.kill('SIGTERM');
          return;
        }

        const resultThreadId = (result as { thread?: { id?: string } }).thread?.id?.trim?.() ?? '';
        if (!resultThreadId) {
          rejectOnce(new Error('Codex app-server returned an invalid thread id.'));
          child.kill('SIGTERM');
          return;
        }

        threadId = resultThreadId;
        startTurn(resultThreadId);
        return;
      }

      if (message.method === 'item/agentMessage/delta') {
        const params = message.params as { threadId?: string; delta?: string } | undefined;
        if (!params || params.threadId !== threadId || typeof params.delta !== 'string') {
          return;
        }

        latestText += params.delta;
        options.onTextSnapshot?.(latestText);
        return;
      }

      if (message.method === 'item/started') {
        const params = message.params as
          | { threadId?: string; item?: Record<string, unknown> }
          | undefined;
        if (!params || params.threadId !== threadId || !params.item) {
          return;
        }

        const activity = describeStreamActivity(params.item, options.cwd);
        if (activity && activity !== lastActivity) {
          lastActivity = activity;
          options.onActivityUpdate?.(activity);
        }
        return;
      }

      if (message.method === 'item/completed') {
        const params = message.params as { item?: { type?: string; text?: string } } | undefined;
        if (params?.item?.type === 'agentMessage' && typeof params.item.text === 'string') {
          finalText = params.item.text;
          if (finalText !== latestText) {
            latestText = finalText;
            options.onTextSnapshot?.(latestText);
          }
        }
        return;
      }

      if (message.method === 'turn/completed') {
        child.kill('SIGTERM');
        const result = (finalText || latestText).trim();
        if (!result) {
          rejectOnce(new Error('Codex completed the turn but returned no text.'));
        } else {
          resolveOnce(result);
        }
      }
    };

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdoutBuffer += chunk;
      while (true) {
        const newlineIndex = stdoutBuffer.indexOf('\n');
        if (newlineIndex < 0) {
          break;
        }
        const line = stdoutBuffer.slice(0, newlineIndex).trim();
        stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
        if (!line) {
          continue;
        }
        handleLine(line);
      }
    });

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      stderrBuffer += chunk;
    });

    child.once('error', (error) => {
      rejectOnce(error);
    });

    child.once('exit', (code, signal) => {
      if (settled) {
        return;
      }

      if (options.signal?.aborted) {
        rejectOnce(createAbortError());
        return;
      }

      const stderrText = stderrBuffer.trim();
      rejectOnce(
        new Error(
          stderrText ||
            `Codex app-server exited before completing the reply (${code ?? signal ?? 'unknown'}).`
        )
      );
    });

    if (options.signal) {
      abortListener = () => {
        try {
          child.kill('SIGTERM');
        } catch {
          // Ignore cleanup failures while aborting the stream.
        }
        setTimeout(() => {
          try {
            child.kill('SIGKILL');
          } catch {
            // Ignore cleanup failures while aborting the stream.
          }
        }, 3000).unref();
        rejectOnce(createAbortError());
      };

      if (options.signal.aborted) {
        abortListener();
        return;
      }

      options.signal.addEventListener('abort', abortListener, { once: true });
    }

    send({
      id: ++requestId,
      method: 'initialize',
      params: {
        clientInfo: {
          name: 'oplyr-api',
          title: 'Oplyr API',
          version: '0.1.0'
        },
        capabilities: {
          experimentalApi: true
        }
      }
    });
  });
}

async function assertCodexReady() {
  const codexStatus = await getCodexStatus();
  if (!codexStatus.installed) {
    throw new CodexClientError(
      'service',
      'Codex CLI is not installed on this machine.',
      'Codex is not installed on this machine. Install it first to continue.'
    );
  }

  if (!codexStatus.loggedIn) {
    throw new CodexClientError(
      'auth',
      'Codex CLI is not logged in.',
      'Your Codex session needs reconnecting. Run the login command to continue.'
    );
  }
}

export async function getCodexStatus() {
  try {
    const { stdout, stderr } = await execFileAsync(getCodexCommand(), ['login', 'status'], {
      cwd: getRootDir(),
      env: process.env,
      timeout: 15000,
      maxBuffer: 1024 * 1024
    });

    const statusText = normalizeStatusText([stdout, stderr].filter(Boolean).join('\n'));
    const loggedIn = /logged in/i.test(statusText);
    const authModeMatch = statusText.match(/Logged in using (.+)$/i);

    return {
      installed: true,
      loggedIn,
      accountLabel: loggedIn ? extractAccountLabel(statusText) : null,
      authMode: authModeMatch?.[1]?.trim() ?? (loggedIn ? 'Configured' : null),
      statusText
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unable to determine Codex login status.';

    return {
      installed: !/ENOENT/.test(message),
      loggedIn: false,
      accountLabel: null,
      authMode: null,
      statusText: message
    };
  }
}

export async function logoutCodex() {
  await runCodexCommand(['logout'], getRootDir());
}

export async function generateAssistantReply(
  userText: string,
  history: ChatMessage[],
  workspace: WorkspaceState,
  options?: { voiceTurnId?: string }
) {
  await assertCodexReady();
  const cwd = resolveAssistantCwd(workspace);
  const startedAt = Date.now();
  const text = await runCodexPrompt({
    cwd,
    sandbox: 'read-only',
    prompt: buildReadOnlyPrompt(userText, history, workspace),
    executionContext: {
      surface: options?.voiceTurnId ? 'voice' : 'text',
      intent: 'discussion'
    }
  });
  logger.info('codex.prompt.completed', {
    operation: 'generate_reply',
    sandbox: 'read-only',
    durationMs: Date.now() - startedAt,
    projectName: getAssistantProjectLabel(workspace, cwd),
    promptLength: userText.length,
    responseLength: text.length,
    ...(options?.voiceTurnId ? { voiceTurnId: options.voiceTurnId } : {})
  });

  return { text };
}

export async function streamAssistantReply(
  userText: string,
  history: ChatMessage[],
  workspace: WorkspaceState,
  options?: StreamReplyOptions
) {
  await assertCodexReady();
  const cwd = resolveAssistantCwd(workspace);
  const startedAt = Date.now();

  if (options?.signal?.aborted) {
    logger.warn('codex.stream.pre_aborted', {
      operation: 'stream_reply',
      projectName: getAssistantProjectLabel(workspace, cwd),
      ...(options?.voiceTurnId ? { voiceTurnId: options.voiceTurnId } : {})
    });
    throw createAbortError();
  }

  let text: string;
  try {
    text = await runCodexPromptStream({
      cwd,
      prompt: buildReadOnlyPrompt(userText, history, workspace),
      signal: options?.signal,
      onTextSnapshot: options?.onTextSnapshot,
      onActivityUpdate: options?.onActivityUpdate,
      executionContext: {
        surface: options?.voiceTurnId ? 'voice' : 'text',
        intent: 'discussion'
      }
    });
  } catch (error) {
    const classified = error instanceof CodexClientError ? error : classifyCodexError(error);
    logger.error('codex.stream.failed', {
      operation: 'stream_reply',
      errorKind: classified.kind,
      durationMs: Date.now() - startedAt,
      projectName: getAssistantProjectLabel(workspace, cwd),
      error: classified.message,
      ...(options?.voiceTurnId ? { voiceTurnId: options.voiceTurnId } : {})
    });
    throw classified;
  }

  logger.info('codex.prompt.completed', {
    operation: 'stream_reply',
    sandbox: 'read-only',
    durationMs: Date.now() - startedAt,
    projectName: getAssistantProjectLabel(workspace, cwd),
    promptLength: userText.length,
    responseLength: text.length,
    ...(options?.voiceTurnId ? { voiceTurnId: options.voiceTurnId } : {})
  });

  return { text };
}

function describeStreamActivity(item: Record<string, unknown>, cwd: string) {
  const type = typeof item.type === 'string' ? item.type : null;
  if (!type) {
    return null;
  }

  switch (type) {
    case 'reasoning':
      return 'Thinking through the request';
    case 'plan':
      return 'Planning the next steps';
    case 'commandExecution':
      return describeCommandExecution(item, cwd);
    case 'fileChange':
      return describeFileChange(item, cwd);
    case 'mcpToolCall': {
      const server = typeof item.server === 'string' ? item.server : 'tool';
      const tool = typeof item.tool === 'string' ? item.tool : 'tool';
      return `Using ${server}/${tool}`;
    }
    case 'dynamicToolCall': {
      const tool = typeof item.tool === 'string' ? item.tool : 'tool';
      return `Using ${tool}`;
    }
    case 'webSearch': {
      const query = typeof item.query === 'string' ? item.query.trim() : '';
      return query ? `Searching for ${query}` : 'Searching for related context';
    }
    default:
      return null;
  }
}

function describeCommandExecution(item: Record<string, unknown>, cwd: string) {
  const commandActions = Array.isArray(item.commandActions)
    ? (item.commandActions as Array<Record<string, unknown>>)
    : [];

  for (const action of commandActions) {
    if (action.type === 'read') {
      const targetPath = typeof action.path === 'string' ? action.path : '';
      return `Reading ${displayPath(targetPath, cwd)}`;
    }

    if (action.type === 'listFiles') {
      const targetPath = typeof action.path === 'string' ? action.path : '';
      return targetPath ? `Scanning ${displayPath(targetPath, cwd)}` : 'Scanning the workspace';
    }

    if (action.type === 'search') {
      const query = typeof action.query === 'string' ? action.query.trim() : '';
      return query ? `Searching for ${query}` : 'Searching for related files';
    }
  }

  const command = typeof item.command === 'string' ? item.command.trim() : '';
  if (!command) {
    return 'Running a command';
  }

  const summary = command.split(/\s+/).slice(0, 3).join(' ');
  return `Running ${summary}`;
}

function describeFileChange(item: Record<string, unknown>, cwd: string) {
  const changes = Array.isArray(item.changes)
    ? (item.changes as Array<Record<string, unknown>>)
    : [];
  const firstChange = changes.find((change) => typeof change.path === 'string');

  if (firstChange && typeof firstChange.path === 'string') {
    return `Editing ${displayPath(firstChange.path, cwd)}`;
  }

  return 'Editing project files';
}

function displayPath(targetPath: string, cwd: string) {
  const trimmed = targetPath.trim();
  if (!trimmed) {
    return 'the workspace';
  }

  if (!path.isAbsolute(trimmed)) {
    return trimmed;
  }

  const relativePath = path.relative(cwd, trimmed);
  if (!relativePath || relativePath.startsWith('..')) {
    return 'a file outside the project';
  }

  return relativePath;
}

export async function decideWriteIntent(
  userText: string,
  history: ChatMessage[],
  workspace: WorkspaceState,
  options?: { voiceTurnId?: string }
) {
  await assertCodexReady();
  const cwd = workspace.projectRoot ?? getRootDir();
  const startedAt = Date.now();
  const schema = {
    type: 'object',
    properties: {
      intent: {
        type: 'string',
        enum: ['reply', 'propose_write']
      },
      assistant_text: {
        type: 'string'
      },
      proposal_title: {
        type: 'string'
      },
      proposal_summary: {
        type: 'string'
      },
      tasks: {
        type: 'array',
        items: {
          type: 'string'
        }
      },
      agents: {
        type: 'array',
        items: {
          type: 'string'
        }
      }
    },
    required: ['intent', 'assistant_text', 'proposal_title', 'proposal_summary', 'tasks', 'agents'],
    additionalProperties: false
  };

  const raw = await runCodexPrompt({
    cwd,
    sandbox: 'read-only',
    prompt: buildWriteDecisionPrompt(userText, history, workspace),
    outputSchema: schema,
    executionContext: {
      surface: options?.voiceTurnId ? 'voice' : 'text',
      intent: 'write'
    }
  });
  logger.info('codex.prompt.completed', {
    operation: 'decide_write_intent',
    sandbox: 'read-only',
    durationMs: Date.now() - startedAt,
    projectName: path.basename(cwd),
    promptLength: userText.length,
    responseLength: raw.length,
    ...(options?.voiceTurnId ? { voiceTurnId: options.voiceTurnId } : {})
  });

  return JSON.parse(raw) as WriteDecision;
}

function deriveDiffFileStatus(statusCode: string): DiffFileStatus {
  // `git status --porcelain` two-char XY code. Untracked files use `??`.
  // We collapse the staged/worktree pair into a single user-facing change type.
  const codes = statusCode.replace(/\s/g, '');
  if (statusCode === '??' || codes.includes('A')) {
    return 'added';
  }
  if (codes.includes('D')) {
    return 'deleted';
  }
  if (codes.includes('R') || codes.includes('C')) {
    return 'renamed';
  }
  return 'modified';
}

async function readGitStatus(projectRoot: string) {
  const { stdout } = await execFileAsync('git', ['-C', projectRoot, 'status', '--porcelain'], {
    timeout: 20000,
    maxBuffer: 1024 * 1024 * 4
  });

  return stdout
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean);
}

async function listUntrackedFiles(projectRoot: string) {
  const { stdout } = await execFileAsync(
    'git',
    ['-C', projectRoot, 'ls-files', '--others', '--exclude-standard', '-z'],
    {
      timeout: 20000,
      maxBuffer: 1024 * 1024 * 4
    }
  );

  return stdout.split('\0').filter((line) => line.length > 0);
}

async function hashWorkspaceFile(projectRoot: string, filePath: string, writeObject: boolean) {
  const args = ['-C', projectRoot, 'hash-object'];
  if (writeObject) {
    args.push('-w');
  }
  args.push('--', filePath);

  const { stdout } = await execFileAsync('git', args, {
    timeout: 20000,
    maxBuffer: 1024 * 1024
  });

  return stdout.trim();
}

async function readGitBlob(projectRoot: string, blobHash: string) {
  const result = (await execFileAsync('git', ['-C', projectRoot, 'cat-file', 'blob', blobHash], {
    encoding: 'buffer',
    timeout: 20000,
    maxBuffer: 1024 * 1024 * 4
  })) as { stdout: Buffer };

  return result.stdout;
}

async function runNoIndexDiff(projectRoot: string, args: string[]) {
  try {
    const { stdout } = await execFileAsync('git', ['diff', '--no-index', ...args], {
      cwd: projectRoot,
      timeout: 20000,
      maxBuffer: 1024 * 1024 * 4
    });

    return stdout;
  } catch (error) {
    return (error as { stdout?: string }).stdout ?? '';
  }
}

async function buildUntrackedFileDiff(projectRoot: string, filePath: string) {
  const absoluteFile = path.join(projectRoot, filePath);
  return runNoIndexDiff(projectRoot, ['--', '/dev/null', absoluteFile]);
}

async function buildBlobToPathDiff(
  projectRoot: string,
  filePath: string,
  blobHash: string,
  currentPath: string
) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'oplyr-diff-baseline-'));
  const baselineFile = path.join(tempDir, 'baseline');

  try {
    await fs.writeFile(baselineFile, await readGitBlob(projectRoot, blobHash));
    return await runNoIndexDiff(projectRoot, ['--', baselineFile, currentPath]);
  } finally {
    await fs.rm(tempDir, { force: true, recursive: true });
  }
}

export async function collectGitDiff(projectRoot: string): Promise<DiffSummary> {
  try {
    await execFileAsync('git', ['-C', projectRoot, 'rev-parse', '--show-toplevel'], {
      timeout: 20000,
      maxBuffer: 1024 * 1024
    });
  } catch {
    return {
      isGitRepo: false,
      changedFiles: [],
      files: []
    };
  }

  const statusLines = await readGitStatus(projectRoot);
  const changedFiles = statusLines.map((line) => line.slice(3).trim()).filter(Boolean);
  const redactedFiles: string[] = [];

  const files: DiffSummary['files'] = [];

  for (const line of statusLines) {
    const statusCode = line.slice(0, 2);
    const parsedPath = line.slice(3).trim();

    if (!parsedPath) {
      continue;
    }

    // Porcelain v1 emits renames/copies as `old/path -> new/path`. Use the
    // destination (right-hand) path for the diff invocation and display.
    const isRenameOrCopy = statusCode.startsWith('R') || statusCode.startsWith('C');
    const filePath = isRenameOrCopy
      ? (parsedPath.split(' -> ').pop()?.trim() ?? parsedPath)
      : parsedPath;

    if (await isProtectedWorkspacePath(projectRoot, filePath)) {
      redactedFiles.push(filePath);
      continue;
    }

    const status = deriveDiffFileStatus(statusCode);

    if (statusCode === '??') {
      const diff = await buildUntrackedFileDiff(projectRoot, filePath);
      files.push({
        filePath,
        diff,
        status
      });
      continue;
    }

    try {
      const { stdout } = await execFileAsync(
        'git',
        ['-C', projectRoot, 'diff', '--no-ext-diff', '--', filePath],
        {
          timeout: 20000,
          maxBuffer: 1024 * 1024 * 4
        }
      );

      files.push({
        filePath,
        diff: stdout,
        status
      });
    } catch {
      files.push({
        filePath,
        diff: '',
        status
      });
    }
  }

  return {
    isGitRepo: true,
    changedFiles: changedFiles.filter((filePath) => !redactedFiles.includes(filePath)),
    files,
    ...(redactedFiles.length > 0 ? { redactedFiles } : {})
  };
}

export async function revertProtectedGitChanges(projectRoot: string, protectedPaths: string[]) {
  const normalizedPaths = Array.from(
    new Set(protectedPaths.map((value) => value.trim()).filter(Boolean))
  );
  if (normalizedPaths.length === 0) {
    return;
  }

  const statusEntries = new Map<string, string>();
  for (const line of await readGitStatus(projectRoot)) {
    const filePath = line.slice(3).trim();
    if (filePath) {
      statusEntries.set(filePath, line.slice(0, 2));
    }
  }

  for (const filePath of normalizedPaths) {
    const statusCode = statusEntries.get(filePath) ?? '';
    if (statusCode === '??') {
      await fs.rm(path.join(projectRoot, filePath), {
        force: true,
        recursive: true
      });
      continue;
    }

    try {
      await execFileAsync(
        'git',
        ['-C', projectRoot, 'restore', '--source=HEAD', '--staged', '--worktree', '--', filePath],
        {
          timeout: 20000,
          maxBuffer: 1024 * 1024
        }
      );
    } catch {
      await execFileAsync('git', ['-C', projectRoot, 'checkout', '--', filePath], {
        timeout: 20000,
        maxBuffer: 1024 * 1024
      });
    }
  }
}

/**
 * Capture a non-destructive snapshot of the current working tree and return a ref. Used so a later
 * revert restores ONLY the assistant's edits without touching the user's other uncommitted work.
 * Returns HEAD when there is nothing stashable (clean tracked tree).
 */
export async function snapshotWorkingTree(projectRoot: string): Promise<{
  ref: string;
  untracked: string[];
  untrackedSnapshots: BaselineUntrackedSnapshot[];
}> {
  let ref = 'HEAD';
  try {
    const { stdout } = await execFileAsync('git', ['-C', projectRoot, 'stash', 'create'], {
      timeout: 20000,
      maxBuffer: 1024 * 1024
    });
    ref = stdout.trim() || (await resolveHeadRef(projectRoot));
  } catch {
    ref = await resolveHeadRef(projectRoot);
  }

  // Capture the untracked files that already exist, so a later "since" diff can tell the
  // assistant's NEW files apart from files the user had created before the turn. We also store
  // local blob snapshots for non-protected files, so AI edits/deletions to those untracked files
  // are still reviewable and rejectable.
  let untracked: string[] = [];
  let untrackedSnapshots: BaselineUntrackedSnapshot[] = [];
  try {
    untracked = await listUntrackedFiles(projectRoot);
    untrackedSnapshots = await snapshotUntrackedFiles(projectRoot, untracked);
  } catch {
    untracked = [];
    untrackedSnapshots = [];
  }

  return { ref, untracked, untrackedSnapshots };
}

async function snapshotUntrackedFiles(projectRoot: string, filePaths: string[]) {
  const snapshots: BaselineUntrackedSnapshot[] = [];

  for (const filePath of filePaths) {
    try {
      if (await isProtectedWorkspacePath(projectRoot, filePath)) {
        continue;
      }

      const absoluteFile = path.join(projectRoot, filePath);
      const stats = await fs.stat(absoluteFile);
      if (!stats.isFile()) {
        continue;
      }

      snapshots.push({
        filePath,
        blobHash: await hashWorkspaceFile(projectRoot, filePath, true),
        mode: stats.mode & 0o777
      });
    } catch {
      // If a file disappears while snapshotting, ignore it and let the normal git diff continue.
    }
  }

  return snapshots;
}

async function resolveHeadRef(projectRoot: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', ['-C', projectRoot, 'rev-parse', 'HEAD'], {
      timeout: 20000,
      maxBuffer: 1024 * 1024
    });
    return stdout.trim() || 'HEAD';
  } catch {
    return 'HEAD';
  }
}

/**
 * Collect ONLY the changes made since a snapshot ref (see snapshotWorkingTree). This is what the
 * Review screen shows: the assistant's current turn, not the user's other uncommitted work.
 * Tracked changes are diffed against the snapshot; untracked files are included only if they did
 * not already exist at snapshot time.
 */
export async function collectGitDiffSince(
  projectRoot: string,
  baselineRef: string,
  baselineUntracked: string[] = [],
  baselineUntrackedSnapshots: BaselineUntrackedSnapshot[] = []
): Promise<DiffSummary> {
  try {
    await execFileAsync('git', ['-C', projectRoot, 'rev-parse', '--show-toplevel'], {
      timeout: 20000,
      maxBuffer: 1024 * 1024
    });
  } catch {
    return { isGitRepo: false, changedFiles: [], files: [] };
  }

  const files: DiffSummary['files'] = [];
  const changedFiles: string[] = [];
  const redactedFiles: string[] = [];
  const seenFiles = new Set<string>();
  const baselineUntrackedSnapshotMap = new Map(
    baselineUntrackedSnapshots.map((snapshot) => [snapshot.filePath, snapshot])
  );

  // 1) Tracked changes since the snapshot (the user's pre-existing changes are inside the snapshot,
  //    so they are excluded here).
  let nameStatus = '';
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['-C', projectRoot, 'diff', '--no-ext-diff', '--name-status', baselineRef],
      { timeout: 20000, maxBuffer: 1024 * 1024 * 4 }
    );
    nameStatus = stdout;
  } catch {
    nameStatus = '';
  }

  for (const rawLine of nameStatus.split('\n')) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }
    const parts = line.split('\t');
    const code = parts[0] ?? '';
    const filePath = (parts.length >= 3 ? parts[2] : parts[1])?.trim();
    if (!filePath) {
      continue;
    }
    if (baselineUntrackedSnapshotMap.has(filePath)) {
      continue;
    }
    if (await isProtectedWorkspacePath(projectRoot, filePath)) {
      redactedFiles.push(filePath);
      continue;
    }
    const status = nameStatusToFileStatus(code);
    seenFiles.add(filePath);
    changedFiles.push(filePath);
    try {
      const { stdout } = await execFileAsync(
        'git',
        ['-C', projectRoot, 'diff', '--no-ext-diff', baselineRef, '--', filePath],
        { timeout: 20000, maxBuffer: 1024 * 1024 * 4 }
      );
      files.push({ filePath, diff: stdout, status });
    } catch {
      files.push({ filePath, diff: '', status });
    }
  }

  // 2) Pre-existing untracked files the assistant modified or deleted. Git cannot diff these
  //    against a commit, so compare the current file to the blob snapshot captured before the turn.
  for (const snapshot of baselineUntrackedSnapshots) {
    const filePath = snapshot.filePath;
    if (!filePath || seenFiles.has(filePath)) {
      continue;
    }
    if (await isProtectedWorkspacePath(projectRoot, filePath)) {
      redactedFiles.push(filePath);
      continue;
    }

    const absoluteFile = path.join(projectRoot, filePath);
    let currentHash: string | null = null;
    try {
      currentHash = await hashWorkspaceFile(projectRoot, filePath, false);
    } catch {
      currentHash = null;
    }

    if (currentHash === snapshot.blobHash) {
      continue;
    }

    seenFiles.add(filePath);
    changedFiles.push(filePath);
    files.push({
      filePath,
      diff: await buildBlobToPathDiff(
        projectRoot,
        filePath,
        snapshot.blobHash,
        currentHash ? absoluteFile : '/dev/null'
      ),
      status: currentHash ? 'modified' : 'deleted'
    });
  }

  // 3) Untracked files the assistant CREATED this turn (current untracked minus baseline untracked).
  const baseline = new Set(baselineUntracked);
  for (const filePath of await listUntrackedFiles(projectRoot)) {
    if (!filePath || baseline.has(filePath) || seenFiles.has(filePath)) {
      continue;
    }
    if (await isProtectedWorkspacePath(projectRoot, filePath)) {
      redactedFiles.push(filePath);
      continue;
    }
    seenFiles.add(filePath);
    changedFiles.push(filePath);
    files.push({
      filePath,
      diff: await buildUntrackedFileDiff(projectRoot, filePath),
      status: 'added'
    });
  }

  return {
    isGitRepo: true,
    changedFiles,
    files,
    ...(redactedFiles.length > 0 ? { redactedFiles } : {})
  };
}

function nameStatusToFileStatus(code: string): DiffFileStatus {
  const c = code.charAt(0);
  if (c === 'A') return 'added';
  if (c === 'D') return 'deleted';
  if (c === 'R' || c === 'C') return 'renamed';
  return 'modified';
}

/**
 * Revert the assistant's applied changes back to a pre-edit snapshot. Files the assistant created
 * (status 'added') are removed; everything else is restored from the snapshot ref. Only the
 * provided files are touched, so the user's other working-tree changes are preserved.
 */
export async function revertWorkingTree(
  projectRoot: string,
  baselineRef: string,
  files: Array<{ filePath: string; status?: string }>,
  baselineUntrackedSnapshots: BaselineUntrackedSnapshot[] = []
) {
  const baselineUntrackedSnapshotMap = new Map(
    baselineUntrackedSnapshots.map((snapshot) => [snapshot.filePath, snapshot])
  );

  for (const { filePath, status } of files) {
    const trimmed = filePath?.trim();
    if (!trimmed) {
      continue;
    }
    const untrackedSnapshot = baselineUntrackedSnapshotMap.get(trimmed);
    if (untrackedSnapshot) {
      await restoreUntrackedSnapshot(projectRoot, untrackedSnapshot);
      continue;
    }
    if (status === 'added') {
      await fs.rm(path.join(projectRoot, trimmed), { force: true, recursive: true });
      continue;
    }
    try {
      await execFileAsync(
        'git',
        ['-C', projectRoot, 'restore', '--source', baselineRef, '--worktree', '--', trimmed],
        { timeout: 20000, maxBuffer: 1024 * 1024 }
      );
    } catch {
      // File may not exist at the baseline (assistant created it) — remove it.
      await fs.rm(path.join(projectRoot, trimmed), { force: true, recursive: true });
    }
  }
}

async function restoreUntrackedSnapshot(projectRoot: string, snapshot: BaselineUntrackedSnapshot) {
  const absoluteFile = path.join(projectRoot, snapshot.filePath);
  await fs.mkdir(path.dirname(absoluteFile), { recursive: true });
  await fs.writeFile(absoluteFile, await readGitBlob(projectRoot, snapshot.blobHash));

  if (snapshot.mode !== undefined) {
    await fs.chmod(absoluteFile, snapshot.mode);
  }
}

export async function executeApprovedWrite(
  approval: PendingApproval,
  history: ChatMessage[],
  workspace: WorkspaceState,
  options?: { voiceTurnId?: string }
) {
  await assertCodexReady();
  const startedAt = Date.now();
  const text = await runCodexPrompt({
    cwd: approval.projectRoot,
    sandbox: 'workspace-write',
    prompt: buildWriteExecutionPrompt(approval, history, workspace),
    executionContext: {
      surface: options?.voiceTurnId ? 'voice' : 'text',
      intent: 'write'
    }
  });
  logger.info('codex.prompt.completed', {
    operation: 'execute_approved_write',
    sandbox: 'workspace-write',
    durationMs: Date.now() - startedAt,
    projectName: path.basename(approval.projectRoot),
    taskCount: approval.tasks.length,
    responseLength: text.length,
    ...(options?.voiceTurnId ? { voiceTurnId: options.voiceTurnId } : {})
  });

  return { text };
}
