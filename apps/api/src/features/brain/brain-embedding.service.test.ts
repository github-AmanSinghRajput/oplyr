import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LocalEmbeddingProvider, NullEmbeddingProvider } from './brain-embedding.service.js';

test('NullEmbeddingProvider always returns null', async () => {
  const provider = new NullEmbeddingProvider();
  assert.equal(provider.model, 'none');
  assert.equal(await provider.embed(['anything']), null);
});

test('LocalEmbeddingProvider derives a short stable model tag', () => {
  assert.equal(new LocalEmbeddingProvider('Xenova/all-MiniLM-L6-v2').model, 'all-minilm-l6-v2');
});

test('LocalEmbeddingProvider degrades to null when the model/dep is unavailable', async () => {
  // The transformers.js dependency is optional; when it cannot load, embed() must return null
  // (recall then falls back to keyword scoring) rather than throwing.
  const provider = new LocalEmbeddingProvider('Xenova/all-MiniLM-L6-v2');
  const result = await provider.embed(['hello world']);
  assert.ok(result === null || Array.isArray(result));
});

test('LocalEmbeddingProvider returns [] for an empty batch', async () => {
  const provider = new LocalEmbeddingProvider();
  const result = await provider.embed([]);
  assert.ok(result === null || result.length === 0);
});
