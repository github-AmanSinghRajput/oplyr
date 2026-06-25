import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getRootDir } from './store.js';

function pathExists(targetPath: string) {
  try {
    fs.accessSync(targetPath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function uniquePaths(paths: string[]) {
  return Array.from(new Set(paths.filter(Boolean).map((value) => path.normalize(value))));
}

function readEnv(name: string) {
  return process.env[name]?.trim() || '';
}

export function resolvePortablePath(inputPath: string | undefined | null, baseDir = getRootDir()) {
  const trimmed = inputPath?.trim();
  if (!trimmed) {
    return '';
  }

  return path.isAbsolute(trimmed) ? path.normalize(trimmed) : path.resolve(baseDir, trimmed);
}

function getDefaultUserDataRoot() {
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'Oplyr');
  }

  if (process.platform === 'win32') {
    const appData = process.env.APPDATA?.trim() || path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(appData, 'Oplyr');
  }

  return path.join(os.homedir(), '.local', 'share', 'oplyr');
}

export function getUserDataDir() {
  const configured = resolvePortablePath(readEnv('OPLYR_USER_DATA_DIR'));
  if (configured) {
    return configured;
  }

  if ((process.env.APP_ENV ?? 'development') === 'production') {
    return getDefaultUserDataRoot();
  }

  return path.join(getRootDir(), '.local');
}

export function ensureDirectory(directoryPath: string) {
  fs.mkdirSync(directoryPath, { recursive: true });
  return directoryPath;
}

export function getModelsInstallDir() {
  return path.join(getUserDataDir(), 'models');
}

export function getPortableAssistantCwd() {
  return ensureDirectory(path.join(getUserDataDir(), 'assistant-session'));
}

export function getDefaultRuntimeDatabasePath() {
  return path.join(getUserDataDir(), 'runtime.db');
}

export function getConfiguredRuntimeDatabasePath(configuredPath: string | undefined | null) {
  return resolvePortablePath(configuredPath) || null;
}

function getModelRootCandidates() {
  return uniquePaths([
    resolvePortablePath(readEnv('OPLYR_LOCAL_MODELS_DIR')),
    getModelsInstallDir(),
    path.join(getRootDir(), 'local-models')
  ]);
}

function getModelSeedCandidates() {
  return uniquePaths([
    resolvePortablePath(readEnv('OPLYR_MODEL_SEED_DIR')),
    path.join(getRootDir(), 'local-models')
  ]);
}

function getScriptRootCandidates() {
  return uniquePaths([
    resolvePortablePath(readEnv('OPLYR_SCRIPT_ROOT')),
    path.join(getRootDir(), 'apps', 'api', 'scripts')
  ]);
}

function resolveExistingCandidate(candidates: string[]) {
  for (const candidate of candidates) {
    if (candidate && pathExists(candidate)) {
      return candidate;
    }
  }

  return '';
}

export function resolveModelArtifact(...segments: string[]) {
  return resolveExistingCandidate(
    getModelRootCandidates().map((root) => path.join(root, ...segments))
  );
}

export function resolveScriptArtifact(fileName: string) {
  return resolveExistingCandidate(
    getScriptRootCandidates().map((root) => path.join(root, fileName))
  );
}

export function resolveModelSeedRoot() {
  return resolveExistingCandidate(getModelSeedCandidates());
}

function shellEscape(value: string) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function getSttBinaryCandidates() {
  return uniquePaths([
    resolvePortablePath(readEnv('OPLYR_STT_BINARY')),
    resolveModelArtifact('stt', 'oplyr-stt'), // packaged: bundled next to models
    path.join(getRootDir(), 'apps', 'stt', '.build', 'release', 'oplyr-stt') // dev
  ]);
}

function resolveSttBinary() {
  return resolveExistingCandidate(getSttBinaryCandidates());
}

export function getDefaultSttStreamWorkerCommand() {
  const bin = resolveSttBinary();
  return bin ? shellEscape(bin) : '';
}

export function getDefaultSttProvisionCommand() {
  const bin = resolveSttBinary();
  return bin ? `${shellEscape(bin)} --provision` : '';
}
