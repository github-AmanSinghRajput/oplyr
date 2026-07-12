import test from 'node:test';
import assert from 'node:assert/strict';

import { verifyModelIntegrity } from './model-integrity.js';

test('verifyModelIntegrity never throws and returns a well-formed verdict', () => {
  const result = verifyModelIntegrity();
  assert.equal(typeof result.checked, 'boolean');
  assert.equal(typeof result.ok, 'boolean');
});

test('verifyModelIntegrity is fail-open — a missing model is not a failure', () => {
  const result = verifyModelIntegrity();
  // When the canary file isn't found (e.g. CI, or FluidAudio moved it), the check is skipped and
  // must report ok=true so a missing/relocated model never blocks voice.
  if (!result.checked) {
    assert.equal(result.ok, true);
  }
});
