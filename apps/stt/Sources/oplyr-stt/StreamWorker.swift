import AVFoundation
import Foundation
import FluidAudio

func runStreamWorker() async throws {
  let models = try await AsrModels.downloadAndLoad(version: .v3)

  // Streaming engine for live partials (coarse, reuses v3 — per Phase B decision).
  let streamer = SlidingWindowAsrManager(config: .default)
  try await streamer.loadModels(models)
  // `.microphone` is only a label: the audio genuinely is microphone audio captured
  // upstream, but it arrives here via `streamAudio(_:)` from framed stdin, not from a
  // live AVAudioEngine input device.
  try await streamer.startStreaming(source: .microphone)

  // Batch engine for the clean final on finalize.
  let batch = AsrManager(config: .default)
  try await batch.loadModels(models)

  // Forward partials as they arrive. The subscription is renewed per utterance (after
  // each reset) so the 2nd+ utterance streams cleanly and the stale task doesn't leak.
  var partialTask = await subscribePartials(streamer)

  emit(["type": "ready"])

  let fmt = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: 16_000,
                          channels: 1, interleaved: false)!
  var fullAudio: [Float] = []   // accumulates the whole utterance for the batch final
  let reader = FrameReader()

  while let frame = reader.next() {
    switch frame.type {
    case .audio:
      let samples = pcm16ToFloat(frame.payload)
      fullAudio.append(contentsOf: samples)
      // Bounded-memory warning: fullAudio holds the whole utterance for the batch final.
      // ~9.6M samples @16k mono ≈ 10 min. Warn (don't trim) so it isn't silent.
      if fullAudio.count > 9_600_000 {
        logErr("WARNING: utterance exceeds ~10 min (\(fullAudio.count) samples)")
      }
      if let buf = makeBuffer(samples, fmt) { await streamer.streamAudio(buf) }
    case .finalize:
      try await emitFinal(fullAudio: fullAudio, batch: batch)
      fullAudio.removeAll(keepingCapacity: true)
      partialTask = try await renewPartials(partialTask, streamer)
    case .reset:
      fullAudio.removeAll(keepingCapacity: true)
      partialTask = try await renewPartials(partialTask, streamer)
    }
  }
  partialTask.cancel()
  await streamer.cleanup()
}

/// Cancel the previous partials task, reset the streamer, and re-subscribe so the next
/// utterance streams cleanly.
///
/// Ordering is load-bearing. `SlidingWindowAsrManager.transcriptionUpdates` is a computed
/// property: every access installs a fresh continuation into the actor's single
/// `updateContinuation`, and cancelling a task that's iterating an old stream fires that
/// stream's `onTermination`, which clears `updateContinuation` from a detached actor Task.
/// If we re-subscribe before that termination drains, the lagging `onTermination` nulls out
/// our brand-new continuation and the next utterance emits zero partials. So we cancel,
/// reset, let the termination handler drain (Task.yield round-trips through the actor), and
/// only then install the new subscription as the final write to `updateContinuation`.
private func renewPartials(
  _ previous: Task<Void, Never>, _ streamer: SlidingWindowAsrManager
) async throws -> Task<Void, Never> {
  previous.cancel()
  try await streamer.reset()
  // Let the cancelled stream's onTermination (which clears updateContinuation) drain
  // before we install the new continuation, so ours wins the last write.
  await Task.yield()
  _ = await streamer.source  // actor round-trip: ensures the termination Task has executed
  return await subscribePartials(streamer)
}

/// Subscribe to the streamer's partial-transcription updates and forward each as a
/// `partial` line. Called once at start and again after every reset so each utterance
/// gets a fresh subscription.
private func subscribePartials(_ streamer: SlidingWindowAsrManager) async -> Task<Void, Never> {
  let updates = await streamer.transcriptionUpdates
  return Task { for await u in updates { emit(["type": "partial", "text": u.text]) } }
}

private func makeBuffer(_ samples: [Float], _ fmt: AVAudioFormat) -> AVAudioPCMBuffer? {
  guard !samples.isEmpty,
        let buf = AVAudioPCMBuffer(pcmFormat: fmt, frameCapacity: AVAudioFrameCount(samples.count))
  else { return nil }
  buf.frameLength = AVAudioFrameCount(samples.count)
  let ch = buf.floatChannelData![0]
  for (i, s) in samples.enumerated() { ch[i] = s }
  return buf
}

private func emitFinal(fullAudio: [Float], batch: AsrManager) async throws {
  guard !fullAudio.isEmpty else { emit(["type": "final", "text": ""]); return }
  var state = try TdtDecoderState()
  let result = try await batch.transcribe(fullAudio, decoderState: &state)
  emit(["type": "final", "text": result.text])
}
