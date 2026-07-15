import os from 'node:os';
import { spawn } from 'node:child_process';
import { agentSpawnEnv } from '../../lib/spawn-env.js';
import { refreshCodexModelsCache, refreshClaudeCatalog } from './provider-cli-source.service.js';
import type { AssistantProviderId } from '../../types.js';

export interface RefreshModelsResult {
  providerId: AssistantProviderId;
  refreshed: boolean;
  detail: string;
}

export interface UpdateCliResult {
  providerId: AssistantProviderId;
  ok: boolean;
  message: string;
}

function binaryFor(providerId: AssistantProviderId): string | null {
  if (providerId === 'codex') return process.env.CODEX_COMMAND ?? 'codex';
  if (providerId === 'claude') return process.env.CLAUDE_COMMAND ?? 'claude';
  if (providerId === 'gemini') return process.env.GEMINI_COMMAND ?? 'gemini';
  return null;
}

/**
 * Live model/CLI operations driven entirely by the user's own authed CLIs — no static/hardcoded
 * lists (see provider-cli-source.service):
 *  - Codex: a short CLI run makes it re-fetch its account models and rewrite
 *    `~/.codex/models_cache.json`; the codex settings service then reads that fresh JSON.
 *  - Claude: scrape `claude --ax-screen-reader /model` for the live model list + efforts.
 *  - Gemini: aliases track the latest model at runtime; refresh is a reported no-op for now.
 */
export class ProviderModelsService {
  /** Re-fetch the active provider's model list live from its CLI. */
  async refreshModels(providerId: AssistantProviderId): Promise<RefreshModelsResult> {
    if (providerId === 'codex') {
      const refreshed = await refreshCodexModelsCache();
      return {
        providerId,
        refreshed,
        detail: refreshed
          ? 'Fetched the latest models live from Codex.'
          : 'Could not reach Codex — showing the last known models.'
      };
    }

    if (providerId === 'claude') {
      const catalog = await refreshClaudeCatalog();
      return {
        providerId,
        refreshed: Boolean(catalog),
        detail: catalog
          ? 'Fetched the latest models live from Claude Code.'
          : 'Could not reach Claude Code — showing the last known models.'
      };
    }

    return {
      providerId,
      refreshed: true,
      detail: 'Latest models track automatically for this agent — no refresh needed.'
    };
  }

  /** Run the provider CLI's own self-update (`codex update` / `claude update` / `gemini update`). */
  async updateCli(providerId: AssistantProviderId): Promise<UpdateCliResult> {
    const binary = binaryFor(providerId);
    if (!binary) {
      return { providerId, ok: false, message: 'Unknown provider.' };
    }
    return runCliUpdate(providerId, binary);
  }
}

function runCliUpdate(providerId: AssistantProviderId, binary: string): Promise<UpdateCliResult> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: UpdateCliResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    let stdout = '';
    let stderr = '';
    const child = spawn(binary, ['update'], {
      cwd: os.homedir(),
      env: agentSpawnEnv(),
      // No stdin: a self-update that blocks on a prompt should time out, not hang forever.
      stdio: ['ignore', 'pipe', 'pipe']
    });

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    const timer = setTimeout(() => {
      if (!child.killed) child.kill('SIGTERM');
      finish({
        providerId,
        ok: false,
        message: 'Update timed out. Try updating the CLI manually.'
      });
    }, 90_000);
    timer.unref?.();

    child.on('error', (error) => {
      clearTimeout(timer);
      finish({ providerId, ok: false, message: error.message });
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      // Last few non-empty lines make the most useful, compact status.
      const tail = (stdout || stderr)
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(-3)
        .join(' ')
        .slice(0, 300);
      finish({
        providerId,
        ok: code === 0,
        message: tail || (code === 0 ? 'CLI is up to date.' : 'Update failed.')
      });
    });
  });
}
