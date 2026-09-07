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
- **It knows your project's words** — file names, exported symbols and the current branch are passed
  to the recogniser as keyterms, so `brain-recall.ts` comes back spelled the way you wrote it rather
  than phonetically. The refinement model this needs downloads in the background on first launch;
  dictation works throughout.
- **Text chat too** — type to the same agent; voice and text share one conversation and one turn state.
- **Replies render properly** — tables, task lists, footnotes, math, syntax-highlighted code, and
  **Mermaid diagrams** inline, on par with the Claude and Codex desktop apps.
- **Multi-agent** — connect OpenAI **Codex** and **Claude Code**; switch the active agent per turn
  from the top bar without losing project memory. Each agent shows its vendor logo and brand accent
  so you always know who you're talking to. (Gemini: _Planned_.)
- **Agentic Chat — a multi-agent room** — `@mention` connected agents (`@codex`, `@claude`) in one
  turn and they answer in sequence, each seeing the replies before it. Reply-only: the room discusses,
  and writes still go through the single-agent approval flow.
- **Live usage limits** — each agent's remaining 5-hour and weekly limits, read from its own CLI and
  shown in the top bar and Settings.
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
  in multi-repo workspaces. It maps **your** code: dependencies, build output, lockfiles, minified
  and generated files, dotfiles and secret files are all left out.
- **Import/link tracing** — see which file (and function) is imported where.
- **AI summaries** — summarize what each file does, and per-function summaries on demand.
- **Function index** — list of top-level functions per file with quick summaries.

## Remember across sessions — the Brain

- **Local memory ("brain")** — an on-device SQLite store with semantic recall over embeddings
  computed on your Mac (cosine similarity, with keyword fallback for anything not yet embedded).
- **Memory across agents & sessions** — captured automatically as you work, shared between agents, and
  persisted across restarts.
- **Import the memory you already have** — Oplyr finds the agent context files in your project
  (`AGENTS.md`, `CLAUDE.md`, and friends) and imports them, so the brain starts with what you've
  already written down. Each source is tracked by content hash, so it knows what's new, what changed,
  and what's already in. Nothing is imported until you choose it.
- **Picks up where you left off** — it also reads your most recent Codex / Claude Code session for
  each project, so asking "where did we leave off?" answers from real work rather than making you
  re-explain.
- **Obsidian-like canvas** — memories cluster by type on a fluid, draggable graph.

## The workspace

- **Integrated terminal** — a real shell that stays alive across navigation (its processes survive page
  switches; only app shutdown stops them).
- **Markdown docs browser** — read your project's docs in-app, with the same rich rendering as chat
  (Mermaid diagrams and math included).
- **Desk pet** — a tiny companion that lives on the top bar: a duck, bird, frog, cat, dog, or Crabby
  the crab. Each moves like itself and gets on with its own business — foraging, croaking, grooming,
  digging, snapping — rather than pacing on a loop. Crabby also scuttles along the top of the chat
  input. Chosen in onboarding, changeable or disable-able in Settings.
- **Welcome greeting** — a warm multilingual "hello" on each fresh launch.
- **Meetings / notes** and **Music** — _Planned / coming soon._

## Platform & trust

- **Local-first & private** — your code, your voice, and your memory never leave your Mac; STT and the
  brain run locally.
- **Signed & notarized by Apple** — opens on first launch, no "unidentified developer" warning.
- **Automatic updates** — new versions download and install themselves (electron-updater).
- **Requirements** — Apple Silicon (M1 or later), macOS 14 (Sonoma) or later.
