import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { logger } from '../../lib/logger.js';

// Pinned SHA-256 of the Parakeet v3 vocab file — a small, stable data file downloaded as-is from
// Hugging Face (not a compiled artifact, so it's byte-reproducible across machines). This is a tamper
// canary: if the file is present and its hash differs, the on-disk model was corrupted or swapped and
// we refuse to use it. If the file isn't where we expect (FluidAudio owns the storage location and
// could change it in a future version), we SKIP the check rather than false-reject — HuggingFace Hub
// already verifies each file's SHA-256 on download. Pinning the HF repo revision is the pre-GA
// hardening; see docs/SECURITY_AUDIT.md.
const EXPECTED_VOCAB_SHA256 = '7ec60e05f1b24480736ec0eed40900f4626bce1fa9a60fd700ec7e2a59198735';

// FluidAudio's default on-disk model location (macOS). This is FluidAudio's own path, independent of
// OPLYR_LOCAL_MODELS_DIR. Voice is macOS-only, so homedir + Application Support is correct here.
function resolveVocabPath(): string {
  return path.join(
    os.homedir(),
    'Library',
    'Application Support',
    'FluidAudio',
    'Models',
    'parakeet-tdt-0.6b-v3',
    'parakeet_v3_vocab.json'
  );
}

export interface ModelIntegrityResult {
  /** Whether the canary file was found and actually checked. */
  checked: boolean;
  /** True when not-checked (skipped) or the hash matched; false only on a present-but-tampered file. */
  ok: boolean;
}

/**
 * Verify the on-disk speech model against the pinned vocab-file hash. Fail-open by design: a missing
 * file (unexpected location) is not a failure — only a present-but-mismatched file is.
 */
export function verifyModelIntegrity(): ModelIntegrityResult {
  const vocabPath = resolveVocabPath();
  let buffer: Buffer;
  try {
    buffer = fs.readFileSync(vocabPath);
  } catch {
    logger.info('voice.model.integrity.skipped', { reason: 'vocab_not_found' });
    return { checked: false, ok: true };
  }

  const actual = crypto.createHash('sha256').update(buffer).digest('hex');
  const ok = actual === EXPECTED_VOCAB_SHA256;
  if (!ok) {
    logger.error('voice.model.integrity.mismatch', { expected: EXPECTED_VOCAB_SHA256, actual });
  }
  return { checked: true, ok };
}
