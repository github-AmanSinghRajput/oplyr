import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { getPortableAssistantCwd } from '../../runtime-paths.js';
import type {
  AssistantProviderId,
  ProviderUsageSnapshot,
  ProviderUsageMeter,
  ProviderUsageDetail,
  WorkspaceState
} from '../../types.js';
import { logger } from '../../lib/logger.js';

type ParsedUsageSnapshot = Omit<ProviderUsageSnapshot, 'capturedAt'>;

interface SlashCaptureConfig {
  providerId: AssistantProviderId;
  providerName: string;
  command: string;
  binary: string;
  cwd: string;
  readyPatterns: RegExp[];
  answerTrustPrompt?: boolean;
}

const codexFieldLabels = [
  'Model',
  'Directory',
  'Permissions',
  'Agents.md',
  'Account',
  'Collaboration mode',
  'Session',
  'Context window',
  '5h limit',
  'Weekly limit'
];

export class ProviderUsageService {
  async getUsage(providerId: AssistantProviderId, workspace: WorkspaceState) {
    const cwd = workspace.projectRoot ?? getPortableAssistantCwd();
    const capturedAt = new Date().toISOString();

    try {
      if (providerId === 'codex') {
        const raw = await captureSlashCommand({
          providerId,
          providerName: 'OpenAI Codex',
          command: '/status',
          binary: process.env.CODEX_COMMAND ?? 'codex',
          cwd,
          readyPatterns: [/OpenAI Codex/i, /\/status\b/i, /gpt-[0-9.]+\b/i],
          answerTrustPrompt: true
        });
        return {
          ...parseCodexUsage(raw),
          capturedAt
        } satisfies ProviderUsageSnapshot;
      }

      if (providerId === 'claude') {
        const usageRaw = await captureSlashCommand({
          providerId,
          providerName: 'Anthropic Claude Code',
          command: '/usage',
          binary: process.env.CLAUDE_COMMAND ?? 'claude',
          cwd,
          readyPatterns: [/Claude/i, /\/help\b/i, /\/usage\b/i]
        });
        return {
          ...parseClaudeUsage(usageRaw),
          capturedAt
        } satisfies ProviderUsageSnapshot;
      }

      const raw = await captureSlashCommand({
        providerId,
        providerName: 'Google Gemini CLI',
        command: '/stats',
        binary: process.env.GEMINI_COMMAND ?? 'gemini',
        cwd,
        readyPatterns: [/Gemini/i, /\/stats\b/i, /\/help\b/i]
      });
      return {
        ...parseGeminiUsage(raw),
        capturedAt
      } satisfies ProviderUsageSnapshot;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('provider.usage.capture.failed', {
        providerId,
        cwd,
        error: message
      });
      return unavailableUsage(providerId, capturedAt, message);
    }
  }
}

async function captureSlashCommand(config: SlashCaptureConfig) {
  if (process.platform !== 'darwin') {
    throw new Error('Interactive provider usage capture is currently supported only on macOS.');
  }

  const captureFile = path.join(
    os.tmpdir(),
    `oplyr-${config.providerId}-usage-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`
  );
  const startedAt = Date.now();

  logger.info('provider.usage.capture.started', {
    providerId: config.providerId,
    command: config.command,
    cwd: config.cwd
  });

  return new Promise<string>((resolve, reject) => {
    const child = spawn('script', ['-q', captureFile, config.binary], {
      cwd: config.cwd,
      env: {
        ...process.env,
        TERM: process.env.TERM ?? 'xterm-256color'
      },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let combinedOutput = '';
    let answeredTrustPrompt = false;
    let sentCommand = false;
    let finalized = false;
    let fallbackTimer: NodeJS.Timeout | null = null;
    let finishTimer: NodeJS.Timeout | null = null;
    let hardTimeout: NodeJS.Timeout | null = null;

    const cleanupTimers = () => {
      if (fallbackTimer) clearTimeout(fallbackTimer);
      if (finishTimer) clearTimeout(finishTimer);
      if (hardTimeout) clearTimeout(hardTimeout);
      fallbackTimer = null;
      finishTimer = null;
      hardTimeout = null;
    };

    const readCaptureAndResolve = async () => {
      try {
        const fileText = await fs.readFile(captureFile, 'utf8');
        const cleaned = cleanTerminalTranscript(fileText);
        logger.info('provider.usage.capture.completed', {
          providerId: config.providerId,
          command: config.command,
          durationMs: Date.now() - startedAt,
          transcriptLength: cleaned.length
        });
        resolve(cleaned);
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      } finally {
        cleanupTimers();
        await fs.rm(captureFile, { force: true }).catch(() => undefined);
      }
    };

    const rejectWithError = async (error: unknown) => {
      cleanupTimers();
      await fs.rm(captureFile, { force: true }).catch(() => undefined);
      reject(error instanceof Error ? error : new Error(String(error)));
    };

    const finalizeCapture = () => {
      if (finalized) {
        return;
      }
      finalized = true;
      try {
        child.stdin.write('\u001b');
      } catch {
        // ignore
      }
      setTimeout(() => {
        try {
          child.stdin.write('\u0003');
        } catch {
          // ignore
        }
        setTimeout(() => {
          if (!child.killed) {
            child.kill('SIGTERM');
          }
        }, 250);
      }, 200);
    };

    const sendSlashCommand = () => {
      if (sentCommand) {
        return;
      }
      if (config.answerTrustPrompt && !answeredTrustPrompt) {
        return;
      }
      sentCommand = true;
      child.stdin.write(`${config.command}\n`);
      finishTimer = setTimeout(() => {
        finalizeCapture();
      }, 1800);
    };

    const maybeHandleTrustPrompt = () => {
      if (!config.answerTrustPrompt || answeredTrustPrompt) {
        return;
      }
      if (/Do you trust the contents of this directory\?/i.test(combinedOutput)) {
        answeredTrustPrompt = true;
        child.stdin.write('\u001b[A\n');
      }
    };

    const maybeHandleReadyState = () => {
      if (sentCommand) {
        return;
      }
      const isReady = config.readyPatterns.some((pattern) => pattern.test(combinedOutput));
      if (isReady) {
        sendSlashCommand();
      }
    };

    const onChunk = (chunk: Buffer | string) => {
      combinedOutput += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      maybeHandleTrustPrompt();
      maybeHandleReadyState();
    };

    child.stdout.on('data', onChunk);
    child.stderr.on('data', onChunk);

    child.on('error', (error) => {
      logger.error('provider.usage.capture.process_failed', {
        providerId: config.providerId,
        command: config.command,
        durationMs: Date.now() - startedAt,
        error: error.message
      });
      void rejectWithError(error);
    });

    child.on('close', () => {
      void readCaptureAndResolve();
    });

    fallbackTimer = setTimeout(
      () => {
        sendSlashCommand();
      },
      config.providerId === 'codex' ? 2500 : 1500
    );

    hardTimeout = setTimeout(() => {
      finalizeCapture();
    }, 9000);
  });
}

function cleanTerminalTranscript(raw: string) {
  // ANSI escape sequences (OSC, CSI, and single-char) intentionally match control chars.
  /* eslint-disable no-control-regex */
  return raw
    .replace(/\r/g, '\n')
    .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\x1b[@-_]/g, '')
    .replace(/[┌┐└┘├┤┬┴┼│─╭╮╰╯•◦]/g, ' ')
    .replace(/[^\S\n]+/g, ' ')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n');
  /* eslint-enable no-control-regex */
}

function extractLabeledValue(compact: string, label: string, nextLabels: string[]) {
  const nextPattern = nextLabels.length
    ? `(?=\\s+(?:${nextLabels.map(escapeRegex).join('|')}):|$)`
    : '$';
  const regex = new RegExp(`${escapeRegex(label)}:\\s*(.+?)${nextPattern}`, 'i');
  const match = compact.match(regex);
  return match?.[1]?.trim() ?? null;
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parsePercentPair(label: string, compact: string) {
  const regex = new RegExp(`${escapeRegex(label)}:\\s*(\\d+)%\\s+left\\s*\\(([^)]+)\\)`, 'i');
  const match = compact.match(regex);
  if (!match) {
    return null;
  }

  const percentLeft = Number(match[1]);
  return {
    percentLeft,
    percentUsed: 100 - percentLeft,
    detail: match[2]?.trim() ?? null
  };
}

function createMeter(
  id: string,
  label: string,
  percentUsed: number | null,
  percentLeft: number | null,
  detail: string | null,
  resetAt: string | null
): ProviderUsageMeter {
  return {
    id,
    label,
    percentUsed,
    percentLeft,
    detail,
    resetAt
  };
}

function parseCodexUsage(raw: string): ParsedUsageSnapshot {
  const compact = raw.replace(/\s+/g, ' ').trim();
  const details: ProviderUsageDetail[] = [];
  const model = extractLabeledValue(compact, 'Model', codexFieldLabels.slice(1));
  const directory = extractLabeledValue(compact, 'Directory', codexFieldLabels.slice(2));
  const permissions = extractLabeledValue(compact, 'Permissions', codexFieldLabels.slice(3));
  const agentsMd = extractLabeledValue(compact, 'Agents.md', codexFieldLabels.slice(4));
  const account = extractLabeledValue(compact, 'Account', codexFieldLabels.slice(5));
  const collaborationMode = extractLabeledValue(
    compact,
    'Collaboration mode',
    codexFieldLabels.slice(6)
  );
  const sessionId = extractLabeledValue(compact, 'Session', codexFieldLabels.slice(7));
  const contextWindow = parsePercentPair('Context window', compact);
  const fiveHour = parsePercentPair('5h limit', compact);
  const weekly = parsePercentPair('Weekly limit', compact);

  if (directory) details.push({ label: 'Directory', value: directory });
  if (permissions) details.push({ label: 'Permissions', value: permissions });
  if (agentsMd) details.push({ label: 'AGENTS.md', value: agentsMd });
  if (collaborationMode) details.push({ label: 'Collaboration mode', value: collaborationMode });

  return {
    providerId: 'codex',
    providerName: 'OpenAI Codex',
    command: '/status',
    available: Boolean(model || account || contextWindow || fiveHour || weekly),
    error: null,
    model,
    accountLabel: account,
    sessionId,
    contextWindow: contextWindow
      ? {
          percentLeft: contextWindow.percentLeft,
          percentUsed: contextWindow.percentUsed,
          detail: contextWindow.detail ?? ''
        }
      : null,
    meters: [
      createMeter(
        'five-hour',
        '5h limit',
        fiveHour?.percentUsed ?? null,
        fiveHour?.percentLeft ?? null,
        fiveHour?.detail ?? null,
        extractResetText(fiveHour?.detail ?? null)
      ),
      createMeter(
        'weekly',
        'Weekly limit',
        weekly?.percentUsed ?? null,
        weekly?.percentLeft ?? null,
        weekly?.detail ?? null,
        extractResetText(weekly?.detail ?? null)
      )
    ].filter((meter) => meter.percentUsed !== null || meter.detail !== null),
    details
  };
}

function parseClaudeUsage(raw: string): ParsedUsageSnapshot {
  const compact = raw.replace(/\s+/g, ' ').trim();
  const currentSession = extractUsageBlock(compact, 'Current session', [
    'Current week',
    'Extra usage'
  ]);
  const currentWeek = extractUsageBlock(compact, 'Current week \\(all models\\)', ['Extra usage']);
  const extraUsage = extractUsageBlock(compact, 'Extra usage', []);

  return {
    providerId: 'claude',
    providerName: 'Anthropic Claude Code',
    command: '/usage',
    available: Boolean(currentSession || currentWeek || extraUsage),
    error: null,
    model: null,
    accountLabel: null,
    sessionId: null,
    contextWindow: null,
    meters: [
      currentSession
        ? createMeter(
            'current-session',
            'Current session',
            currentSession.percentUsed,
            100 - currentSession.percentUsed,
            currentSession.detail,
            currentSession.resetAt
          )
        : null,
      currentWeek
        ? createMeter(
            'current-week',
            'Current week',
            currentWeek.percentUsed,
            100 - currentWeek.percentUsed,
            currentWeek.detail,
            currentWeek.resetAt
          )
        : null,
      extraUsage
        ? createMeter(
            'extra-usage',
            'Extra usage',
            extraUsage.percentUsed,
            100 - extraUsage.percentUsed,
            extraUsage.detail,
            extraUsage.resetAt
          )
        : null
    ].filter((meter): meter is ProviderUsageMeter => Boolean(meter)),
    details: []
  };
}

function extractUsageBlock(compact: string, labelPattern: string, nextLabels: string[]) {
  const nextPattern = nextLabels.length ? `(?=\\s+(?:${nextLabels.join('|')})|$)` : '$';
  const regex = new RegExp(`${labelPattern}\\s+(\\d+)%\\s+used\\s+(.+?)${nextPattern}`, 'i');
  const match = compact.match(regex);
  if (!match) {
    return null;
  }

  const percentUsed = Number(match[1]);
  const trailing = match[2].trim();
  const resetMatch = trailing.match(/Resets\s+(.+)$/i);
  const detail = resetMatch
    ? trailing
        .slice(0, resetMatch.index)
        .trim()
        .replace(/[·•-]\s*$/, '')
        .trim()
    : null;
  const resetAt = resetMatch?.[1]?.trim() ?? null;

  return {
    percentUsed,
    detail: detail || null,
    resetAt
  };
}

function parseGeminiUsage(raw: string): ParsedUsageSnapshot {
  const compact = raw.replace(/\s+/g, ' ').trim();
  const details: ProviderUsageDetail[] = [];
  const modelMatch = compact.match(
    /Model(?: info)?:\s*(.+?)(?=\s+(?:Tokens?(?: used)?|[A-Z][A-Za-z]+):|\s+[A-Z][a-z][A-Za-z ]+\s+\d+%\s+(?:used|left)|$)/i
  );
  const tokenMatch = compact.match(/Tokens?(?: used)?:\s*(.+?)(?=\s+[A-Z][A-Za-z]+:|$)/i);
  const genericPercentMatches = Array.from(
    compact.matchAll(/([A-Za-z][A-Za-z0-9 ()/-]+?)\s+(\d+)%\s+(used|left)/g)
  );

  if (tokenMatch?.[1]) {
    details.push({ label: 'Tokens', value: tokenMatch[1].trim() });
  }

  return {
    providerId: 'gemini',
    providerName: 'Google Gemini CLI',
    command: '/stats',
    available: Boolean(modelMatch?.[1] || tokenMatch?.[1] || genericPercentMatches.length),
    error: null,
    model: modelMatch?.[1]?.trim() ?? null,
    accountLabel: null,
    sessionId: null,
    contextWindow: null,
    meters: genericPercentMatches.map((match, index) => {
      const label = match[1].trim();
      const value = Number(match[2]);
      const mode = match[3].toLowerCase();
      return createMeter(
        `gemini-${index}`,
        label,
        mode === 'used' ? value : 100 - value,
        mode === 'left' ? value : 100 - value,
        null,
        null
      );
    }),
    details
  };
}

function extractResetText(detail: string | null) {
  if (!detail) {
    return null;
  }
  const match = detail.match(/resets?\s+(.+)$/i);
  return match?.[1]?.trim() ?? null;
}

function unavailableUsage(
  providerId: AssistantProviderId,
  capturedAt: string,
  error: string
): ProviderUsageSnapshot {
  return {
    providerId,
    providerName:
      providerId === 'claude'
        ? 'Anthropic Claude Code'
        : providerId === 'gemini'
          ? 'Google Gemini CLI'
          : 'OpenAI Codex',
    command: providerId === 'claude' ? '/usage' : providerId === 'gemini' ? '/stats' : '/status',
    capturedAt,
    available: false,
    error,
    model: null,
    accountLabel: null,
    sessionId: null,
    contextWindow: null,
    meters: [],
    details: []
  };
}

export const providerUsageParsers = {
  parseCodexUsage,
  parseClaudeUsage,
  parseGeminiUsage
};
