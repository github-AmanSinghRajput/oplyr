# Repository Guidelines

## Project Structure & Module Organization
This repository is an npm workspace with apps under `apps/`. `apps/api/src` contains the local Express runtime, database helpers, and feature modules such as `features/voice` and `features/workspaces`. `apps/web/src` contains the React/Vite operator console, with UI under `containers/voice-console` and clients under `services/api`. `apps/desktop/src` holds the Electron shell. `apps/cloud-api/src` is the cloud control plane (beta leads, invites, releases, download tracking). `apps/stt` is the native Swift/CoreML speech-to-text engine (`oplyr-stt`, built with `npm run build:stt`). Supporting material lives in `docs/`; `local-models/` holds the on-device speech model downloaded at first run (gitignored).

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
TypeScript is configured in strict mode via `tsconfig.base.json`; keep new code type-safe and ESM-compatible. Follow the existing 2-space indentation and concise import style. Use `PascalCase` for React components (`VoiceConsoleContainer.tsx`), `camelCase` for functions and variables, and lowercase descriptive filenames for backend modules (`voice-session.service.ts`, `http.test.ts`). Keep API code feature-scoped under `apps/api/src/features/*`. ESLint and Prettier configs are committed (`eslint.config.mjs`, `.prettierrc.json`); run `npm run lint` and `npm run format` before committing, and `npm run build` to type-check.

## Testing Guidelines
Tests are colocated with source files and use the `*.test.ts` pattern. Prefer `node:test` with `assert/strict`, following existing tests in `apps/api/src` and `apps/web/src/containers/voice-console/lib`. Add tests for new service behavior, pure helper functions, and regressions before changing approval, voice, or workspace flows. No coverage gate is enforced, but new logic should include targeted tests.

## Commit & Pull Request Guidelines
Recent history is sparse (`Initial commit`, `Merge remote bootstrap`), so use short imperative commit subjects that describe the change clearly, for example `Add desktop API health check`. Keep commits focused and avoid mixing refactors with behavior changes. PRs should include a concise summary, affected apps (`api`, `web`, `desktop`, `cloud-api`, `stt`), commands run for verification, and screenshots or recordings for UI changes. Link related issues or product docs when relevant.

## Security & Configuration Tips
Review `.env.example` and `README.md` before running locally. Keep secrets and machine-specific paths out of committed files, and do not hardcode local model or database credentials in source.
