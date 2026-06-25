# oplyr-stt
Native CoreML STT engine for Oplyr (Parakeet v3 on the Apple Neural Engine via FluidAudio).
Replaces the old Python/MLX worker. Speaks framed stdin / JSON-line stdout (see the plan doc).

Build: `swift build -c release`  → `.build/release/oplyr-stt`
Run (worker): `oplyr-stt`        (reads audio frames on stdin)
Run (download): `oplyr-stt --provision`
