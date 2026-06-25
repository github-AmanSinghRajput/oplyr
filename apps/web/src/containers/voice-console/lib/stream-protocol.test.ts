import assert from 'node:assert/strict';
import test from 'node:test';
import { downsampleTo16k, floatToInt16 } from './stream-protocol.js';

test('downsampleTo16k halves a 32kHz buffer to ~16kHz length', () => {
  const input = new Float32Array(3200); // 0.1s @32k
  const out = downsampleTo16k(input, 32000);
  assert.equal(Math.abs(out.length - 1600) <= 1, true);
});

test('downsampleTo16k returns input unchanged when already 16kHz', () => {
  const input = new Float32Array([0, 0.5, -0.5, 1]);
  const out = downsampleTo16k(input, 16000);
  assert.equal(out.length, 4);
});

test('floatToInt16 clamps and scales to int16 range', () => {
  const out = floatToInt16(new Float32Array([0, 1, -1, 2]));
  assert.equal(out[0], 0);
  assert.equal(out[1], 32767);
  assert.equal(out[2], -32768);
  assert.equal(out[3], 32767); // clamped
});
