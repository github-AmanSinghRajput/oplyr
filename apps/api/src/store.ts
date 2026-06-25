import path from 'node:path';
import { fileURLToPath } from 'node:url';

const srcDir = path.dirname(fileURLToPath(import.meta.url));
const bundledRoot = path.resolve(srcDir, '../../..');

export function getRootDir() {
  const configuredRoot = process.env.OPLYR_APP_ROOT?.trim();
  if (configuredRoot) {
    return path.resolve(configuredRoot);
  }

  return bundledRoot;
}
