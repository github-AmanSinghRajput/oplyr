# Repository Guidelines

## Project Structure & Module Organization

This repository is an npm workspace with four apps under `apps/`. `apps/api/src` contains the local Express runtime, database helpers, and feature modules under `features/` (`brain`, `chat`, `providers`, `voice`, `workspaces`, …). `apps/web/src` contains the React/Vite renderer: `components/layout/AppShell.tsx` is the shell, screens live under `components/screens/`, cross-screen state under `providers/`, hooks under `hooks/`, and API clients under `services/api/`. `apps/desktop/src` holds the Electron shell. `apps/stt` is the native Swift/CoreML speech-to-text engine (`oplyr-stt`, built with `npm run build:stt`). Supporting material lives in `docs/`; `local-models/` holds the on-device speech model downloaded at first run (gitignored).

## Build, Test, and Development Commands

Run commands from the repository root unless noted otherwise.

- `npm run dev`: starts the API and web app together.
- `npm run dev:desktop`: builds the desktop shell, starts Vite, then launches Electron.
- `npm run build`: type-checks and builds all workspaces.
- `npm run start`: runs the built API and previews the built web app.
- `npm run test --workspace @oplyr/runtime`: runs backend `node:test` suites.
- `npm run test --workspace @oplyr/web`: runs frontend `node:test` suites.
- `npm run db:migrate --workspace @oplyr/runtime`: applies local database migrations.

## Coding Style & Naming Conventions

TypeScript is configured in strict mode via `tsconfig.base.json`; keep new code type-safe and ESM-compatible. Follow the existing 2-space indentation and concise import style. Use `PascalCase` for React components (`AppShell.tsx`, `PetCompanion.tsx`), `camelCase` for functions and variables, and lowercase descriptive filenames for backend modules and non-component frontend files (`voice-session.service.ts`, `pet-behaviour.ts`, `http.test.ts`). Keep API code feature-scoped under `apps/api/src/features/*`. Styling is Tailwind v4 with tokens in an `@theme` block in `apps/web/src/app.css` — a token `--radius-panel` yields `rounded-panel`, so `rounded-radius-panel` silently emits nothing. ESLint and Prettier configs are committed (`eslint.config.mjs`, `.prettierrc.json`).

## Testing Guidelines

Tests are colocated with source files and use the `*.test.ts` pattern. Prefer `node:test` with `assert/strict`, following existing tests in `apps/api/src` and `apps/web/src/containers/voice-console/lib`. Add tests for new service behavior, pure helper functions, and regressions before changing approval, voice, or workspace flows. No coverage gate is enforced, but new logic should include targeted tests.

Run the full gate before handing work back — `npm run format` first (or `format:check` fails), then `npm run check`, which is format-check + lint + typecheck + tests across backend and frontend. Backend lint runs at `--max-warnings=0`.

## Commit & Pull Request Guidelines

Use Conventional Commit subjects, matching existing history: `feat:`, `fix:`, `chore:` and a short imperative description (e.g. `fix: scope provider usage to the active agent`). Keep commits focused and avoid mixing refactors with behavior changes. PRs should include a concise summary, affected apps (`api`, `web`, `desktop`, `stt`), commands run for verification, and screenshots or recordings for UI changes. Link related issues or product docs when relevant.

Releases are versioned in lockstep across all four workspaces (`npm version <x.y.z> --workspaces --include-workspace-root --no-git-tag-version`) and recorded in `docs/releases/CHANGELOG.md`. `docs/DISTRIBUTION.md` holds the build/sign/notarize runbook.

## Security & Configuration Tips

Review `.env.example` and `README.md` before running locally. Keep secrets and machine-specific paths out of committed files, and do not hardcode local model or database credentials in source.
