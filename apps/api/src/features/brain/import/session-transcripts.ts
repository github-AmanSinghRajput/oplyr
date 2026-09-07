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

function codexLineToMessage(value: unknown): TranscriptMessage | null {
  const line = value as { type?: unknown; payload?: { type?: unknown; message?: unknown } };
  if (line.type !== 'event_msg') return null;
  const payload = line.payload;
  if (!payload || typeof payload.message !== 'string') return null;
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

/** Total characters of conversation across messages — the budget that actually matters. */
function conversationChars(messages: TranscriptMessage[]): number {
  let total = 0;
  for (const message of messages) total += message.text.length;
  return total;
}

/**
 * Walk backwards through a session until we have `enoughChars` of real conversation, or until
 * `maxBytes` have been read.
 *
 * Reading a fixed tail was the wrong shape: 512KB of an 800MB session might be a single tool result
 * and contain no conversation at all, while on a small session it reads the whole file needlessly.
 * Slices are decoded together rather than one at a time, because a multi-byte character split
 * across a slice boundary would otherwise corrupt into replacement characters mid-transcript.
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

    const slices: Buffer[] = [];
    let start = total;
    let consumed = 0;
    let best: TranscriptMessage[] = [];

    while (start > 0 && consumed < maxBytes) {
      const sliceSize = Math.min(READ_SLICE_BYTES, start, maxBytes - consumed);
      start -= sliceSize;
      const buffer = Buffer.alloc(sliceSize);
      await handle.read(buffer, 0, sliceSize, start);
      slices.unshift(buffer);
      consumed += sliceSize;

      let text = Buffer.concat(slices).toString('utf8');
      // Unless we reached the top of the file, the first line is a fragment of an earlier record.
      if (start > 0) {
        const firstBreak = text.indexOf('\n');
        text = firstBreak === -1 ? '' : text.slice(firstBreak + 1);
      }

      best = extractMessages(text, format);
      if (conversationChars(best) >= enoughChars) {
        return best;
      }
    }

    return best;
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
