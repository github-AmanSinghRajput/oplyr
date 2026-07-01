import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveVoicePlatformSupport } from './platform.js';

test('resolveVoicePlatformSupport returns a consistent, well-formed verdict', () => {
  const support = resolveVoicePlatformSupport();

  // supported is true exactly when there is no blocking reason.
  assert.equal(support.supported, support.reason === null);

  // A supported machine must be an Apple Silicon Mac on macOS 14+.
  if (support.supported) {
    assert.equal(support.isMac, true);
    assert.equal(support.isAppleSilicon, true);
    assert.ok(support.macOsMajor !== null && support.macOsMajor >= 14);
  }
});

test('resolveVoicePlatformSupport reports a clear reason off macOS', () => {
  const support = resolveVoicePlatformSupport();

  // On any non-macOS host (e.g. Linux CI) voice is unsupported with a macOS-facing message.
  if (process.platform !== 'darwin') {
    assert.equal(support.supported, false);
    assert.equal(support.isMac, false);
    assert.equal(support.isAppleSilicon, false);
    assert.match(support.reason ?? '', /macOS/i);
  }
});
