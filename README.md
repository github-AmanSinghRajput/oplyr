# Oplyr

> A desktop-first, voice-native AI coding workspace for macOS.

Oplyr lets you talk (or type) to AI coding providers, work inside an explicit
project boundary, and approve every file change before it is written. It
orchestrates provider CLIs you already use — Codex and Claude Code today, with
Gemini coming soon — without taking custody of their credentials. Speech runs
fully on-device on the Apple Neural Engine, and the coding runtime stays local
to your machine.

Oplyr is desktop-first. The browser shell in this repo is useful for
development, but it is not the intended public product surface.

## Key features

- **Voice-native, text-mandatory.** Speak naturally to a coding assistant and
  see the conversation as live text. Switch to typing whenever you prefer.
- **Multi-provider.** Run against OpenAI Codex or Anthropic Claude Code via
  their own CLIs and accounts. Gemini support is coming soon. Oplyr manages
  app-level connection state and preferences only — provider credentials stay
  with the provider CLI.
- **Approval-gated edits.** The AI proposes changes; you review a GitHub-style
  diff and approve or reject before anything is written. Read-only by default.
- **On-device speech + privacy.** Speech-to-text runs natively on the Apple
  Neural Engine — no audio leaves your machine for transcription.
- **Local-first runtime.** The runtime executes against your machine and repo
  locally. Oplyr does not upload your repo to its servers. (Provider CLIs may
  talk to their own clouds under your accounts.)

## Requirements

- **macOS 14+ on Apple Silicon.** The native speech engine is Apple Silicon
  only; there is no fallback engine.
- **Node.js with npm 11.5.1** (pinned via `packageManager` in `package.json`).
  No `engines` field is enforced; a current Node LTS is recommended.
- **Xcode command-line tools / Swift toolchain**, to build the native
  `oplyr-stt` speech binary.
- **Provider CLIs installed and authenticated.** At least one of:
  - [Codex CLI](https://github.com/openai/codex) (`codex`)
  - [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) (`claude`)

  Oplyr invokes these CLIs directly, so authentication is handled through each
  CLI under your own account.

## Quick start

Run everything from the repository root.

```bash
# 1. Install workspace dependencies
npm install

# 2. Build the native speech engine (macOS only)
npm run build:stt        # → apps/stt/.build/release/oplyr-stt

# 3. Configure environment (all values are optional with sane defaults)
cp .env.example .env

# 4. Start the runtime API (:8787) and web renderer (:5173) together
npm run dev
```

Then open <http://localhost:5173>.

To run the packaged desktop experience instead (Electron shell + renderer, with
Electron managing the local API runtime):

```bash
npm run dev:desktop
```

**Providers** authenticate through their own CLIs. Install `codex` and/or
`claude`, sign in via each tool, and make sure they are on your `PATH` (override
the binary names with `CODEX_COMMAND` / `CLAUDE_COMMAND` if needed). Oplyr never
stores or copies provider credentials.

**Speech model** is downloaded and cached on first run (the bootstrap loader
shows progress) into the gitignored `local-models/` directory; building the
binary does not download it.

## Architecture

Oplyr is an npm-workspaces monorepo. Five workspaces under `apps/`:

| Workspace | Path | Role |
| --- | --- | --- |
| `@oplyr/runtime` | `apps/api` | Local Express runtime: provider execution, voice orchestration, approvals/diffs, SQLite persistence. |
| `@oplyr/web` | `apps/web` | React 19 + Vite operator console (renderer). |
| `@oplyr/desktop` | `apps/desktop` | Electron shell for the packaged macOS app. |
| `@oplyr/cloud-api` | `apps/cloud-api` | Cloud control plane: beta leads, invites, releases, install tracking, feedback (Postgres). |
| `oplyr-stt` | `apps/stt` | Native Swift / CoreML speech-to-text engine. |

The product splits into two layers. The **local runtime** runs on the user's
Mac and owns provider execution, file/workspace access, voice capture,
approvals, and the desktop UI — it is intentionally never cloud-hosted. The
**cloud control plane** owns the website/download flow, beta access, release
manifests, and feedback.

### Speech engine

Oplyr uses **Parakeet v3** (multilingual) as its single local STT engine,
running natively on the **Apple Neural Engine via CoreML**. The engine is a
small Swift binary, `oplyr-stt`, built from `apps/stt/` with SwiftPM and
depending on [FluidAudio](https://github.com/FluidInference/FluidAudio). There
is **no Python, no MLX, and no venv**, and **no fallback engine** — if the
engine fails, Oplyr surfaces an error and logs the real cause.

The runtime auto-detects the binary at `apps/stt/.build/release/oplyr-stt`.
Override the path with `OPLYR_STT_BINARY` and the model version with
`SPEECH_MODEL_VERSION` (default `v3`) if needed.

Text-to-speech is intentionally deferred; replies are text for now.

## Scripts

Common scripts from `package.json` (run from the repo root):

```bash
npm run dev            # Runtime API (:8787) + web renderer (:5173)
npm run dev:desktop    # Web renderer + Electron shell
npm run build          # Build STT binary + all workspaces
npm run build:stt      # Build the native oplyr-stt speech binary (macOS only)

npm run dev:runtime    # Runtime API only
npm run dev:cloud      # Cloud control plane only

npm run test:runtime   # Runtime tests (Node native test runner)
npm run test:cloud     # Cloud control-plane tests
npm run test:backend   # Runtime + cloud tests

npm run lint           # Lint backend + frontend
npm run format         # Prettier write across the repo
npm run typecheck:backend
npm run check          # Full gate: format check + lint + typecheck + tests

# Database migrations
npm run db:migrate:runtime   # local SQLite
npm run db:migrate:cloud     # cloud Postgres
```

Most scripts have per-layer variants (`:runtime`, `:cloud`, `:backend`,
`:frontend`); see `package.json` for the full list.

## Configuration

Copy `.env.example` to `.env`. The file documents the full environment surface
and is the source of truth.

Every value is **optional** with sensible defaults, except
`CLOUD_DATABASE_URL`, which is **required only when running the cloud control
plane with `APP_ENV=production`**. Runtime config is validated in
`apps/api/src/config/env.ts` and cloud config in
`apps/cloud-api/src/config/env.ts`.

Notable variables:

- `CODEX_COMMAND` / `CLAUDE_COMMAND` / `GEMINI_COMMAND` — provider CLI binary
  names or absolute paths (`GEMINI_COMMAND` is for the upcoming Gemini provider).
- `ALLOWED_WORKSPACE_ROOTS` — absolute paths the AI may work in (defaults to
  `$HOME`).
- `OPLYR_STT_BINARY` / `SPEECH_MODEL_VERSION` — native speech engine overrides.
- `LOCAL_API_AUTH_TOKEN` — per-install local API auth token.

## Contributing

Oplyr is beta software under active hardening. Before contributing, read:

- [`AGENTS.md`](AGENTS.md) — repository guidelines, structure, and conventions.
- [`CLAUDE.md`](CLAUDE.md) — architecture overview and key patterns.
- [`docs/PRODUCT_GUIDE.md`](docs/PRODUCT_GUIDE.md) — product truth and direction.

Run `npm run check` before opening a pull request.
