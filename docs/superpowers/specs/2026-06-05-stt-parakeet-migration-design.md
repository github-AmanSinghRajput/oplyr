# STT Migration: Parakeet-only Local Speech Recognition

Date: 2026-06-05
Status: Approved (pending spec review)

## 1. Goal

Replace VOCOD's multi-provider STT stack (Moonshine + Whisper + AssemblyAI, with a
primary→fallback chain) with a single local provider: **NVIDIA Parakeet** running via
**`parakeet-mlx`** on Apple Silicon. There is **no fallback** — if the model fails, VOCOD
surfaces a generic error and logs the real error for debugging. Previously downloaded STT
models are deleted from disk to reclaim space.

TTS (Kokoro) is unchanged.

## 2. Decisions (locked)

- **Runtime:** `parakeet-mlx` (Python worker), mirroring the existing `moonshine_worker.py` /
  `kokoro_worker.py` warm-worker pattern. No native/Swift build (the `native/` path was
  intentionally removed).
- **Model:** `mlx-community/parakeet-tdt-0.6b-v3` (multilingual, ~25 European languages).
- **Language picker:** trimmed to v3-supported languages: `auto, en, es, fr, de, it, pt`.
  `hi` and `ja` are removed (unsupported by v3).
- **Transcription model setting:** collapsed from 4 options to a single `parakeet` model.
- **No fallback:** single provider only.
- **Error UX:** generic "Something went wrong" in the UI; the real error is printed to the
  server console (`logger.error`) and the browser console (`console.error`) for debugging.
- **Warmup loader:** reuse the existing full-screen bootstrap gate in `AppShell.tsx`; the app
  stays behind a "Warming up the speech models" loader until the runtime is fully ready.

## 3. Disk cleanup (do this FIRST, before adding Parakeet)

Delete (STT only; ~4.5 GB reclaimed):

- `local-models/whisper.cpp/` — ~4.0 GB (model weights + build + vendored source)
- `local-models/moonshine/` — ~552 MB (venv)

Keep:

- `local-models/kokoro/` — TTS, still used
- `.local/runtime.db` — local runtime data

No production user-data models directory exists yet, so nothing to clean there.

## 4. Backend changes (`apps/api`)

### 4.1 `features/voice/transcription.service.ts`
- Delete `AssemblyAiSttProvider`, `WhisperWarmServerProvider`, `MoonshineWarmWorkerProvider`,
  the `SttProvider` multi-provider registry, `getPrimaryProvider`/`getFallbackProvider`, and the
  fallback chain in `transcribeAudio`.
- Add a single `ParakeetWarmWorkerProvider` (stdin/stdout JSON worker, same lifecycle as the
  old Moonshine worker: warm on start, idle cooldown, restart on config change).
- `VoiceTranscriptionService` keeps: `warmup()`, `enablePersistentWarmup()`,
  `disablePersistentWarmup()`, `beginIdleCooldown()`, idle cooldown timer, and a single
  `transcribeAudio()`.
- `VoiceTranscriptionResult` drops `fallbackUsed` and `warnings` (no chain anymore). Keep
  `provider` + `transcript`.
- `transcribeAudio` failure path: `logger.error('voice.transcription.failed', { error })` then
  `throw new AppError(502, 'Something went wrong', 'VOICE_STT_FAILED')`.

### 4.2 `config/env.ts`
- Remove: `sttProvider`, `sttFallbackProvider`, `whisperModelPath`,
  `whisperMultilingualModelPath`, `whisperServerPort`, `moonshineWorkerCommand`,
  `moonshineModel`, `assemblyAiApiKey`, `transcriptionSpeakerLabels`.
- Add: `parakeetWorkerCommand` (`PARAKEET_WORKER_COMMAND` || default),
  `parakeetModel` (`PARAKEET_MODEL` || `mlx-community/parakeet-tdt-0.6b-v3`).
- Keep `transcriptionLanguageCode`.
- `validateEnv`: drop all old STT validation. Do **not** hard-throw on a missing
  `parakeetWorkerCommand` — first run (before models are installed) must boot so the bootstrap
  loader can install/warm them. A missing/failed worker surfaces at use time as
  `VOICE_STT_FAILED` and is reflected in the bootstrap `parakeet` step.

### 4.3 `runtime-paths.ts`
- Remove `getDefaultWhisperModelPath`, `getDefaultWhisperMultilingualModelPath`,
  `getDefaultMoonshineWorkerCommand`.
- Add `getDefaultParakeetWorkerCommand()` →
  `buildPythonWorkerCommand(resolveModelArtifact('parakeet', '.venv', 'bin', 'python'),
  resolveScriptArtifact('parakeet_worker.py'))`.

### 4.4 `scripts/parakeet_worker.py` (new) + delete `scripts/moonshine_worker.py`
- On start: `from parakeet_mlx import from_pretrained`, load `PARAKEET_MODEL`, warm on a
  generated silence WAV, emit `{"type":"ready"}`.
- Per request `{id, audio_path, language}`: convert input audio to 16 kHz mono WAV (ffmpeg —
  already a documented dep), transcribe, emit `{id, ok:true, transcript}` or
  `{id, ok:false, error}`.

### 4.5 `features/voice/voice-settings.service.ts`
- `getResolvedTranscriptionConfig()` returns Parakeet-only config
  (`{ provider: 'parakeet-local', parakeetModel, languageCode }`).
- `getTranscriptionModelOptions()` returns a single `parakeet` option.
- `getTranscriptionLanguageOptions()` trimmed to `auto, en, es, fr, de, it, pt`.
- `getVoiceProfileDefaults` / `getInitialTranscriptionModel` simplified to the single model.
- Remove `findMultilingualWhisperModelPath` and whisper/moonshine branches.

### 4.6 `features/voice/voice-bootstrap.service.ts`
- Step IDs become `kokoro | parakeet | warmup` (remove `moonshine`, `whisper`).
- `inspectAssets` checks the Parakeet venv python instead of moonshine/whisper artifacts.
- `installAssets` copies bundled `parakeet/` from seed (replaces moonshine/whisper copy logic).
- `isVoiceAssetRequired` updated for `parakeet`.

### 4.7 `types.ts`
- `transcriptionModel` type → `'parakeet'`.
- Bootstrap step id type → `'kokoro' | 'parakeet' | 'warmup'`.

## 5. Frontend changes (`apps/web`)

- `components/layout/AppShell.tsx` `VoiceBootstrapScreen`: headline/copy →
  "Warming up the speech models"; step labels updated (Kokoro voice, Parakeet speech model,
  Voice readiness probe). Gate behavior (`phase !== 'ready'`) unchanged.
- `containers/voice-console/lib/types.ts`: update bootstrap step id + transcription model types.
- `components/screens/SettingsScreen.tsx`: single Parakeet model; trimmed language list.
- Voice error handling (the voice session hook / handler): on `VOICE_STT_FAILED`, show a
  generic "Something went wrong" toast and `console.error(realError)` for debugging.

## 6. Docs + env

- `.env` and `.env.example`: remove `STT_PROVIDER`, `STT_FALLBACK_PROVIDER`, `WHISPER_*`,
  `MOONSHINE_*`, `ASSEMBLYAI_*`; add `PARAKEET_WORKER_COMMAND`, `PARAKEET_MODEL`.
- `README.md`: repository layout, env vars, local voice setup → Parakeet (`local-models/parakeet`
  venv + `pip install parakeet-mlx`), remove Moonshine/Whisper sections, note no fallback.
- `CLAUDE.md`: STT description, "Known Issues" STT bullets → Parakeet-only, no fallback.
- `PRODUCT_GUIDE.md`: replace "Moonshine STT with Whisper fallback" capability lines.
- `RELEASE_MILESTONES.md`: voice-quality checklist STT lines → Parakeet.
- `VOICE_RUNTIME_BOOTSTRAP.md`: required assets become Kokoro + Parakeet (no Moonshine/Whisper),
  step list + QA scenarios updated.

## 7. Testing

- Update `features/voice/voice-bootstrap.service.test.ts` for the new step set.
- Add a `voice-settings.service` test asserting `getResolvedTranscriptionConfig()` returns
  Parakeet config and the trimmed language list.
- Keep `node:test` + `assert/strict`. Run `npm run build` + workspace tests to verify.

## 8. Out of scope

- FluidAudio / CoreML / Neural Engine native path (explicitly deferred).
- Re-adding any cloud STT.
- Changing TTS (Kokoro) behavior.
