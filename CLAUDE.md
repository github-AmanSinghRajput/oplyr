# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Oplyr — a desktop-first, voice-native **multi-agent developer workspace** ("cockpit"). Users connect coding agents (Codex, Claude Code, soon Gemini) and direct them by voice or text, working inside an explicit project boundary with reviewable diffs/approvals, a live codebase map, and a markdown docs browser. Local-first and approval-gated by design.

Two turn shapes exist:

- **Single-agent** (no `@mention`) — the turn runs on the **active** agent, switchable mid-session from the Topbar. This is the only path that can propose file writes.
- **Multi-agent room** (`@mention`) — each mentioned connected agent replies in sequence, seeing the replies before it. **Reply-only**: the room cannot write files.

A shared local memory (the "brain") is live — an on-device SQLite store written to by every agent, with semantic recall over locally-computed embeddings. Still planned: Gemini support, and meetings/notes.

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

**Before handing work back, run the gate:**

```bash
npm run format      # prettier --write; run this FIRST or format:check fails the gate
npm run check       # format:check + lint + typecheck + tests, backend then frontend
```

`check` is strict: backend lint is `--max-warnings=0`, frontend `--max-warnings=25`. Backend tests need a `better-sqlite3` binding matching the running Node — the `pretest` preflight handles that (see Constraints below).

## Environment

Copy `.env.example` to `.env`. The local runtime uses embedded SQLite via `RUNTIME_DATABASE_PATH`. Runtime config is validated in `apps/api/src/config/env.ts`.

> **Note:** The public control plane (beta leads, invite validation, releases, download tracking, feedback) lives in the separate `vocod-website` repo (Next.js + Vercel Postgres). It is not part of this product repo.

## Architecture

**Monorepo** with npm workspaces (`@oplyr/runtime`, `@oplyr/web`, `@oplyr/desktop`) and local speech runtimes.

### Backend (`apps/api`)

- **Entry**: `src/index.ts` → validates env, calls `src/app/createApp.ts` (Express app factory, all routes + middleware)
- **Feature modules** in `src/features/` — most have service + repository layers: `app`, `approvals`, `auth`, `brain`, `chat`, `claude`, `codebase-map`, `codex`, `gemini`, `markdown`, `providers`, `system`, `users`, `voice`, `workspaces`
- **Brain (shared memory)**: `src/features/brain/` — SQLite at `brain.db`, migrations in `database/brain/`, applied by `brain-client.ts`. Recall is **brute-force cosine** over embeddings stored as Float32 blobs (`brain-vectors.ts`, `brain-recall.ts`), falling back to keyword overlap for un-embedded atoms. `sqlite-vec` is deliberately **not** used — it's a speed upgrade only needed at much larger memory sizes, and it is not a dependency. Don't document it as if it were. Distillation writes memories per agent; `brain-import.service.ts` ingests existing agent context files (`AGENTS.md`, `CLAUDE.md`, …) with a content-hash ledger so re-imports are idempotent.
- **Provider usage**: `src/features/providers/` — live limits scraped from each CLI (`provider-cli-source.service.ts` drives a pty). Codex defers its limits on the first `/status` after launch, so the scrape must wait for the limit lines and ask again.
- **Codex integration**: `src/codex-client.ts` — wraps CLI commands (`codex exec`) with sandbox modes (`read-only` / `workspace-write`), manages conversation context (last 12 messages), enforces secret policy
- **Claude integration**: `src/claude-client.ts` — wraps Claude Code CLI execution and activity streaming
- **STT**: `src/features/voice/transcription.service.ts` — single local provider (Parakeet v3 on the Apple Neural Engine via the native `oplyr-stt` binary / FluidAudio CoreML, no fallback, no Python). The binary lives at `apps/stt/` (SwiftPM); the runtime resolves and spawns it via `runtime-paths.ts`. It speaks framed stdin / JSON-line stdout.
- **Lazy voice runtime**: the `oplyr-stt` worker is spawned on voice session start (per WebSocket connection) and torn down when the socket closes — not kept resident at all times
- **Runtime state**: `src/runtime.ts` — in-memory singleton (`runtimeState`) holding workspace, pendingApproval, lastDiff, audio, voiceSession state
- **Shared libs**: `src/lib/` — logger (structured JSON), AppError class, Express helpers (asyncHandler, validators), EventBus (SSE), rate limiter
- **Database**: `src/db/client.ts` embeds SQLite for local runtime data, with migrations in `database/sqlite/`

### Frontend (`apps/web`)

- **Shell**: `src/components/layout/AppShell.tsx` orchestrates everything — it reads `activeScreen` from `NavigationProvider` and switches on it. Screens are lazy-loaded. `Topbar` / `Sidebar` live alongside it.
- **Screens**: `src/components/screens/` (Chat, Voice, Review, Workspace, Onboarding, Settings, Memory, CodebaseMap, Markdown, Meetings), with per-screen subfolders for their own parts (`screens/memory/`, `screens/codebase-map/`).
- **Other component groups**: `src/components/` — `ui` (primitives), `chat`, `voice`, `review`, `providers` (agent logos, model pickers, connect modal), `pets` (desk companions), `tour`, `branding`.
- **Cross-screen state**: React context under `src/providers/` — `Status`, `Navigation`, `Api`, `Approval`, `MemoryImport`, `Theme`, `Toast`, `Tour`. Anything two screens must agree on belongs in a provider, not in props.
- **Hooks**: `src/hooks/` — notably `use-app-settings.ts` (settings + onboarding step machine + provider usage) and `use-voice-session.ts`.
- **API service layer**: `src/services/api/` — `BaseApiService` (fetch wrapper) extended by `OperatorConsoleApiService` (typed methods for all endpoints).
- **Shared types/helpers**: `src/containers/voice-console/lib/` — this folder now holds _only_ `lib` (types.ts, constants.ts, helpers.ts, diff.ts). There is no container component; don't look for one.
- **Styling**: **Tailwind v4, CSS-first.** `src/app.css` does `@import 'tailwindcss'` and defines the design tokens in an `@theme` block (`--radius-panel`, `--radius-control`, colors, surfaces). Fonts are Geist Sans + Geist Mono, self-hosted from `src/assets/fonts/`.
  - **Gotcha:** an `@theme` token named `--radius-panel` generates the class `rounded-panel`, _not_ `rounded-radius-panel`. Writing the latter emits nothing and silently renders square corners — this shipped once. For an arbitrary value use `rounded-[var(--radius-panel)]`.
  - **Density rule — one signal, not three.** A surface is either **filled** or **outlined**, never both. Around 50 elements still set `bg-surface-*` _and_ `border border-border`, which is most of why the app reads heavier than Claude Code or Codex desktop: every element announces itself with fill + border + radius + padding + an icon. Prefer a fill on raised things, a border on flat/inline things. The radius scale is deliberately tight (panel 12px, control 8px) — the type scale is already small (`text-xs`/`text-sm` carry the app), so large corners were what made it look zoomed in, not the font.
- **State**: component-local `useState` plus the providers above; `localStorage` for preferences; renderer-driven mic capture with desktop event/status updates.
- **Build**: Vite + React 19, strict TypeScript.

## Key Patterns

- **Approval flow**: Chat service detects write intent via Codex → creates pendingApproval → frontend shows diff review → user approves/rejects → approved writes execute with `--sandbox workspace-write`
- **Real-time transports**: voice uses a **WebSocket**; chat replies stream as **NDJSON** over `fetch` (`streamMessage`). The `EventBus` (`src/lib/event-bus.ts`) powers a separate **SSE** stream at `/api/voice/events` — consumed by the Memory screen (via `streamAppEvents`) for `brain_update` events. Don't assume the frontend reads voice/chat over that SSE stream; it doesn't.
- **Secret policy**: Hardcoded patterns in `runtime.ts` block access to .env, _.pem, _.key, .aws/, .npmrc, .docker/ etc.
- **Strict TypeScript**: `tsconfig.base.json` with `strict: true`, ES2022 target, ESNext modules, Bundler resolution. API emits JS to `dist/`; web uses Vite (no emit)

## Constraints & gotchas

- **Desktop is the product.** The browser shell is the fastest way to develop, but it is not the public runtime target — the shipped artifact is a signed, notarized DMG.
- **STT is Apple Silicon only, with no fallback.** Renderer mic capture into a single native engine: Parakeet v3 (`parakeet-tdt-0.6b-v3`) on the Apple Neural Engine via the `oplyr-stt` Swift binary (FluidAudio CoreML). A failure surfaces a generic "Something went wrong" and logs the real error to the server console. No Python, no MLX, no TTS.
- **`better-sqlite3` ABI flip-flops.** Packaging rebuilds it for Electron's ABI, which then breaks `dev:desktop` and the backend tests under system Node (`ERR_DLOPEN_FAILED`). `apps/api/scripts/ensure-native.mjs` runs as `predev`/`pretest` and self-heals it; after a packaging run, `npm rebuild better-sqlite3 node-pty` restores the dev tree. Don't "fix" this by pinning a version.
- **node-gyp needs Python ≤ 3.11.** node-gyp 9's bundled gyp imports `distutils`, removed in 3.12. A source build on a machine defaulting to newer Python fails; prefix with `npm_config_python=$(command -v python3.11)`.
- **Releasing has manual steps electron-builder does not do** — it signs the `.app` but not the DMG wrapper. See `docs/DISTRIBUTION.md` for the runbook; skipping the DMG codesign leaves it failing `spctl`.
