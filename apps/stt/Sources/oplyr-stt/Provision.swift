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
  emit(["type": "progress", "pct": 0])
  let gate = PercentGate()
  _ = try await AsrModels.downloadAndLoad(version: .v3) { progress in
    let pct = max(0, min(100, Int(progress.fractionCompleted * 100)))
    if let next = gate.advance(to: pct) {
      emit(["type": "progress", "pct": next])
    }
  }
  emit(["type": "progress", "pct": 100])
  emit(["type": "done"])
}
