# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Oplyr — a desktop-first, voice-native AI coding workspace. Users talk to Codex or Claude Code via voice or text, work inside an explicit project boundary, and approve file changes before execution.

## Commands

```bash
# Full stack (API on :8787, Web on :5173)
npm run dev

# Individual apps
npm run dev --workspace @oplyr/runtime
npm run dev --workspace @oplyr/web

# Build
npm run build

# Tests (Node.js native test runner)
npm run test --workspace @oplyr/runtime
npm run test --workspace @oplyr/web

# Database
npm run db:migrate --workspace @oplyr/runtime
npm run db:ready --workspace @oplyr/runtime
```

## Environment

Copy `.env.example` to `.env`. The local runtime uses embedded SQLite via `RUNTIME_DATABASE_PATH`; the cloud control plane uses Postgres via `CLOUD_DATABASE_URL`. Runtime config is validated in `apps/api/src/config/env.ts`, and cloud config is validated in `apps/cloud-api/src/config/env.ts`.

## Architecture

**Monorepo** with npm workspaces (`@oplyr/runtime`, `@oplyr/cloud-api`, `@oplyr/web`, `@oplyr/desktop`) and local speech runtimes.

### Backend (`apps/api`)

- **Entry**: `src/index.ts` → validates env, calls `src/app/createApp.ts` (Express app factory, all routes + middleware)
- **Feature modules** in `src/features/` — each has service + repository layers: `auth`, `users`, `workspaces`, `chat`, `voice`, `notes`, `system`, `approvals`
- **Codex integration**: `src/codex-client.ts` — wraps CLI commands (`codex exec`) with sandbox modes (`read-only` / `workspace-write`), manages conversation context (last 12 messages), enforces secret policy
- **Claude integration**: `src/claude-client.ts` — wraps Claude Code CLI execution and activity streaming
- **STT**: `src/features/voice/transcription.service.ts` — single local provider (Parakeet v3 on the Apple Neural Engine via the native `oplyr-stt` binary / FluidAudio CoreML, no fallback, no Python). The binary lives at `apps/stt/` (SwiftPM); the runtime resolves and spawns it via `runtime-paths.ts`. It speaks framed stdin / JSON-line stdout (see `docs/superpowers/plans/2026-06-14-native-coreml-stt.md`).
- **Lazy voice runtime**: the `oplyr-stt` worker is spawned on voice session start (per WebSocket connection) and torn down when the socket closes — not kept resident at all times
- **Runtime state**: `src/runtime.ts` — in-memory singleton (`runtimeState`) holding workspace, pendingApproval, lastDiff, audio, voiceSession state
- **Shared libs**: `src/lib/` — logger (structured JSON), AppError class, Express helpers (asyncHandler, validators), EventBus (SSE), rate limiter
- **Database**: `src/db/client.ts` embeds SQLite for local runtime data, with migrations in `database/sqlite/`

### Cloud control plane (`apps/cloud-api`)

- **Entry**: `src/index.ts` → validates env, calls `src/app/createApp.ts`
- **Responsibilities**: beta leads, invite validation, releases, download tracking, install registration, feedback
- **Database**: Postgres via `src/db/client.ts`, with migrations in `database/postgres/`

### Frontend (`apps/web`)

- **Single-container pattern**: `src/containers/voice-console/VoiceConsoleContainer.tsx` orchestrates all screens (Voice, Terminal, Review, Workspace, Onboarding, Memory, Settings)
- **Screen components** in `src/containers/voice-console/components/`
- **API service layer**: `src/services/api/` — `BaseApiService` (fetch wrapper) extended by `OperatorConsoleApiService` (typed methods for all endpoints)
- **Shared types/helpers**: `src/containers/voice-console/lib/` (types.ts, constants.ts, helpers.ts, diff.ts)
- **Styling**: Custom CSS with design tokens in `src/styles.css` — Space Grotesk (body) + JetBrains Mono (code), no Tailwind. Custom properties for colors, surfaces, spacing
- **State**: Component-local useState, localStorage for preferences, renderer-driven mic capture with desktop event/status updates
- **Build**: Vite + React 19, strict TypeScript

## Key Patterns

- **Approval flow**: Chat service detects write intent via Codex → creates pendingApproval → frontend shows diff review → user approves/rejects → approved writes execute with `--sandbox workspace-write`
- **SSE for real-time**: EventBus in `src/lib/event-bus.ts` pushes voice state and chat updates to frontend via `/api/voice/events`
- **Secret policy**: Hardcoded patterns in `runtime.ts` block access to .env, *.pem, *.key, .aws/, .npmrc, .docker/ etc.
- **Strict TypeScript**: `tsconfig.base.json` with `strict: true`, ES2022 target, ESNext modules, Bundler resolution. API emits JS to `dist/`; web uses Vite (no emit)

## Known Issues

- The product direction has pivoted to a desktop-first Electron app distributed via DMG. Browser-based development remains the fastest shell, but it is no longer the public runtime target.
- Desktop STT uses renderer mic capture plus a single local engine: Parakeet v3 (`parakeet-tdt-0.6b-v3`) running natively on the Apple Neural Engine via the `oplyr-stt` Swift binary (FluidAudio CoreML). There is no fallback — a failure surfaces a generic "Something went wrong" to the user and logs the real error to the server console. Apple Silicon only.
- The STT engine is native Swift/CoreML — no Python, no MLX, no venv (this removed the previous `parakeet-mlx` worker). The `native/` Apple Speech bridge, Moonshine, whisper.cpp, and the AssemblyAI fallback were all removed earlier in favor of Parakeet-only STT.
