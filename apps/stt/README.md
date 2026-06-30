# oplyr-stt
Native CoreML STT engine for Oplyr (Parakeet v3 on the Apple Neural Engine via FluidAudio).
Speaks framed stdin / JSON-line stdout (see `docs/superpowers/plans/2026-06-14-native-coreml-stt.md`).

Build: `swift build -c release`  → `.build/release/oplyr-stt`
Run (worker): `oplyr-stt`        (reads audio frames on stdin)
Run (download): `oplyr-stt --provision`
