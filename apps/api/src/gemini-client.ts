import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ChatMessage, PendingApproval, WorkspaceState } from './types.js';
import type { GeminiSettingsService } from './features/gemini/gemini-settings.service.js';
import { logger } from './lib/logger.js';
import { getPortableAssistantCwd } from './runtime-paths.js';

let geminiSettingsService: GeminiSettingsService | null = null;

export function initGeminiClient(settings: GeminiSettingsService) {
  geminiSettingsService = settings;
}

type GeminiErrorKind = 'auth' | 'rate_limit' | 'service' | 'unknown';

export class GeminiClientError extends Error {
  readonly kind: GeminiErrorKind;
  readonly friendlyMessage: string;

  constructor(kind: GeminiErrorKind, message: string, friendlyMessage: string) {
    super(message);
    this.name = 'GeminiClientError';
    this.kind = kind;
    this.friendlyMessage = friendlyMessage;
  }
}

interface StreamReplyOptions {
  voiceTurnId?: string;
  signal?: AbortSignal;
  onTextSnapshot?: (text: string) => void;
  onActivityUpdate?: (activity: string) => void;
}

function getGeminiCommand() {
  return process.env.GEMINI_COMMAND ?? 'gemini';
}

function execGeminiCommand(args: string[], cwd: string) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const startedAt = Date.now();
    logger.info('gemini.command.started', {
      command: args[0] ?? 'unknown',
      cwd
    });
    execFile(
      getGeminiCommand(),
      args,
      {
        cwd,
        env: process.env,
        timeout: 10 * 60 * 1000,
        maxBuffer: 1024 * 1024 * 12
      },
      (error, stdout, stderr) => {
        if (error) {
          const nextError = error as Error & { stdout?: string; stderr?: string };
          nextError.stdout = typeof stdout === 'string' ? stdout : String(stdout ?? '');
          nextError.stderr = typeof stderr === 'string' ? stderr : String(stderr ?? '');
          logger.error('gemini.command.failed', {
            command: args[0] ?? 'unknown',
            cwd,
            durationMs: Date.now() - startedAt,
            error: nextError.message,
            stderr: nextError.stderr?.slice(0, 300) ?? null
          });
          reject(nextError);
          return;
        }

        logger.info('gemini.command.completed', {
          command: args[0] ?? 'unknown',
          cwd,
          durationMs: Date.now() - startedAt
        });
        resolve({
          stdout: typeof stdout === 'string' ? stdout : String(stdout ?? ''),
          stderr: typeof stderr === 'string' ? stderr : String(stderr ?? '')
        });
      }
    );
  });
}

function normalizeStatusText(output: string) {
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n')
    .trim();
}

function extractGeminiErrorMessage(error: unknown) {
  if (!(error instanceof Error)) {
    return String(error);
  }

  const detailCandidates = [
    (error as { stderr?: unknown }).stderr,
    (error as { stdout?: unknown }).stdout,
    error.message
  ]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map((value) => normalizeStatusText(value))
    .filter(Boolean);

  for (const candidate of detailCandidates) {
    const lines = candidate
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => !line.startsWith('Command failed:'));

    const usefulLine = lines.find((line) => !line.startsWith('Error:'));
    if (usefulLine) {
      return usefulLine;
    }
  }

  return error.message;
}

function classifyGeminiError(error: unknown) {
  const message = extractGeminiErrorMessage(error);
  const lower = message.toLowerCase();

  if (/login|sign in|authenticate|oauth|credentials|api key|google account/i.test(lower)) {
    return new GeminiClientError(
      'auth',
      message,
      'Your Gemini CLI session needs reconnecting. Launch Gemini and finish authentication first.'
    );
  }

  if (/rate.?limit|quota|too many requests|429|resource exhausted/i.test(lower)) {
    return new GeminiClientError(
      'rate_limit',
      message,
      'Gemini CLI is rate limited right now. Give it a moment and try again.'
    );
  }

  if (/timeout|timed out|econnrefused|econnreset|enotfound|network|socket/i.test(lower)) {
    return new GeminiClientError(
      'service',
      message,
      'Gemini CLI is not responding right now. Check your connection and try again.'
    );
  }

  return new GeminiClientError(
    'unknown',
    message,
    'Something went wrong with Gemini CLI. Try again or check the logs.'
  );
}

async function getExecutionOverrides(context?: {
  surface?: 'voice' | 'text';
  intent?: 'discussion' | 'write';
}) {
  return (
    geminiSettingsService?.getExecutionOverrides(context) ??
    Promise.resolve({ model: null, voiceModelMode: 'auto' as const })
  );
}

function resolveAssistantCwd(workspace: WorkspaceState) {
  return workspace.projectRoot ?? getPortableAssistantCwd();
}

function buildReadOnlyPrompt(userText: string, history: ChatMessage[], workspace: WorkspaceState) {
  const conversation = formatConversationHistory(history);
  return [
    'You are Oplyr, a local-first AI coding operator.',
    'You are currently in discussion mode.',
    'Answer the user clearly and helpfully.',
    'Do not modify files.',
    workspace.projectRoot
      ? `Current workspace: ${workspace.projectRoot}`
      : 'No workspace is selected yet. Stay in general assistant mode.',
    conversation ? `Conversation so far:\n${conversation}\n` : '',
    `User request:\n${userText}`
  ]
    .filter(Boolean)
    .join('\n\n');
}

function buildWriteDecisionPrompt(
  userText: string,
  history: ChatMessage[],
  workspace: WorkspaceState
) {
  const conversation = formatConversationHistory(history);
  return [
    'You are Oplyr, a local-first AI coding operator.',
    'Decide whether the user request is a normal reply or a write proposal.',
    'Return JSON only with keys: intent, assistant_text, proposal_title, proposal_summary, tasks, agents.',
    'intent must be either "reply" or "propose_write".',
    'tasks must be an array of short concrete steps.',
    'agents must be an array of areas such as frontend, backend, infra, tests, docs.',
    workspace.projectRoot
      ? `Current workspace: ${workspace.projectRoot}`
      : 'No workspace is selected yet. If no workspace is selected, prefer reply.',
    conversation ? `Conversation so far:\n${conversation}\n` : '',
    `User request:\n${userText}`
  ]
    .filter(Boolean)
    .join('\n\n');
}

function buildWriteExecutionPrompt(
  approval: PendingApproval,
  history: ChatMessage[],
  workspace: WorkspaceState
) {
  const conversation = formatConversationHistory(history);
  return [
    'You are Oplyr, a local-first AI coding operator.',
    'The user approved this coding task.',
    'Make the requested code changes now.',
    workspace.secretPolicy.length > 0
      ? `Do not read or modify secret-like files. Blocked patterns: ${workspace.secretPolicy.join(', ')}.`
      : '',
    'After making changes, respond with a concise summary of what changed, any tests run, and any follow-up risk.',
    conversation ? `Conversation so far:\n${conversation}\n` : '',
    `Approved task title:\n${approval.title}`,
    `Approved task summary:\n${approval.summary}`,
    `Concrete tasks:\n${approval.tasks.map((task, index) => `${index + 1}. ${task}`).join('\n')}`,
    `Original user request:\n${approval.userRequest}`
  ]
    .filter(Boolean)
    .join('\n\n');
}

function formatConversationHistory(history: ChatMessage[]) {
  return history
    .slice(-20)
    .map((message) => `${message.role.toUpperCase()}: ${message.text}`)
    .join('\n');
}

function tryParseJson(raw: string) {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function extractJsonBlock(raw: string) {
  const trimmed = raw.trim();
  const direct = tryParseJson(trimmed);
  if (direct) {
    return direct;
  }

  const objectMatch = trimmed.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    const parsed = tryParseJson(objectMatch[0]);
    if (parsed) {
      return parsed;
    }
  }

  throw new Error('Gemini CLI did not return structured JSON output.');
}

function extractTextFromUnknown(value: unknown): string {
  if (!value) {
    return '';
  }

  if (typeof value === 'string') {
    return value.trim();
  }

  if (Array.isArray(value)) {
    return value
      .map((entry) => extractTextFromUnknown(entry))
      .filter(Boolean)
      .join('\n')
      .trim();
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const directCandidates = [
      record.response,
      record.text,
      record.result,
      record.output,
      record.message
    ];

    for (const candidate of directCandidates) {
      const text = extractTextFromUnknown(candidate);
      if (text) {
        return text;
      }
    }

    const nestedCandidates = [record.content, record.parts, record.candidates, record.data];
    for (const candidate of nestedCandidates) {
      const text = extractTextFromUnknown(candidate);
      if (text) {
        return text;
      }
    }
  }

  return '';
}

function describeGeminiActivity(event: Record<string, unknown>) {
  const type = typeof event.type === 'string' ? event.type : '';
  const name =
    typeof event.tool_name === 'string'
      ? event.tool_name
      : typeof event.name === 'string'
        ? event.name
        : '';

  if (/tool/i.test(type) || name) {
    return name ? `Using ${name}` : 'Using a tool';
  }

  if (/thought|thinking|reason/i.test(type)) {
    return 'Thinking through the request';
  }

  if (/message|content|delta/i.test(type)) {
    return 'Drafting the response';
  }

  return null;
}

async function assertGeminiReady() {
  const status = await getGeminiStatus();
  if (!status.installed) {
    throw new GeminiClientError(
      'service',
      'Gemini CLI is not installed on this machine.',
      'Gemini CLI is not installed on this machine. Install it first to continue.'
    );
  }

  if (!status.loggedIn) {
    throw new GeminiClientError(
      'auth',
      'Gemini CLI is not authenticated.',
      'Your Gemini CLI session needs reconnecting. Launch Gemini and finish authentication first.'
    );
  }
}

export async function getGeminiStatus() {
  try {
    await execGeminiCommand(['--version'], process.cwd());

    const authMode = detectGeminiAuthMode();
    const loggedIn = Boolean(authMode);

    return {
      installed: true,
      loggedIn,
      accountLabel: describeGeminiAccountLabel(authMode),
      authMode,
      statusText: loggedIn
        ? `Gemini CLI is configured via ${(authMode ?? 'configured').replace(/_/g, ' ')}.`
        : 'Gemini CLI is installed but not authenticated yet.'
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unable to determine Gemini CLI login status.';

    return {
      installed: !/ENOENT/.test(message),
      loggedIn: false,
      accountLabel: null,
      authMode: null,
      statusText: message
    };
  }
}

export async function generateGeminiReply(
  userText: string,
  history: ChatMessage[],
  workspace: WorkspaceState,
  options?: { voiceTurnId?: string }
) {
  await assertGeminiReady();
  const cwd = resolveAssistantCwd(workspace);
  const startedAt = Date.now();
  const text = await runGeminiPrompt({
    cwd,
    prompt: buildReadOnlyPrompt(userText, history, workspace),
    approvalMode: 'plan',
    executionContext: {
      surface: options?.voiceTurnId ? 'voice' : 'text',
      intent: 'discussion'
    }
  });

  logger.info('gemini.prompt.completed', {
    operation: 'generate_reply',
    durationMs: Date.now() - startedAt,
    projectName: path.basename(cwd),
    promptLength: userText.length,
    responseLength: text.length
  });

  return { text };
}

export async function streamGeminiReply(
  userText: string,
  history: ChatMessage[],
  workspace: WorkspaceState,
  options?: StreamReplyOptions
) {
  await assertGeminiReady();
  const cwd = resolveAssistantCwd(workspace);
  const startedAt = Date.now();
  const text = await runGeminiPromptStream({
    cwd,
    prompt: buildReadOnlyPrompt(userText, history, workspace),
    approvalMode: 'plan',
    signal: options?.signal,
    onTextSnapshot: options?.onTextSnapshot,
    onActivityUpdate: options?.onActivityUpdate,
    executionContext: {
      surface: options?.voiceTurnId ? 'voice' : 'text',
      intent: 'discussion'
    }
  });

  logger.info('gemini.prompt.completed', {
    operation: 'stream_reply',
    durationMs: Date.now() - startedAt,
    projectName: path.basename(cwd),
    promptLength: userText.length,
    responseLength: text.length
  });

  return { text };
}

export async function decideGeminiWriteIntent(
  userText: string,
  history: ChatMessage[],
  workspace: WorkspaceState,
  options?: { voiceTurnId?: string }
) {
  await assertGeminiReady();
  const cwd = workspace.projectRoot ?? getPortableAssistantCwd();
  const startedAt = Date.now();
  const raw = await runGeminiPrompt({
    cwd,
    prompt: buildWriteDecisionPrompt(userText, history, workspace),
    approvalMode: 'plan',
    executionContext: {
      surface: options?.voiceTurnId ? 'voice' : 'text',
      intent: 'write'
    }
  });
  const parsed = extractJsonBlock(raw) as Record<string, unknown>;

  logger.info('gemini.prompt.completed', {
    operation: 'decide_write_intent',
    durationMs: Date.now() - startedAt,
    projectName: path.basename(cwd),
    promptLength: userText.length,
    responseLength: raw.length
  });

  return {
    intent: parsed.intent === 'propose_write' ? ('propose_write' as const) : ('reply' as const),
    assistant_text: typeof parsed.assistant_text === 'string' ? parsed.assistant_text : '',
    proposal_title: typeof parsed.proposal_title === 'string' ? parsed.proposal_title : '',
    proposal_summary: typeof parsed.proposal_summary === 'string' ? parsed.proposal_summary : '',
    tasks: Array.isArray(parsed.tasks)
      ? parsed.tasks.filter((value): value is string => typeof value === 'string')
      : [],
    agents: Array.isArray(parsed.agents)
      ? parsed.agents.filter((value): value is string => typeof value === 'string')
      : []
  };
}

export async function executeGeminiApprovedWrite(
  approval: PendingApproval,
  history: ChatMessage[],
  workspace: WorkspaceState,
  options?: { voiceTurnId?: string }
) {
  await assertGeminiReady();
  const startedAt = Date.now();
  const text = await runGeminiPrompt({
    cwd: approval.projectRoot,
    prompt: buildWriteExecutionPrompt(approval, history, workspace),
    approvalMode: 'yolo',
    executionContext: {
      surface: options?.voiceTurnId ? 'voice' : 'text',
      intent: 'write'
    }
  });

  logger.info('gemini.prompt.completed', {
    operation: 'execute_approved_write',
    durationMs: Date.now() - startedAt,
    projectName: path.basename(approval.projectRoot),
    taskCount: approval.tasks?.length ?? 0,
    responseLength: text.length
  });

  return { text };
}

async function runGeminiPrompt(options: {
  cwd: string;
  prompt: string;
  approvalMode: 'plan' | 'yolo';
  executionContext?: { surface: 'voice' | 'text'; intent: 'discussion' | 'write' };
}) {
  try {
    const executionSettings = await getExecutionOverrides(options.executionContext);
    const args = [
      '-p',
      options.prompt,
      '--output-format',
      'json',
      '--approval-mode',
      options.approvalMode
    ];

    if (executionSettings?.model) {
      args.push('--model', executionSettings.model);
    }

    const { stdout } = await execGeminiCommand(args, options.cwd);
    const trimmed = stdout.trim();
    if (!trimmed) {
      throw new Error('Gemini CLI returned an empty response.');
    }

    const parsed = tryParseJson(trimmed);
    if (parsed && typeof parsed === 'object' && parsed !== null) {
      const record = parsed as Record<string, unknown>;
      if (typeof record.error === 'string' && record.error.trim()) {
        throw new Error(record.error);
      }
    }

    const text = extractTextFromUnknown(parsed ?? trimmed);
    if (!text) {
      throw new Error('Gemini CLI did not return usable text.');
    }

    return text;
  } catch (error) {
    throw classifyGeminiError(error);
  }
}

async function runGeminiPromptStream(options: {
  cwd: string;
  prompt: string;
  approvalMode: 'plan' | 'yolo';
  signal?: AbortSignal;
  onTextSnapshot?: (text: string) => void;
  onActivityUpdate?: (activity: string) => void;
  executionContext?: { surface: 'voice' | 'text'; intent: 'discussion' | 'write' };
}) {
  return new Promise<string>((resolve, reject) => {
    let stdoutBuffer = '';
    let stderrBuffer = '';
    let settled = false;
    let latestText = '';
    let finalText = '';
    let abortListener: (() => void) | null = null;
    let child: ReturnType<typeof spawn> | null = null;

    const cleanup = () => {
      if (abortListener && options.signal) {
        options.signal.removeEventListener('abort', abortListener);
      }
      child?.stdout?.removeAllListeners();
      child?.stderr?.removeAllListeners();
      child?.removeAllListeners();
    };

    const rejectOnce = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error instanceof Error ? error : new Error(String(error)));
    };

    const resolveOnce = (value: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };

    const mergeSnapshot = (nextText: string) => {
      const trimmed = nextText.trim();
      if (!trimmed) {
        return;
      }

      if (trimmed.startsWith(latestText)) {
        latestText = trimmed;
      } else if (!latestText.includes(trimmed)) {
        latestText = `${latestText}${latestText ? '\n' : ''}${trimmed}`.trim();
      }

      options.onTextSnapshot?.(latestText);
    };

    const handleLine = (line: string) => {
      const payload = tryParseJson(line);
      if (!payload || typeof payload !== 'object') {
        return;
      }

      const event = payload as Record<string, unknown>;
      if (typeof event.error === 'string' && event.error.trim()) {
        rejectOnce(classifyGeminiError(new Error(event.error)));
        child?.kill('SIGTERM');
        return;
      }

      const activity = describeGeminiActivity(event);
      if (activity) {
        options.onActivityUpdate?.(activity);
      }

      const text = extractTextFromUnknown(event);
      if (text) {
        mergeSnapshot(text);
      }

      const type = typeof event.type === 'string' ? event.type : '';
      if (/result|complete|final/i.test(type)) {
        finalText = extractTextFromUnknown(event) || latestText;
      }
    };

    const attachChild = (nextChild: ReturnType<typeof spawn>) => {
      child = nextChild;
      child.stdout?.setEncoding('utf8');
      child.stdout?.on('data', (chunk: string) => {
        stdoutBuffer += chunk;
        while (true) {
          const newlineIndex = stdoutBuffer.indexOf('\n');
          if (newlineIndex < 0) break;
          const line = stdoutBuffer.slice(0, newlineIndex).trim();
          stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
          if (line) {
            handleLine(line);
          }
        }
      });

      child.stderr?.setEncoding('utf8');
      child.stderr?.on('data', (chunk: string) => {
        stderrBuffer += chunk;
      });

      child.once('error', (error) => rejectOnce(classifyGeminiError(error)));
      child.once('exit', (code, signal) => {
        if (settled) return;
        if (options.signal?.aborted) {
          rejectOnce(new Error('Gemini stream aborted.'));
          return;
        }

        const trailingLine = stdoutBuffer.trim();
        if (trailingLine) {
          handleLine(trailingLine);
        }

        if (settled) {
          return;
        }

        if (code === 0) {
          const text = (finalText || latestText).trim();
          if (text) {
            resolveOnce(text);
            return;
          }
        }

        rejectOnce(
          classifyGeminiError(
            new Error(
              stderrBuffer.trim() ||
                `Gemini CLI exited before completing the reply (${code ?? signal ?? 'unknown'}).`
            )
          )
        );
      });

      if (options.signal) {
        abortListener = () => {
          try {
            child?.kill('SIGTERM');
          } catch {
            // Ignore cleanup failures while aborting the stream.
          }
          rejectOnce(new Error('Gemini stream aborted.'));
        };
        if (options.signal.aborted) {
          abortListener();
          return;
        }
        options.signal.addEventListener('abort', abortListener, { once: true });
      }
    };

    void getExecutionOverrides(options.executionContext)
      .then((executionSettings) => {
        const args = [
          '-p',
          options.prompt,
          '--output-format',
          'stream-json',
          '--approval-mode',
          options.approvalMode
        ];

        if (executionSettings?.model) {
          args.push('--model', executionSettings.model);
        }

        attachChild(
          spawn(getGeminiCommand(), args, {
            cwd: options.cwd,
            env: process.env,
            stdio: ['ignore', 'pipe', 'pipe']
          })
        );
      })
      .catch((error) => rejectOnce(classifyGeminiError(error)));
  });
}

function detectGeminiAuthMode() {
  if (process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim()) {
    return 'api_key';
  }

  if (
    process.env.GOOGLE_GENAI_USE_VERTEXAI?.trim() ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim() ||
    process.env.GOOGLE_CLOUD_PROJECT?.trim()
  ) {
    return 'vertex_ai';
  }

  const oauthPath = path.join(os.homedir(), '.gemini', 'oauth_creds.json');
  const settingsPath = path.join(os.homedir(), '.gemini', 'settings.json');
  if (fs.existsSync(oauthPath) || fs.existsSync(settingsPath)) {
    return 'google_account';
  }

  return null;
}

function describeGeminiAccountLabel(authMode: string | null) {
  if (authMode === 'api_key') {
    return 'API key configured';
  }

  if (authMode === 'vertex_ai') {
    return process.env.GOOGLE_CLOUD_PROJECT?.trim() || 'Vertex AI configured';
  }

  if (authMode === 'google_account') {
    return 'Google account session detected';
  }

  return null;
}
