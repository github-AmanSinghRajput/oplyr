import fs from 'node:fs/promises';

// Reading agent session transcripts. These `.jsonl` files can be hundreds of MB (one line per turn,
// including tool payloads), so we only ever read the TAIL and pull the recent user/assistant text —
// that's the "where the session left off" signal we distill. Two on-disk formats:
//   Claude:  { type:'user'|'assistant', message:{ role, content } }  (content: string | text-blocks)
//   Codex:   { type:'event_msg', payload:{ type:'user_message'|'agent_message', message:string } }

export type TranscriptFormat = 'claude' | 'codex';

export interface TranscriptMessage {
  role: 'user' | 'assistant';
  text: string;
}

/**
 * How far back into a session we are willing to read. A long session is mostly tool payloads and
 * base64 images, so the conversation worth distilling is a small fraction of the bytes — this is a
 * ceiling for pathological files, not the normal read. `readSessionMessages` walks backwards and
 * stops as soon as it has enough conversation, so a typical session touches a few MB at most.
 */
export const MAX_TAIL_BYTES = 100 * 1024 * 1024;

/** How much of the file to pull per backward step while looking for enough conversation. */
const READ_SLICE_BYTES = 2 * 1024 * 1024;

/** Read only the last `maxBytes` of a file (transcripts can be enormous). */
export async function readTail(filePath: string, maxBytes = 524288): Promise<string> {
  let handle: Awaited<ReturnType<typeof fs.open>> | undefined;
  try {
    handle = await fs.open(filePath, 'r');
    const { size } = await handle.stat();
    const start = size > maxBytes ? Number(size) - maxBytes : 0;
    const length = Number(size) - start;
    if (length <= 0) return '';
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, start);
    return buffer.toString('utf8');
  } catch {
    return '';
  } finally {
    await handle?.close();
  }
}

function claudeLineToMessage(value: unknown): TranscriptMessage | null {
  const line = value as { type?: unknown; message?: { role?: unknown; content?: unknown } };
  const role = line.type === 'user' || line.type === 'assistant' ? line.type : line.message?.role;
  if (role !== 'user' && role !== 'assistant') return null;

  const content = line.message?.content;
  let text = '';
  if (typeof content === 'string') {
    text = content;
  } else if (Array.isArray(content)) {
    text = content
      .filter(
        (b): b is { type: string; text: string } =>
          Boolean(b) && typeof b === 'object' && (b as { type?: unknown }).type === 'text'
      )
      .map((b) => b.text)
      .join('\n');
  }
  text = text.trim();
  return text ? { role, text } : null;
}

/** Codex wraps its own memory lookups in this block. It is bookkeeping, not conversation. */
const CITATION_BLOCK_RE = /<oai-mem-citation>[\s\S]*?<\/oai-mem-citation>/g;

/** Join the `content[]` entries of a rollout item, whatever case the `type` tags use. */
function joinContentText(content: unknown): string {
  if (!Array.isArray(content)) return '';
  return content
    .map((part) => (part as { text?: unknown })?.text)
    .filter((text): text is string => typeof text === 'string')
    .join('')
    .replace(CITATION_BLOCK_RE, '')
    .trim();
}

/**
 * Pull one conversation turn out of a Codex rollout line.
 *
 * Codex has changed its rollout schema, and both shapes are on disk:
 *  - older sessions emit `event_msg` with `payload.type` of `user_message` / `agent_message`
 *  - current sessions emit `event_msg` with `payload.type: 'item_completed'` and the turn under
 *    `payload.item` as `UserMessage` / `AgentMessage`
 *
 * Only reading the older shape meant every recent Codex session distilled to NOTHING, so the brain
 * silently stopped learning from Codex while still reporting a successful import. An 883MB session
 * of real work yielded zero messages.
 *
 * Deliberately confined to the `event_msg` family. `response_item` records carry the same turns
 * again, so parsing both would double every message, and the `response_item` copies are the ones
 * with the system preamble stitched into them.
 */
function codexLineToMessage(value: unknown): TranscriptMessage | null {
  const line = value as {
    type?: unknown;
    payload?: { type?: unknown; message?: unknown; item?: unknown };
  };
  if (line.type !== 'event_msg') return null;
  const payload = line.payload;
  if (!payload) return null;

  if (payload.type === 'item_completed') {
    const item = payload.item as { type?: unknown; content?: unknown } | undefined;
    if (!item) return null;
    const role =
      item.type === 'UserMessage' ? 'user' : item.type === 'AgentMessage' ? 'assistant' : null;
    if (!role) return null;
    const text = joinContentText(item.content);
    return text ? { role, text } : null;
  }

  if (typeof payload.message !== 'string') return null;
  const text = payload.message.trim();
  if (!text) return null;
  if (payload.type === 'user_message') return { role: 'user', text };
  if (payload.type === 'agent_message') return { role: 'assistant', text };
  return null;
}

// Oplyr's own scaffolding leaks into transcripts as "messages": the injected persona/system prompt
// ("You are Codex Voice Buddy…"), environment/permission blocks, and reminders. These are noise for
// the distiller (they describe Oplyr, not the user's work), so we drop them.
const SCAFFOLD_RE =
  /^\s*(you are (codex|claude|gemini|oplyr)\b|<environment_context|<permissions|<system|<user-prompt|<command-|<local-command|caveat: the messages below)/i;

function isScaffold(text: string): boolean {
  return SCAFFOLD_RE.test(text);
}

/** Pull recent user/assistant text from a transcript tail. Drops the first (likely partial) line and
 *  Oplyr's own scaffolding, so the distiller sees the real conversation. */
export function extractMessages(tailText: string, format: TranscriptFormat): TranscriptMessage[] {
  const lines = tailText.split('\n');
  // No unconditional shift here. That was safe when every read started mid-file, but the reader can
  // now reach the top of a session, where line 1 is a real turn. A genuinely truncated line begins
  // mid-JSON and is dropped by the parse guard below anyway.
  const toMessage = format === 'claude' ? claudeLineToMessage : codexLineToMessage;
  const messages: TranscriptMessage[] = [];
  for (const raw of lines) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      continue;
    }
    const message = toMessage(parsed);
    if (message && !isScaffold(message.text)) messages.push(message);
  }
  return messages;
}

/**
 * Walk backwards through a session until we have `enoughChars` of real conversation, or until
 * `maxBytes` have been read.
 *
 * Reading a fixed tail was the wrong shape: 512KB of an 800MB session might be a single tool result
 * and contain no conversation at all, while on a small session it reads the whole file needlessly.
 *
 * Each byte is decoded and parsed exactly once. The obvious version re-parses the whole accumulated
 * buffer every round, which is quadratic and unusable on the real files this exists for: sessions
 * here reach 883MB. Instead only the newly read slice is parsed, with the fragment before its first
 * newline carried forward to be completed by the slice that precedes it.
 */
export async function readSessionMessages(
  filePath: string,
  format: TranscriptFormat,
  options: { maxBytes?: number; enoughChars?: number } = {}
): Promise<TranscriptMessage[]> {
  const maxBytes = options.maxBytes ?? MAX_TAIL_BYTES;
  const enoughChars = options.enoughChars ?? 9000;

  let handle: Awaited<ReturnType<typeof fs.open>> | undefined;
  try {
    handle = await fs.open(filePath, 'r');
    const { size } = await handle.stat();
    const total = Number(size);
    if (total <= 0) return [];

    const messages: TranscriptMessage[] = [];
    let chars = 0;
    // Bytes read but not yet parsed: the fragment before the first newline of the region we have
    // seen, which only becomes a complete line once the PREVIOUS slice is read.
    let pending = Buffer.alloc(0);
    let start = total;
    let consumed = 0;

    while (start > 0 && consumed < maxBytes) {
      const sliceSize = Math.min(READ_SLICE_BYTES, start, maxBytes - consumed);
      start -= sliceSize;
      const buffer = Buffer.alloc(sliceSize);
      await handle.read(buffer, 0, sliceSize, start);
      consumed += sliceSize;

      // Concatenate as BYTES before decoding: a multi-byte character split across the slice
      // boundary would otherwise decode to replacement characters on both sides.
      const region = Buffer.concat([buffer, pending]);
      const atFileStart = start === 0;
      const firstBreak = atFileStart ? -1 : region.indexOf(0x0a);
      if (!atFileStart && firstBreak === -1) {
        // No newline in the whole region yet: one very long line still being assembled.
        pending = region;
        continue;
      }
      pending = atFileStart ? Buffer.alloc(0) : region.subarray(0, firstBreak);

      const slice = extractMessages(region.subarray(firstBreak + 1).toString('utf8'), format);
      // Parsed newest-last overall, so earlier slices go in front.
      messages.unshift(...slice);
      for (const message of slice) chars += message.text.length;

      if (chars >= enoughChars) break;
    }

    return messages;
  } catch {
    return [];
  } finally {
    await handle?.close();
  }
}

/**
 * Split the retained conversation into distiller-sized chunks, newest last.
 *
 * One 9000-character blob per session was the real limit on how much Oplyr could remember — the
 * read size never mattered, because everything downstream was sliced to that. Each chunk costs one
 * call to the user's own agent, so the chunk count is the cost dial.
 */
export function buildSessionChunks(
  messages: TranscriptMessage[],
  chunkChars: number,
  maxChunks: number
): string[] {
  const rendered = messages.map(
    (message) => `${message.role === 'user' ? 'User' : 'Assistant'}: ${message.text}`
  );

  const chunks: string[] = [];
  let current: string[] = [];
  let size = 0;

  // Build from the NEWEST backwards, so if the budget runs out it is the oldest turns that are lost.
  for (let i = rendered.length - 1; i >= 0; i -= 1) {
    const entry = rendered[i]!;
    if (size > 0 && size + entry.length > chunkChars) {
      chunks.unshift(current.join('\n\n'));
      if (chunks.length >= maxChunks) return chunks;
      current = [];
      size = 0;
    }
    current.unshift(entry);
    size += entry.length;
  }
  if (current.length > 0) chunks.unshift(current.join('\n\n'));

  return chunks.slice(-maxChunks);
}
