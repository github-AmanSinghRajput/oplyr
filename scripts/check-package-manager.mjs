import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const packageJsonPath = path.join(repoRoot, 'package.json');
const packageLockPath = path.join(repoRoot, 'package-lock.json');
const pnpmLockPath = path.join(repoRoot, 'pnpm-lock.yaml');

const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

if (
  typeof packageJson.packageManager !== 'string' ||
  !packageJson.packageManager.startsWith('npm@')
) {
  console.error('package.json must pin npm in the packageManager field.');
  process.exit(1);
}

if (!fs.existsSync(packageLockPath)) {
  console.error('package-lock.json is required for this npm workspace repo.');
  process.exit(1);
}

if (fs.existsSync(pnpmLockPath)) {
  console.error('pnpm-lock.yaml should not be committed. This repository is standardized on npm.');
  process.exit(1);
}
