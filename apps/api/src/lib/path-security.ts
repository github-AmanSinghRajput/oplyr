import fs from 'node:fs/promises';
import path from 'node:path';

const exactSecretNames = new Set([
  '.env',
  '.env.local',
  'id_rsa',
  'id_dsa',
  'id_ecdsa',
  'id_ed25519',
  '.npmrc',
  '.netrc',
  '.pgpass',
  '.git-credentials',
  'credentials',
  'authorized_keys',
  'known_hosts'
]);
const suffixSecretPatterns = [
  '.pem',
  '.key',
  '.p8',
  '.p12',
  '.pfx',
  '.pkcs12',
  '.jks',
  '.keystore',
  '.asc',
  '.gpg',
  '.kdbx',
  '.ppk',
  '.ovpn',
  '.env',
  '.tfstate'
];
const directoryMarkers = ['.aws', '.ssh', '.gnupg', 'secrets', 'credentials', 'private', 'certs'];
const exactRelativePaths = ['.docker/config.json'];

function normalizePathSegment(input: string) {
  return input
    .replace(/\\/g, '/')
    .replace(/^\.\/+/, '')
    .replace(/^\/+/, '')
    .trim();
}

// `git status`/`git diff --name-status` wrap paths containing non-ASCII or special bytes in double
// quotes and C-escape them (e.g. `"caf\303\251.pem"`), which would otherwise defeat suffix/segment
// matching. Strip the wrapping quotes and collapse escape sequences before matching so the
// security-relevant ASCII tokens (extensions, dir names) are seen. Matching-only — not a real path.
function dequoteGitPath(input: string): string {
  let value = input.trim();
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    value = value
      .slice(1, -1)
      .replace(/\\[0-7]{1,3}/g, '')
      .replace(/\\(.)/g, '$1');
  }
  return value;
}

export function isSecretRelativePath(relativePath: string) {
  const normalized = normalizePathSegment(dequoteGitPath(relativePath)).toLowerCase();
  if (!normalized) {
    return false;
  }

  const segments = normalized.split('/').filter(Boolean);
  const basename = segments[segments.length - 1] ?? '';

  if (exactSecretNames.has(basename)) {
    return true;
  }

  if (basename.startsWith('.env.')) {
    return true;
  }

  if (suffixSecretPatterns.some((suffix) => basename.endsWith(suffix))) {
    return true;
  }

  if (
    exactRelativePaths.some(
      (candidate) => normalized === candidate || normalized.endsWith(`/${candidate}`)
    )
  ) {
    return true;
  }

  return segments.some((segment) => directoryMarkers.includes(segment));
}

export async function resolveWorkspacePath(projectRoot: string, relativePath: string) {
  const normalizedRelativePath = normalizePathSegment(relativePath);
  const absolutePath = path.resolve(projectRoot, normalizedRelativePath);
  const realProjectRoot = await fs.realpath(projectRoot);
  const relativeToRoot = path.relative(realProjectRoot, absolutePath);
  const escapesWorkspace =
    !relativeToRoot || relativeToRoot === ''
      ? false
      : relativeToRoot === '..' || relativeToRoot.startsWith(`..${path.sep}`);

  if (escapesWorkspace) {
    return {
      normalizedRelativePath,
      absolutePath,
      realPath: null,
      escapesWorkspace: true,
      isSymlink: false
    };
  }

  try {
    const stats = await fs.lstat(absolutePath);
    if (stats.isSymbolicLink()) {
      const realPath = await fs.realpath(absolutePath);
      const realRelativeToRoot = path.relative(realProjectRoot, realPath);
      return {
        normalizedRelativePath,
        absolutePath,
        realPath,
        escapesWorkspace:
          realRelativeToRoot === '..' || realRelativeToRoot.startsWith(`..${path.sep}`),
        isSymlink: true
      };
    }
  } catch {
    return {
      normalizedRelativePath,
      absolutePath,
      realPath: null,
      escapesWorkspace: false,
      isSymlink: false
    };
  }

  return {
    normalizedRelativePath,
    absolutePath,
    realPath: absolutePath,
    escapesWorkspace: false,
    isSymlink: false
  };
}

export async function isProtectedWorkspacePath(projectRoot: string, relativePath: string) {
  if (isSecretRelativePath(relativePath)) {
    return true;
  }

  const resolved = await resolveWorkspacePath(projectRoot, relativePath);
  return resolved.escapesWorkspace;
}
