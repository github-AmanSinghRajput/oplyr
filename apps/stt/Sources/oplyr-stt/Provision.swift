import Foundation
import FluidAudio

/// Thread-safe last-emitted percent. The progress handler is `@Sendable` and may
/// be called on an arbitrary queue, so we guard the de-dup counter with a lock.
private final class PercentGate: @unchecked Sendable {
  private let lock = NSLock()
  private var last = 0
  /// Returns the new percent if it advanced past the previous one, else nil.
  func advance(to pct: Int) -> Int? {
    lock.lock(); defer { lock.unlock() }
    guard pct > last else { return nil }
    last = pct
    return pct
  }
}

func runProvision() async throws {
  // PROGRESS PATH: FluidAudio's `AsrModels.downloadAndLoad` exposes a real progress
  // hook (`progressHandler: DownloadUtils.ProgressHandler?`, where DownloadProgress
  // carries `fractionCompleted: Double` in [0,1]). We wire it to emit integer-percent
  // progress. The handler may be invoked on an arbitrary queue, so the de-dup counter
  // is guarded by a lock (PercentGate) and writes go straight to stdout via `emit`.
  emit(["type": "progress", "pct": 0, "stage": "speech"])
  let gate = PercentGate()
  _ = try await AsrModels.downloadAndLoad(version: .v3) { progress in
    let pct = max(0, min(100, Int(progress.fractionCompleted * 100)))
    if let next = gate.advance(to: pct) {
      emit(["type": "progress", "pct": next, "stage": "speech"])
    }
  }
  emit(["type": "progress", "pct": 100, "stage": "speech"])
  emit(["type": "done"])
}

/// Fetch ONLY the CTC keyword-spotter model, which keyterm biasing needs alongside the ASR model
/// (`configureVocabularyBoosting` takes `CtcModels` non-optionally — there is no TDT-only path).
///
/// Kept separate from `runProvision` so it never blocks the app. Dictation works fine without it:
/// missing it costs accuracy on project-specific words, not the ability to speak. So the runtime
/// runs this in the background after voice is already usable, and `StreamWorker` reads the cache
/// without ever downloading.
/// Relative download weight of each CTC model, in the order they are fetched: the mel-spectrogram
/// front-end is well under a megabyte, the audio encoder is ~97MB. An even split would jump the bar
/// to 50% within a second and then crawl for two minutes.
private let refinementModelWeights: [Double] = [0.03, 0.97]

/// Download the refinement models with real byte-level progress.
///
/// `CtcModels.downloadAndLoad` takes no progress handler, but the `DownloadUtils.loadModels` it
/// calls does, so this mirrors its (short, entirely public) body and passes one through. Watching the
/// cache directory grow instead does not work here: files are moved into place only once complete,
/// and this bundle is essentially one 97MB file, so the bar reported 0 then 98 with nothing between.
///
/// The caller verifies the result and falls back to the library's own method, so if FluidAudio ever
/// changes which files it fetches this degrades to the previous behaviour rather than breaking.
private func downloadRefinementWithProgress(gate: PercentGate) async throws -> URL {
  let target = CtcModels.defaultCacheDirectory(for: .ctc110m)
  let parent = target.deletingLastPathComponent()
  let names = [ModelNames.CTC.melSpectrogramPath, ModelNames.CTC.audioEncoderPath]

  var completed = 0.0
  for (index, name) in names.enumerated() {
    let share =
      index < refinementModelWeights.count
      ? refinementModelWeights[index] : 1.0 / Double(names.count)
    let base = completed

    _ = try await DownloadUtils.loadModels(
      CtcModelVariant.ctc110m.repo,
      modelNames: [name],
      directory: parent,
      progressHandler: { progress in
        // Cap at 99: the last percent covers compiling and loading, which follow the transfer.
        let pct = min(99, Int((base + progress.fractionCompleted * share) * 100))
        if let next = gate.advance(to: pct) {
          emit(["type": "progress", "pct": next, "stage": "refinement"])
        }
      })

    completed += share
  }

  return target
}

func runProvisionRefinement() async throws {
  emit(["type": "progress", "pct": 0, "stage": "refinement"])
  let gate = PercentGate()
  let target = CtcModels.defaultCacheDirectory(for: .ctc110m)

  do {
    if !CtcModels.modelsExist(at: target) {
      _ = try await downloadRefinementWithProgress(gate: gate)

      // If the mirrored file list ever drifts from FluidAudio's, let the library finish the job.
      if !CtcModels.modelsExist(at: target) {
        logErr("refinement download incomplete after progress path, deferring to FluidAudio")
        _ = try await CtcModels.download(variant: .ctc110m)
      }
    }
    _ = try await CtcModels.load(from: target, variant: .ctc110m)
  } catch {
    // Self-heal an interrupted previous run.
    //
    // A CoreML model is a `.mlmodelc` DIRECTORY assembled file by file. Individual files land
    // atomically (temp → validated → moved), but the bundle does not, so a quit or crash midway
    // leaves the directory present and incomplete. `modelsExist` only checks that the directory
    // exists, so the next download short-circuits on it and the load fails — permanently, on every
    // launch, because nothing ever clears the half-written bundle.
    //
    // `force: true` deletes the target and re-fetches, turning that permanent failure into a
    // one-launch delay. Nobody has to be told, and there is nothing to retry by hand.
    logErr("refinement model unusable, re-downloading from scratch: \(error)")
    _ = try await CtcModels.download(variant: .ctc110m, force: true)
    _ = try await CtcModels.load(from: target, variant: .ctc110m)
  }

  emit(["type": "progress", "pct": 100, "stage": "refinement"])
  emit(["type": "done"])
}
