import assert from 'node:assert/strict';
import { test } from 'node:test';
import { blobToVector, cosineSimilarity, normalize, vectorToBlob } from './brain-vectors.js';

test('vectorToBlob → blobToVector round-trips values', () => {
  const original = new Float32Array([0.1, -0.5, 0.9, 0.0]);
  const restored = blobToVector(vectorToBlob(original), original.length);
  for (let i = 0; i < original.length; i += 1) {
    assert.ok(Math.abs(restored[i]! - original[i]!) < 1e-6);
  }
});

test('blobToVector tolerates a short/corrupt blob without throwing', () => {
  const blob = vectorToBlob(new Float32Array([1, 2]));
  const restored = blobToVector(blob, 5);
  assert.equal(restored.length, 5);
  assert.equal(restored[0], 1);
  assert.equal(restored[4], 0);
});

test('normalize returns a unit vector', () => {
  const unit = normalize(new Float32Array([3, 4]));
  const magnitude = Math.sqrt(unit[0]! * unit[0]! + unit[1]! * unit[1]!);
  assert.ok(Math.abs(magnitude - 1) < 1e-6);
});

test('normalize leaves a zero vector unchanged', () => {
  const zero = normalize(new Float32Array([0, 0, 0]));
  assert.deepEqual([...zero], [0, 0, 0]);
});

test('cosineSimilarity: identical direction ≈ 1, opposite ≈ -1, orthogonal = 0', () => {
  assert.ok(
    Math.abs(cosineSimilarity(new Float32Array([1, 1]), new Float32Array([2, 2])) - 1) < 1e-6
  );
  assert.ok(
    Math.abs(cosineSimilarity(new Float32Array([1, 0]), new Float32Array([-1, 0])) + 1) < 1e-6
  );
  assert.equal(cosineSimilarity(new Float32Array([1, 0]), new Float32Array([0, 1])), 0);
});

test('cosineSimilarity: mismatched length or zero vector yields 0', () => {
  assert.equal(cosineSimilarity(new Float32Array([1, 2, 3]), new Float32Array([1, 2])), 0);
  assert.equal(cosineSimilarity(new Float32Array([0, 0]), new Float32Array([1, 1])), 0);
});
