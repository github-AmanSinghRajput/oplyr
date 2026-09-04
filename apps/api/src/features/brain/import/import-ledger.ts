import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { readTail } from './session-transcripts.js';
import type { ImportFile } from './import.types.js';

export function sha256(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex');
}

/**
 * Durable-content hash for an import source. Curated docs hash the whole file; sessions hash the
 * read TAIL only (`readTail`, the same bytes the distiller consumes) — so hashing stays cheap even
 * for hundred-MB transcripts, and appended turns change the hash. Returns null when unreadable, in
 * which case the caller treats the source as `new` (nothing to compare against).
 */
export async function computeSourceHash(
  file: Pick<ImportFile, 'path' | 'kind'>
): Promise<string | null> {
  try {
    if (file.kind === 'session') {
      const tail = await readTail(file.path);
      return tail ? sha256(tail) : null;
    }
    const text = await fs.readFile(file.path, 'utf8');
    return sha256(text);
  } catch {
    return null;
  }
}
