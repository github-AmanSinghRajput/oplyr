import os from 'node:os';

export interface VoicePlatformSupport {
  /** True only when this machine can actually run the local STT engine. */
  supported: boolean;
  isMac: boolean;
  isAppleSilicon: boolean;
  /** macOS major version (e.g. 14 for Sonoma), or null if undetectable. */
  macOsMajor: number | null;
  /** Human-readable reason voice is unavailable, or null when supported. */
  reason: string | null;
}

// Voice/STT requires Apple Silicon + macOS 14 (Sonoma). The native `oplyr-stt` binary is built
// against the macOS 14 SDK and FluidAudio/CoreML runs Parakeet on the Apple Neural Engine — there is
// no Intel or pre-Sonoma fallback. We detect this precisely so an unsupported Mac gets a clear
// message instead of a failed STT launch. macOS version is derived from the Darwin kernel major
// (Darwin 23 → macOS 14, Darwin 22 → macOS 13, …). The shipped Apple Silicon build reports arm64;
// an Intel Mac reports x64.
const MIN_MACOS_MAJOR = 14;

export function resolveVoicePlatformSupport(): VoicePlatformSupport {
  if (process.platform !== 'darwin') {
    return {
      supported: false,
      isMac: false,
      isAppleSilicon: false,
      macOsMajor: null,
      reason: 'Voice runs only on macOS for now. Text chat works on every platform.'
    };
  }

  const isAppleSilicon = process.arch === 'arm64';
  const darwinMajor = Number.parseInt(os.release().split('.')[0] ?? '', 10);
  const macOsMajor = Number.isFinite(darwinMajor) ? darwinMajor - 9 : null;

  if (!isAppleSilicon) {
    return {
      supported: false,
      isMac: true,
      isAppleSilicon: false,
      macOsMajor,
      reason: 'Voice needs an Apple Silicon Mac (M1 or later). Text chat still works here.'
    };
  }

  if (macOsMajor !== null && macOsMajor < MIN_MACOS_MAJOR) {
    return {
      supported: false,
      isMac: true,
      isAppleSilicon: true,
      macOsMajor,
      reason: `Voice needs macOS ${MIN_MACOS_MAJOR} (Sonoma) or later. Update macOS to enable voice.`
    };
  }

  return { supported: true, isMac: true, isAppleSilicon: true, macOsMajor, reason: null };
}
