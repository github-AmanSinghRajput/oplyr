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
  lines.shift();
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

/** Render recent messages into a bounded blob for the distiller (keeps the most recent tail). */
export function buildSessionText(messages: TranscriptMessage[], maxChars = 9000): string {
  const rendered = messages
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.text}`)
    .join('\n\n');
  return rendered.length > maxChars
    ? `…[earlier turns trimmed]\n\n${rendered.slice(rendered.length - maxChars)}`
    : rendered;
}
