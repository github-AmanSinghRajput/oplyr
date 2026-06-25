/**
 * Stub: the one-shot Parakeet transcription path has been removed. Audio is now streamed in
 * real time to the backend via the WebSocket gateway at /api/voice/stream. This class is kept
 * as a no-op shell so that existing call-sites in createApp / index / voice-session continue
 * to type-check without modification.
 */
export class VoiceTranscriptionService {
  async initialize(): Promise<void> {}

  async shutdown(): Promise<void> {}

  async warmup(): Promise<void> {}

  async enablePersistentWarmup(): Promise<void> {}

  disablePersistentWarmup(): void {}

  beginIdleCooldown(): void {}
}
