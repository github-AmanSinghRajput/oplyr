# Oplyr — Features

The canonical list of what Oplyr does today. Keep this in sync with the product and the website
(`vocod-website` homepage + `/download`). Items marked _Planned_ are not shipped yet.

Oplyr is a **desktop-first, voice-native, all-in-one workspace for directing AI coding agents** —
local-first and approval-gated by design.

## Direct your agents

- **Voice-native control** — speak to the active agent; your words become the request. Push-to-talk
  with an editable "review before send" transcript, or auto-send.
- **On-device speech-to-text** — Parakeet v3 on the Apple Neural Engine (FluidAudio / CoreML). Runs
  **fully offline**; no audio leaves your Mac. Apple Silicon only.
- **Text chat too** — type to the same agent; voice and text share one conversation and one turn state.
- **Multi-agent** — connect OpenAI **Codex** and **Claude Code**; switch the active agent per turn
  from the top bar without losing project memory. (Gemini: _Planned_. Multi-agent room via
  `@mention`: _Planned_.)
- **Per-agent model + reasoning effort** — pick the model and effort for each agent, from the toolbar
  or Settings; your default model is highlighted.

## Safe, reviewable edits

- **Approval-gated writes** — the agent proposes changes; you review them as a **diff** and
  approve/reject before anything is written. Approved edits run in a `workspace-write` sandbox.
- **Explicit project boundary** — Oplyr operates inside the folder you connect. Connect **any** folder
  (Git or not); multi-repo workspaces are auto-detected.
- **Secret policy** — hard-blocks access to `.env`, `*.pem`, `*.key`, `.aws/`, `.npmrc`, `.docker/`,
  and similar sensitive paths.

## Understand your codebase

- **Codebase Map — two views**: a **tree** view and a **force-directed graph**, with per-repo scoping
  in multi-repo workspaces.
- **Import/link tracing** — see which file (and function) is imported where.
- **AI summaries** — summarize what each file does, and per-function summaries on demand.
- **Function index** — list of top-level functions per file with quick summaries.

## Remember across sessions — the Brain

- **Local memory ("brain")** — an on-device SQLite + `sqlite-vec` store with semantic recall.
- **Memory across agents & sessions** — captured automatically as you work, shared between agents, and
  persisted across restarts.
- **Obsidian-like canvas** — memories cluster by type on a fluid, draggable graph.

## The workspace

- **Integrated terminal** — a real shell that stays alive across navigation (its processes survive page
  switches; only app shutdown stops them).
- **Markdown docs browser** — read your project's docs in-app.
- **Desk pet** — a tiny companion (duck, bird, frog, cat, or dog) that walks along the top bar; chosen
  in onboarding, changeable or disable-able in Settings.
- **Welcome greeting** — a warm multilingual "hello" on each fresh launch.
- **Meetings / notes** and **Music** — _Planned / coming soon._

## Platform & trust

- **Local-first & private** — your code, your voice, and your memory never leave your Mac; STT and the
  brain run locally.
- **Signed & notarized by Apple** — opens on first launch, no "unidentified developer" warning.
- **Automatic updates** — new versions download and install themselves (electron-updater).
- **Requirements** — Apple Silicon (M1 or later), macOS 14 (Sonoma) or later.
