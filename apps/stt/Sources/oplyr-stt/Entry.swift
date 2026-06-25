import Foundation

// NOTE: This file would be `main.swift` per the plan, but Swift forbids `@main`
// in a file literally named `main.swift`. Renamed to `Entry.swift` per the task
// instructions; the `@main struct Main` is unchanged.
@main
struct Main {
  static func main() async {
    requireAppleSilicon()  // defined in Emit.swift (Task 2)
    let args = Array(CommandLine.arguments.dropFirst())
    do {
      if args.contains("--provision") {
        try await runProvision()      // Provision.swift (Task 5)
      } else {
        try await runStreamWorker()   // StreamWorker.swift (Tasks 3-4)
      }
    } catch {
      emit(["type": "error", "message": "\(error)"])
      exit(1)
    }
  }
}
