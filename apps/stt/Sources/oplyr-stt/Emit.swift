import Foundation

/// Serializes all stdout writes so concurrent callers (main read loop + the detached
/// partials task) can't interleave bytes and corrupt JSON lines.
private let emitQueue = DispatchQueue(label: "oplyr.emit")

/// Write one JSON object per line to stdout, flushed immediately (matches the old Python worker).
func emit(_ payload: [String: Any]) {
  guard let data = try? JSONSerialization.data(withJSONObject: payload),
        var line = String(data: data, encoding: .utf8) else { return }
  line += "\n"
  emitQueue.sync { FileHandle.standardOutput.write(Data(line.utf8)) }
}

/// Diagnostic logging goes to stderr (the gateway logs it; it is never parsed as protocol).
func logErr(_ s: String) { FileHandle.standardError.write(Data((s + "\n").utf8)) }

/// FluidAudio/CoreML ANE requires Apple Silicon. Fail loudly and early on Intel.
func requireAppleSilicon() {
  #if arch(arm64)
  return
  #else
  emit(["type": "error", "message": "Oplyr speech requires an Apple Silicon Mac."])
  exit(1)
  #endif
}
