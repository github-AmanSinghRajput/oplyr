import test from 'node:test';
import assert from 'node:assert/strict';

import { isSecretRelativePath } from './path-security.js';

test('isSecretRelativePath catches git-quoted secret paths (the leak fix)', () => {
  // git wraps + octal-escapes non-ASCII paths; the matcher must see through the quoting.
  assert.equal(isSecretRelativePath('"caf\\303\\251.pem"'), true, 'quoted unicode .pem');
  assert.equal(isSecretRelativePath('".aws/credentials"'), true, 'quoted .aws/credentials');
  assert.equal(isSecretRelativePath('"secrets/prod \\303\\251.key"'), true, 'quoted secrets/*.key');
});

test('isSecretRelativePath covers common credential files + dirs', () => {
  for (const p of [
    '.env',
    'production.env',
    '.env.production',
    '.ssh/authorized_keys',
    '.ssh/id_rsa',
    '.gnupg/secring.gpg',
    '.netrc',
    '.pgpass',
    '.git-credentials',
    'config/service-account.p12',
    'infra/terraform.tfstate',
    'private/app.key',
    'certs/server.pem'
  ]) {
    assert.equal(isSecretRelativePath(p), true, `expected secret: ${p}`);
  }
});

test('isSecretRelativePath does not over-match ordinary source files', () => {
  for (const p of ['src/index.ts', 'README.md', 'package.json', 'apps/web/App.tsx']) {
    assert.equal(isSecretRelativePath(p), false, `expected non-secret: ${p}`);
  }
});
