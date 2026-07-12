import path from 'node:path';
import { logger } from '../../lib/logger.js';
import { getRootDir } from '../../store.js';
import { getUserDataDir } from '../../runtime-paths.js';
import { normalize } from './brain-vectors.js';
import type { BrainEmbeddingProvider } from './brain.types.js';

// On-device sentence embeddings for semantic recall. Runs a small quantized model (MiniLM by
// default) locally via transformers.js — no network, no API, nothing leaves the Mac.
//
// Design choices worth knowing:
//  - The transformers.js module is loaded through a NON-LITERAL dynamic import so tsc treats it as
//    `any` and esbuild leaves it as a runtime import. That keeps the whole app building and its
//    tests passing even when the (heavy) dependency isn't installed yet.
//  - If the module or model can't load, we log ONCE, mark ourselves disabled, and return null
//    forever after. Recall then degrades to keyword scoring — never a hard failure.
//  - In production we force offline mode (bundled model only). In dev we allow a one-time model
//    download to a local cache for convenience.

const DEFAULT_MODEL = process.env.BRAIN_EMBEDDINGS_MODEL?.trim() || 'Xenova/all-MiniLM-L6-v2';
const EMBEDDINGS_ENABLED = process.env.BRAIN_EMBEDDINGS_ENABLED !== 'false';

/** Short, stable tag stored alongside each vector so recall never mixes models of different shape. */
function modelTag(modelName: string) {
  return modelName.split('/').pop()!.toLowerCase();
}

function resolveModelDir() {
  return (
    process.env.BRAIN_EMBEDDINGS_MODEL_DIR?.trim() || path.join(getRootDir(), 'apps/api/models')
  );
}

function resolveCacheDir() {
  return process.env.BRAIN_EMBEDDINGS_CACHE_DIR?.trim() || path.join(getUserDataDir(), 'models');
}

type FeatureExtractor = (
  texts: string[],
  options: { pooling: 'mean'; normalize: boolean }
) => Promise<{ tolist(): number[][] }>;

export class LocalEmbeddingProvider implements BrainEmbeddingProvider {
  readonly model: string;
  private readonly modelName: string;
  private disabled = !EMBEDDINGS_ENABLED;
  private loggedDisable = false;
  private extractorPromise: Promise<FeatureExtractor | null> | null = null;

  constructor(modelName: string = DEFAULT_MODEL) {
    this.modelName = modelName;
    this.model = modelTag(modelName);
  }

  async embed(texts: string[]): Promise<Float32Array[] | null> {
    if (this.disabled || texts.length === 0) {
      return this.disabled ? null : [];
    }

    const extractor = await this.loadExtractor();
    if (!extractor) {
      return null;
    }

    try {
      const output = await extractor(texts, { pooling: 'mean', normalize: true });
      return output.tolist().map((row) => normalize(Float32Array.from(row)));
    } catch (error) {
      this.disable('brain.embeddings.inference_failed', error);
      return null;
    }
  }

  private loadExtractor(): Promise<FeatureExtractor | null> {
    if (!this.extractorPromise) {
      this.extractorPromise = this.createExtractor();
    }
    return this.extractorPromise;
  }

  private async createExtractor(): Promise<FeatureExtractor | null> {
    try {
      // Non-literal specifier: intentional, see file header.
      const specifier = '@xenova/transformers';
      const transformers = (await import(specifier)) as {
        env: { allowRemoteModels: boolean; localModelPath: string; cacheDir: string };
        pipeline: (task: 'feature-extraction', model: string) => Promise<FeatureExtractor>;
      };

      // Fail-safe privacy: NEVER fetch from the network unless a developer explicitly opts in. This
      // keeps a packaged build strictly offline even if APP_ENV is mis-set — the "nothing leaves the
      // Mac" invariant no longer depends on an env guess. Devs fetch the model once by launching with
      // BRAIN_EMBEDDINGS_ALLOW_DOWNLOAD=true (it then caches locally for offline use).
      const allowDownload = process.env.BRAIN_EMBEDDINGS_ALLOW_DOWNLOAD === 'true';
      transformers.env.allowRemoteModels = allowDownload;
      transformers.env.localModelPath = resolveModelDir();
      transformers.env.cacheDir = resolveCacheDir();

      const extractor = await transformers.pipeline('feature-extraction', this.modelName);
      logger.info('brain.embeddings.ready', { model: this.model, allowDownload });
      return extractor;
    } catch (error) {
      this.disable('brain.embeddings.unavailable', error);
      return null;
    }
  }

  private disable(event: string, error: unknown) {
    this.disabled = true;
    if (!this.loggedDisable) {
      this.loggedDisable = true;
      logger.warn(event, {
        model: this.model,
        message: error instanceof Error ? error.message : String(error),
        note: 'Recall falls back to keyword scoring until embeddings are available.'
      });
    }
  }
}

/** Embedding provider that always returns null — used in tests and when embeddings are turned off. */
export class NullEmbeddingProvider implements BrainEmbeddingProvider {
  readonly model = 'none';
  async embed(_texts: string[]): Promise<Float32Array[] | null> {
    return null;
  }
}

let sharedProvider: BrainEmbeddingProvider | null = null;

/** Process-wide singleton so the model loads at most once. */
export function getEmbeddingProvider(): BrainEmbeddingProvider {
  if (!sharedProvider) {
    sharedProvider = EMBEDDINGS_ENABLED
      ? new LocalEmbeddingProvider()
      : new NullEmbeddingProvider();
  }
  return sharedProvider;
}
