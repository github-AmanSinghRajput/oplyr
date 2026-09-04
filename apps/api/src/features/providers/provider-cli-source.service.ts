import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import * as pty from 'node-pty';
import { agentSpawnEnv } from '../../lib/spawn-env.js';
import { logger } from '../../lib/logger.js';

/**
 * Live model/effort catalogs sourced from the agents' own CLIs — no static lists.
 *
 *  - Codex publishes its account's models to `~/.codex/models_cache.json`; a short CLI run makes it
 *    re-fetch and rewrite that file, so we trigger a run and let the codex settings service read the
 *    fresh JSON (robust — no TUI parsing).
 *  - Claude Code has no machine-readable list, so we scrape its `/model` command. The key is
 *    `--ax-screen-reader`, which renders flat, properly-spaced text (no cursor-positioned TUI), so
 *    the numbered model list + current effort parse cleanly.
 *
 * Both paths spawn the real CLI in a pseudo-terminal (node-pty) because these are interactive TUIs;
 * plain pipes/`script` don't work (no controlling TTY when Electron spawns the API).
 */

const codexModelsCachePath = path.join(os.homedir(), '.codex', 'models_cache.json');

export interface ScrapedModel {
  slug: string;
  displayName: string;
  description: string;
  suggestedForDiscussion: boolean;
}

export interface ScrapedEffort {
  effort: string;
  description: string;
}

export interface ClaudeCatalog {
  models: ScrapedModel[];
  efforts: ScrapedEffort[];
  currentModelSlug: string | null;
  currentEffort: string | null;
  capturedAt: string;
}

/** Neutral, empty, pre-trusted scrape dir so the CLIs don't prompt about a project or boot project MCP. */
function scrapeCwd(): string {
  const dir = path.join(os.tmpdir(), 'oplyr-cli-scrape');
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    /* best effort */
  }
  return dir;
}

/**
 * Codex's "Do you trust the contents of this directory?" prompt renders with cursor positioning, so
 * ANSI-stripping collapses it to space-less text ("Doyoutrustthecontentsofthisdirectory?"). Match on
 * the whitespace-removed transcript so detection is robust to that.
 */
function isCodexTrustPrompt(raw: string): boolean {
  return /trustthecontentsofthisdirectory/i.test(stripAnsi(raw).replace(/\s+/g, ''));
}

function stripAnsi(raw: string): string {
  // ANSI escape sequences (OSC, CSI, single-char) intentionally match control chars.
  /* eslint-disable no-control-regex */
  return raw
    .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\x1b[@-_]/g, '');
  /* eslint-enable no-control-regex */
}

function ptyEnv(): Record<string, string> {
  return {
    ...(agentSpawnEnv() as Record<string, string>),
    TERM: 'xterm-256color',
    COLORTERM: 'truecolor'
  };
}

// ── Codex: trigger a live model re-fetch (rewrites models_cache.json) ──────────────────────────

/**
 * Run Codex briefly so it re-fetches its account's model list and rewrites `models_cache.json`.
 * Resolves true once the cache file's mtime advances (fetch landed) or after a bounded wait.
 * The codex settings service then reads the fresh JSON.
 */
export async function refreshCodexModelsCache(timeoutMs = 15000): Promise<boolean> {
  const binary = process.env.CODEX_COMMAND ?? 'codex';
  const startMtime = safeMtimeMs(codexModelsCachePath);

  return new Promise<boolean>((resolve) => {
    let term: pty.IPty | null = null;
    let done = false;
    const finish = (refreshed: boolean) => {
      if (done) return;
      done = true;
      try {
        term?.kill();
      } catch {
        /* ignore */
      }
      resolve(refreshed);
    };

    try {
      term = pty.spawn(binary, [], {
        name: 'xterm-256color',
        cols: 120,
        rows: 40,
        cwd: scrapeCwd(),
        env: ptyEnv()
      });
    } catch (error) {
      logger.warn('provider.cli.codex.spawn_failed', {
        error: error instanceof Error ? error.message : String(error)
      });
      return finish(false);
    }

    let out = '';
    let trustAnswered = false;
    term.onData((data) => {
      out += data;
      // Accept codex's "trust this directory?" prompt — the default is "1. Yes, continue", so just
      // press Enter (an arrow key would land on "2. No, quit" and make codex exit). Answer once.
      if (!trustAnswered && isCodexTrustPrompt(out)) {
        trustAnswered = true;
        try {
          term?.write('\r');
        } catch {
          /* ignore */
        }
      }
    });

    // Poll the cache mtime; codex fetches shortly after launch. Resolve as soon as it advances.
    const poll = setInterval(() => {
      if (safeMtimeMs(codexModelsCachePath) > startMtime) {
        clearInterval(poll);
        finish(true);
      }
    }, 400);

    const timer = setTimeout(() => {
      clearInterval(poll);
      // Even on timeout, report whether the file changed at all.
      finish(safeMtimeMs(codexModelsCachePath) > startMtime);
    }, timeoutMs);
    timer.unref?.();
  });
}

function safeMtimeMs(filePath: string): number {
  try {
    return fs.statSync(filePath).mtimeMs;
  } catch {
    return 0;
  }
}

// ── Claude: scrape `/model` (flat text via --ax-screen-reader) ─────────────────────────────────

const CLAUDE_MODEL_LINE =
  /^\s*(\d+)\.\s*(?:\((selected)\)\s*)?(.+?)\s+[—-]\s+(.+?)\s*·\s*(.+?)\s*$/;

/**
 * Scrape Claude Code's `/model` list + current effort. Spawns `claude --ax-screen-reader`, sends
 * `/model`, captures the flat-text menu, parses the numbered rows, then cycles the effort slider to
 * enumerate the effort levels. Returns null if the capture fails (caller keeps the last catalog).
 */
export async function scrapeClaudeCatalog(timeoutMs = 16000): Promise<ClaudeCatalog | null> {
  const binary = process.env.CLAUDE_COMMAND ?? 'claude';

  return new Promise<ClaudeCatalog | null>((resolve) => {
    let term: pty.IPty | null = null;
    let done = false;
    let out = '';
    let phase: 'boot' | 'model' | 'efforts' = 'boot';
    let trustAnswered = false;
    const effortLabels: string[] = [];

    const finish = (value: ClaudeCatalog | null) => {
      if (done) return;
      done = true;
      try {
        term?.kill();
      } catch {
        /* ignore */
      }
      resolve(value);
    };

    try {
      term = pty.spawn(binary, ['--ax-screen-reader'], {
        name: 'xterm-256color',
        cols: 160,
        rows: 50,
        cwd: scrapeCwd(),
        env: ptyEnv()
      });
    } catch (error) {
      logger.warn('provider.cli.claude.spawn_failed', {
        error: error instanceof Error ? error.message : String(error)
      });
      return finish(null);
    }

    const write = (data: string) => {
      try {
        term?.write(data);
      } catch {
        /* ignore */
      }
    };

    const openModelMenu = () => {
      if (phase !== 'boot') return;
      phase = 'model';
      setTimeout(() => write('/model\r'), 600);
      // After the menu renders, cycle the effort slider left a few times to enumerate the levels.
      setTimeout(() => {
        phase = 'efforts';
        for (let i = 0; i < 6; i++) {
          setTimeout(() => write('\x1b[D'), i * 180); // Left arrow = lower effort
        }
      }, 2600);
      setTimeout(() => {
        write('\x1b'); // Esc to cancel without changing anything
        finish(parseClaudeCatalog(stripAnsi(out), effortLabels));
      }, 4600);
    };

    term.onData((data) => {
      out += data;
      const clean = stripAnsi(out);
      // Claude's "trust this folder?" gate on a new cwd is a y/n prompt (NOT Enter). Answer once.
      if (
        !trustAnswered &&
        /(Enter y\/n|trust this folder|Do you trust|trust the (files|contents)|I trust this)/i.test(
          clean
        )
      ) {
        trustAnswered = true;
        write('y\r');
        // After trusting, Claude boots to the composer — open the menu once it's had a moment.
        setTimeout(() => openModelMenu(), 2600);
        return;
      }
      if (
        phase === 'boot' &&
        /(Try |shortcuts|\? for shortcuts|Welcome|bypass|manual mode|ready)/i.test(clean)
      ) {
        openModelMenu();
      }
      // Collect each effort-slider label as we cycle it ("◉ xHigh effort", "effort: xhigh").
      const effortMatch = clean.match(/effort:\s*([a-z]+)/i);
      if (effortMatch) {
        const level = effortMatch[1].toLowerCase();
        if (!effortLabels.includes(level)) effortLabels.push(level);
      }
    });

    // Fallback: if we never detected "ready", open the menu anyway.
    setTimeout(() => {
      if (phase === 'boot') openModelMenu();
    }, 8000);

    const timer = setTimeout(
      () => finish(parseClaudeCatalog(stripAnsi(out), effortLabels)),
      timeoutMs
    );
    timer.unref?.();
  });
}

/** Parse the flat `/model` transcript into a catalog. Exported for unit testing. */
export function parseClaudeCatalog(
  transcript: string,
  effortLabels: string[]
): ClaudeCatalog | null {
  const lines = transcript.split('\n').map((line) => line.replace(/\s+/g, ' ').trim());
  const models: ScrapedModel[] = [];
  let currentModelSlug: string | null = null;

  for (const line of lines) {
    const match = line.match(CLAUDE_MODEL_LINE);
    if (!match) continue;
    const [, , selected, rawLabel, version, description] = match;
    const recommended = /\(recommended\)/i.test(rawLabel);
    const label = rawLabel.replace(/\(recommended\)/i, '').trim();
    const slug = claudeSlugForLabel(label);
    if (!slug || models.some((m) => m.slug === slug)) continue;
    models.push({
      slug,
      displayName: /fable/i.test(label) ? version.trim() : label,
      description: `${version.trim()} · ${description.trim()}`,
      suggestedForDiscussion: recommended
    });
    if (selected) currentModelSlug = slug;
  }

  if (models.length === 0) return null;

  // Effort levels captured while cycling the slider, ordered low → high. Fall back to the current
  // level alone if cycling produced nothing.
  const currentEffort = effortLabels.length > 0 ? effortLabels[effortLabels.length - 1] : null;
  const efforts = orderClaudeEfforts(effortLabels).map((effort) => ({
    effort,
    description: describeClaudeEffort(effort)
  }));

  return {
    models,
    efforts,
    currentModelSlug,
    currentEffort,
    capturedAt: new Date().toISOString()
  };
}

/**
 * Map a `/model` menu label to the slug passed to `claude --model`. The CLI resolves the tier names
 * (default/sonnet/opus/haiku/fable) to the latest model of that tier, so the slug is just the lower-
 * cased first word of the label — derived from the live list, not a hardcoded catalog.
 */
function claudeSlugForLabel(label: string): string | null {
  const token = label.trim().split(/\s+/)[0]?.toLowerCase();
  return token && /^[a-z][a-z0-9-]*$/.test(token) ? token : null;
}

const CLAUDE_EFFORT_ORDER = ['low', 'medium', 'high', 'xhigh', 'max', 'ultra'];
function orderClaudeEfforts(labels: string[]): string[] {
  const unique = [...new Set(labels.map((l) => l.toLowerCase()))];
  return unique.sort((a, b) => {
    const ia = CLAUDE_EFFORT_ORDER.indexOf(a);
    const ib = CLAUDE_EFFORT_ORDER.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
}

function describeClaudeEffort(effort: string): string {
  switch (effort) {
    case 'low':
      return 'Fastest — minimal reasoning for quick, simple turns.';
    case 'medium':
      return 'Balanced reasoning for everyday coding.';
    case 'high':
      return 'Deep reasoning for hard problems and tricky refactors.';
    case 'xhigh':
      return 'Extra-deep reasoning for the most complex work.';
    default:
      return `Reasoning effort: ${effort}.`;
  }
}

// ── Claude usage (`/usage`) ────────────────────────────────────────────────────────────────────

export interface ScrapedUsageMeter {
  id: string;
  label: string;
  percentUsed: number;
  percentLeft: number;
  resetAt: string | null;
  detail: string | null;
}

export interface ScrapedUsage {
  meters: ScrapedUsageMeter[];
  capturedAt: string;
}

/**
 * Spawn `claude --ax-screen-reader`, run ONE slash command, and return the flat, ANSI-stripped
 * transcript. Handles the trust prompt (y) and waits for the composer before sending. Generic so it
 * serves both `/usage` and future read-only commands.
 */
async function captureClaudeFlat(command: string, captureMs = 9000): Promise<string | null> {
  const binary = process.env.CLAUDE_COMMAND ?? 'claude';
  return new Promise<string | null>((resolve) => {
    let term: pty.IPty | null = null;
    let done = false;
    let out = '';
    let trustAnswered = false;
    let sent = false;

    const finish = (value: string | null) => {
      if (done) return;
      done = true;
      try {
        term?.kill();
      } catch {
        /* ignore */
      }
      resolve(value);
    };

    try {
      term = pty.spawn(binary, ['--ax-screen-reader'], {
        name: 'xterm-256color',
        cols: 170,
        rows: 60,
        cwd: scrapeCwd(),
        env: ptyEnv()
      });
    } catch (error) {
      logger.warn('provider.cli.claude.spawn_failed', {
        error: error instanceof Error ? error.message : String(error)
      });
      return finish(null);
    }

    const write = (data: string) => {
      try {
        term?.write(data);
      } catch {
        /* ignore */
      }
    };
    const send = () => {
      if (sent) return;
      sent = true;
      setTimeout(() => write(`${command}\r`), 700);
      setTimeout(() => {
        write('\x1b');
        finish(stripAnsi(out));
      }, captureMs);
    };

    term.onData((data) => {
      out += data;
      const clean = stripAnsi(out);
      if (
        !trustAnswered &&
        /(Enter y\/n|trust this folder|Do you trust|I trust this)/i.test(clean)
      ) {
        trustAnswered = true;
        write('y\r');
        setTimeout(send, 2600);
        return;
      }
      if (!sent && /(Try |shortcuts|\? for shortcuts|bypass|manual mode|ready)/i.test(clean)) {
        send();
      }
    });

    setTimeout(() => {
      if (!sent) send();
    }, 8000);
    const timer = setTimeout(() => finish(stripAnsi(out)), 8000 + captureMs + 4000);
    timer.unref?.();
  });
}

export async function scrapeClaudeUsage(): Promise<ScrapedUsage | null> {
  const transcript = await captureClaudeFlat('/usage', 10000);
  return transcript ? parseClaudeUsage(transcript) : null;
}

/**
 * Parse the flat `/usage` transcript. Each limit window renders as:
 *   Current session
 *   49% 49% used
 *   Resets 1:59pm (Asia/Calcutta)
 * We pick out the known windows (session / week / week-Fable) and ignore the "% of your usage"
 * insight lines. Exported for unit testing.
 */
export function parseClaudeUsage(transcript: string): ScrapedUsage | null {
  const lines = transcript.split('\n').map((line) => line.replace(/\s+/g, ' ').trim());
  const meters: ScrapedUsageMeter[] = [];

  for (let i = 0; i < lines.length; i++) {
    const used = lines[i].match(/(\d+)%\s+used\b/i);
    if (!used) continue;
    const percentUsed = Number(used[1]);

    // Nearest preceding descriptive line is the window label.
    let label = '';
    for (let j = i - 1; j >= 0 && j >= i - 3; j--) {
      if (lines[j] && !/%|used|resets/i.test(lines[j])) {
        label = lines[j];
        break;
      }
    }
    const meter = claudeUsageMeterFor(label);
    if (!meter || meters.some((m) => m.id === meter.id)) continue;

    let resetAt: string | null = null;
    for (let j = i + 1; j < lines.length && j <= i + 2; j++) {
      const reset = lines[j].match(/^Resets\s+(.+)$/i);
      if (reset) {
        resetAt = reset[1].trim();
        break;
      }
    }

    meters.push({
      id: meter.id,
      label: meter.label,
      percentUsed,
      percentLeft: Math.max(0, 100 - percentUsed),
      resetAt,
      // Strip TUI cruft that can precede the window name (e.g. an "Esc to cancel" hint renders right
      // before "Current session"): keep only from "Current …" onward.
      detail: label.replace(/^.*?(Current\b)/i, '$1').trim() || null
    });
  }

  return meters.length > 0 ? { meters, capturedAt: new Date().toISOString() } : null;
}

function claudeUsageMeterFor(label: string): { id: string; label: string } | null {
  if (/current session/i.test(label)) return { id: 'session', label: 'Session' };
  if (/current week.*fable/i.test(label)) return { id: 'week-fable', label: 'Week · Fable' };
  if (/current week/i.test(label)) return { id: 'week', label: 'Week' };
  return null;
}

// ── Codex usage (`/status`) ────────────────────────────────────────────────────────────────────
// Codex's TUI CAN be scraped once you (a) wait for its built-in `codex_apps` MCP server to finish
// booting (~9s — sending a slash command before that queues it as chat text), and (b) submit the
// slash command as text-then-Enter, retrying Enter until the panel renders (the slash popup needs
// a select). No `--ax-screen-reader` equivalent, but the /status panel renders cleanly.

const CODEX_BOOT_WAIT_MS = 10000;

export async function scrapeCodexStatus(): Promise<ScrapedUsage | null> {
  const transcript = await captureCodexStatus();
  return transcript ? parseCodexStatus(transcript) : null;
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// Mirror scrape diagnostics to ~/.oplyr/cli-scrape.log so they're easy to read regardless of where
// the API's stdout is wired (dev terminal vs packaged log). `cat ~/.oplyr/cli-scrape.log`.
async function appendScrapeDiag(entry: Record<string, unknown>): Promise<void> {
  try {
    const dir = path.join(os.homedir(), '.oplyr');
    await fsp.mkdir(dir, { recursive: true, mode: 0o700 });
    await fsp.appendFile(
      path.join(dir, 'cli-scrape.log'),
      `${JSON.stringify({ time: new Date().toISOString(), ...entry })}\n`
    );
  } catch {
    /* diagnostics are best-effort */
  }
}

async function captureCodexStatus(): Promise<string | null> {
  const binary = process.env.CODEX_COMMAND ?? 'codex';
  let term: pty.IPty | null = null;
  let out = '';
  let trustAnswered = false;

  const stripped = () => stripAnsi(out);
  // The panel is only useful once the LIMIT lines are on it — `parseCodexStatus` yields nothing
  // without them. Treating "Account:" as done was the bug: codex defers limits on the first
  // /status after launch ("Limits: refresh requested; run /status again shortly"), so the panel
  // rendered, the scrape stopped, and the parse came back empty.
  const panelSeen = () => /Account:/i.test(stripped());
  const rendered = () => /(5h limit|Weekly limit)\s*:/i.test(stripped());
  const limitsDeferred = () => /refresh requested|run \/status again/i.test(stripped());
  const kill = () => {
    try {
      term?.kill();
    } catch {
      /* ignore */
    }
  };

  try {
    term = pty.spawn(binary, [], {
      name: 'xterm-256color',
      cols: 150,
      rows: 60,
      cwd: scrapeCwd(),
      env: ptyEnv()
    });
  } catch (error) {
    logger.warn('provider.cli.codex.spawn_failed', {
      error: error instanceof Error ? error.message : String(error)
    });
    return null;
  }

  const write = (data: string) => {
    try {
      term?.write(data);
    } catch {
      /* ignore */
    }
  };

  const composerRe =
    /(Explain this|Find and fix|Write tests|Improve documentation|Summarize recent)/i;
  const startedAt = Date.now();
  let exitCode: number | null = null;
  term.onExit(({ exitCode: code }) => {
    exitCode = code;
  });

  term.onData((data) => {
    out += data;
    if (!trustAnswered && isCodexTrustPrompt(out)) {
      trustAnswered = true;
      // Codex's trust prompt defaults to "1. Yes, continue" (highlighted) — just press Enter.
      // (An arrow key would move to "2. No, quit" and make codex exit.)
      write('\r');
    }
  });

  logger.info('provider.cli.codex.status.start', { binary, cwd: scrapeCwd() });

  try {
    // 1) Wait for the composer to appear (poll up to ~14s, or until codex exits early).
    const composerDeadline = Date.now() + 14000;
    while (Date.now() < composerDeadline && exitCode === null && !composerRe.test(stripped())) {
      await delay(300);
    }
    const composerSeen = composerRe.test(stripped());

    // 2) Wait out the `codex_apps` MCP boot (slash commands typed before it finishes get queued as
    //    chat text). Boot time varies run-to-run, so after the base wait we RETRY the whole
    //    type-command cycle until the /status panel actually renders — robust to the variance.
    await delay(CODEX_BOOT_WAIT_MS);
    let attempts = 0;
    for (; attempts < 6 && !rendered(); attempts++) {
      write('\x1b'); // clear any queued/partial input or open popup
      await delay(250);
      write('/status');
      await delay(700); // let the slash popup appear
      write('\r'); // select + run
      await delay(1900); // let the panel draw
      // Codex answers the first /status after launch with "Limits: refresh requested; run /status
      // again shortly" — it kicks off the fetch and expects a second ask. Give that fetch time to
      // land before re-running, otherwise we just collect the same placeholder again.
      if (!rendered() && limitsDeferred()) {
        await delay(2200);
      }
    }

    const ok = rendered();
    if (ok) await delay(700); // let it finish drawing
    const result = ok ? stripped() : null;
    kill();

    // Diagnostics: on failure, log the transcript tail so we can see WHAT codex actually showed
    // (still booting? command not found? garbled panel?). Appears in the dev terminal ([desktop]).
    const diag = {
      event: 'codex.status',
      ok,
      composerSeen,
      panelSeen: panelSeen(),
      limitsDeferred: limitsDeferred(),
      attempts,
      exitCode,
      elapsedMs: Date.now() - startedAt,
      tail: stripped().replace(/\s+/g, ' ').slice(-1000)
    };
    logger[ok ? 'info' : 'warn']('provider.cli.codex.status.result', diag);
    void appendScrapeDiag(diag);
    return result;
  } catch (error) {
    kill();
    logger.warn('provider.cli.codex.status.error', {
      error: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
}

/** Parse the codex `/status` panel into usage meters (+ account/model/session as detail). */
export function parseCodexStatus(transcript: string): ScrapedUsage | null {
  const lines = transcript.split('\n').map((line) => line.replace(/\s+/g, ' ').trim());
  const meters: ScrapedUsageMeter[] = [];

  for (const line of lines) {
    // e.g. "Weekly limit: [███░] 93% left (resets 10:16 on 22 Jul)"
    const match = line.match(
      /(5h limit|Weekly limit)\s*:.*?(\d+)%\s*left(?:\s*\(resets\s*([^)]+)\))?/i
    );
    if (!match) continue;
    const id = /weekly/i.test(match[1]) ? 'weekly' : 'five-hour';
    if (meters.some((m) => m.id === id)) continue;
    const percentLeft = Number(match[2]);
    meters.push({
      id,
      label: id === 'weekly' ? 'Weekly' : '5h',
      percentUsed: Math.max(0, 100 - percentLeft),
      percentLeft,
      resetAt: match[3]?.trim() ?? null,
      detail: null
    });
  }

  return meters.length > 0 ? { meters, capturedAt: new Date().toISOString() } : null;
}

// ── In-memory + on-disk cache of the Claude catalog ────────────────────────────────────────────
// Scraping spawns the CLI (~seconds), so we cache the result and persist it so it survives restarts
// (a scraped-and-cached list is still "from the CLI" — just not re-scraped on every settings read).

const claudeCacheFile = path.join(os.homedir(), '.oplyr', 'claude-models-cache.json');
let claudeCatalogMemo: ClaudeCatalog | null = null;

export async function loadClaudeCatalogFromDisk(): Promise<ClaudeCatalog | null> {
  if (claudeCatalogMemo) return claudeCatalogMemo;
  try {
    const raw = await fsp.readFile(claudeCacheFile, 'utf8');
    claudeCatalogMemo = JSON.parse(raw) as ClaudeCatalog;
    return claudeCatalogMemo;
  } catch {
    return null;
  }
}

async function saveClaudeCatalogToDisk(catalog: ClaudeCatalog): Promise<void> {
  try {
    await fsp.mkdir(path.dirname(claudeCacheFile), { recursive: true, mode: 0o700 });
    await fsp.writeFile(claudeCacheFile, JSON.stringify(catalog), { mode: 0o600 });
  } catch (error) {
    logger.warn('provider.cli.claude.cache_write_failed', {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

/** Re-scrape Claude and update the in-memory + disk cache. Returns the fresh catalog (or the last
 *  cached one if the scrape failed). */
export async function refreshClaudeCatalog(): Promise<ClaudeCatalog | null> {
  const scraped = await scrapeClaudeCatalog();
  if (scraped) {
    claudeCatalogMemo = scraped;
    await saveClaudeCatalogToDisk(scraped);
    return scraped;
  }
  return loadClaudeCatalogFromDisk();
}
