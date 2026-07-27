# Changelog

All notable changes to Oplyr, newest first. Dates are IST (Asia/Kolkata). Versions follow the
`apps/desktop/package.json` version that ships in each DMG/zip. See
[`README.md`](./README.md) for how we cut and record a release, and
[`../DISTRIBUTION.md`](../DISTRIBUTION.md) for the build/notarize/ship commands.

Format loosely follows [Keep a Changelog](https://keepachangelog.com/): **Added / Changed / Fixed**.

---

## 0.3.1 — 2026-07-27

**Fixed**
- **Provider usage loads with a single agent connected.** Codex on its own no longer shows "failed to
  fetch" — the first cold `/status` read is retried so the meters land, so you don't need to connect a
  second agent to see usage.
- **Usage meters sit centered** in the top bar instead of overlapping the provider dropdown.

**Changed**
- **Packaging:** native build intermediates (`*.o` / `*.a`) are excluded from the app bundle — fixes a
  codesign timestamp failure during the zip step and trims the download by a few MB.

---

## 0.3.0 — 2026-07-26

**Added**
- **Agentic Chat — multi-agent room (B1).** `@mention` connected agents (`@codex`, `@claude`) to
  address them in one turn; they reply in sequence, each seeing the prior replies so they can agree
  or flag issues. Human-conducted. `@`-autocomplete in the composer; every reply is labeled with its
  agent and captured to the Brain with that attribution. No mention → the topbar's active agent.
- **Per-project chat history** — each connected folder keeps its own conversation; the Brain stays global.
- **Explicit cross-project recall** — naming a past project (or "recall/previously/…") surfaces its
  memories across the strict cross-project bar.
- **Clear chat** (keeps the Brain) on the Workspace screen.

**Changed**
- **Agent responses now render like a proper chat UI** (chat *and* voice) — automatic language
  detection with full syntax highlighting for every language, one clean code card (language label +
  copy button), colored `diff` blocks, and consistent spacing. Fixes a doubled code box, a stray
  "hljs" language label, and colorless code.
- **Wider provider usage meters** in the top bar — the Codex and Claude Code rate-limit windows are
  easier to read at a glance.

**Fixed**
- **Stop actually aborts the agent** — the write/edit path now receives the abort signal and kills the
  running codex/claude process (previously only the streaming reply path stopped). Voice gained a stop
  control too.
- **Chat scroll** — the top bar and the message composer stay fixed; only the conversation between
  them scrolls (no more page-plus-chat double scrollbar).
- **Code-block copy** now copies the real code. It was writing highlighter placeholder text
  (`[object Object]…`) to the clipboard, which is also why pasting it into the composer produced nothing.
- **Composer auto-grows** as you type — up to a max height, then it scrolls inside — and resyncs its
  height after send, paste, and `@mention` insertion.

---

## 0.2.2 — 2026-07-18

**Added**
- Welcome greeting on every fresh app start — a warm, randomly-chosen multilingual "hello" (28
  languages) inked on in a handwriting animation, then it fades. Also doubles as a boot cover.
- Selectable desk pets — duck, bird, frog, cat, dog — chosen in onboarding and changeable in Settings.
- Connect **any** folder, not just Git repos. Multi-repo workspaces are auto-detected and the Codebase
  Map lets you pick which repo to view.

**Changed**
- Codebase Map: centered title + project picker; when a workspace has multiple repos and none is
  selected, it shows a "choose a project" prompt instead of a blank canvas.
- Voice screen: consolidated to a single waveform visualizer (removed the redundant frequency strip).
- Cat and dog desk pets redrawn as proper four-legged walkers.

**Fixed**
- "Oplyr quit unexpectedly" crash on deliberate quit — the forked API is now shut down cleanly before
  the app exits (SIGTERM + wait, SIGKILL fallback).
- Brief onboarding / model-download flash when reopening the app (a boot cover holds until the app
  resolves where the user is headed).
- Content clipped with no way to scroll in a small/cropped window — onboarding and voice-bootstrap
  screens now scroll.
- Desk-pet selection didn't persist — `deskPet` was being dropped at the settings API route.

---

## 0.2.1 — 2026-07-16

**Added**
- One-tap full refresh in the top bar — re-pulls status, chats, brain/memory, and usage together.

**Changed**
- Default model is highlighted in the model picker; per-model reasoning effort.
- Nicer markdown rendering across chat and the docs browser.

**Fixed**
- Brain now records memories reliably (removed the missing-project gate; skip reasons are logged).
- Stale model lists after switching agents; models auto-refresh per provider.
- Packaged-app startup crash (`node-pty` was missing from the bundled resources).

_Validated end-to-end auto-update: an installed 0.2.0 pulled and applied 0.2.1._

---

## 0.2.0 — 2026-07-16

- First **signed + notarized** build with automatic updates (electron-updater).
- Reliable voice — the mic no longer drops after a few turns.
- Agents act in one turn — a request lands straight in the diff, no second confirmation.
- Pick a model and its reasoning effort per agent, from the toolbar or Settings.
- Rebuilt Brain canvas — memories cluster by type on a fluid, draggable graph.
- Reset wipes everything, including the Brain, for a truly fresh start.
