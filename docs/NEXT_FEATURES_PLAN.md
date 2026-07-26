# Next Features — after the first signed/notarized beta DMG

**Decisions locked with the user on 2026-07-12. Do not re-litigate — build to these.**
These come AFTER the first notarized DMG ships (see `docs/DISTRIBUTION.md`). The brain (built + reviewed) is the shared-memory substrate both features rely on.

## Build order
1. **Guided connect flow** (Feature A) — build first; it's a prerequisite for a useful room (you need ≥2 agents actually connected before "agents talk to each other" means anything).
2. **Multi-agent room — conducted @mention** (Feature B1). ✅ SHIPPED (backend + UI; 2026-07-22).
3. **Multi-agent room — capped debate** (Feature B2) — opt-in, guarded, fast-follow.
4. **Import existing agent memory** (Feature C) — onboarding wedge; deferred, documented below.

Each gets its own short spec → plan → build when we start.

---

## Feature A — Guided in-app connect flow
**Problem:** today, connecting a provider whose CLI isn't set up is manual — the user must install + sign in the CLI in their OWN terminal, then return and press Refresh. If e.g. Gemini CLI isn't installed/authed, Oplyr just says "not installed / run the login command."

**Decision:** *Guided in-app terminal.*

**Building blocks that already exist:**
- Per-provider state detection — `AssistantProviderStatus { installed, loggedIn, appConnected, loginCommand }` (`assistant-client.ts` + each `*-client.ts` `getXStatus`).
- An embedded PTY terminal — `node-pty` lives in `apps/desktop` (main process), driven over IPC.

**Design:**
- A **"Connect an agent" wizard** in Settings + Onboarding listing codex / claude / gemini with live state: *Not installed* / *Sign-in needed* / *Ready*.
- Per provider, a 3-step machine: **Install → Sign in → Connected.** Each step has a **"Run in Oplyr"** button.
- New desktop IPC (sibling to `pickProjectFolder`): `runSetupCommand(providerId, step)` → spawns a **fixed, hardcoded** command in the embedded PTY, streams output into a terminal pane in the wizard. The interactive browser/device sign-in happens as normal.
- Oplyr **auto-polls** provider status and advances to Connected itself — no manual Refresh.
- **Safeguards (Apple/security review):** commands are hardcoded per provider (not user-editable), shown before running, output is visible, never auto-`sudo`. Fallback for every step: copy-command + docs link.
- **Verify at build time:** the exact current install commands per CLI (e.g. `npm i -g @google/gemini-cli`, `@openai/codex`, `@anthropic-ai/claude-code`) — these drift.
- **Touches:** `apps/desktop` (PTY spawn IPC + preload expose), `apps/web` (wizard UI + status poll). Status endpoints already exist.

---

## Feature B — Multi-agent room ("Agentic Chat")
**Decision:** conducted `@mention` first; capped debate as an opt-in follow. NOT fully autonomous.

### B1 — Conducted (v1)
- The chat becomes a **room**: every message has an **author** (`user` or a specific `providerId`). Schema: add `authorProviderId` to `conversation_messages` (+ migration).
- **Mention routing:** parse `@codex` / `@claude` / `@gemini` from the user message → ordered reply list; no mention → sticky **last-addressed** agent.
- Each mentioned agent replies **in turn**; context per reply = last ~12 room messages (authored) + **brain recall** + the user message.
- Each reply is authored in the transcript **and captured to the brain attributed to that agent** — the brain's multi-agent contributor list + corroboration (already built) is exactly this.
- Sidebar: rename chat to **"Agentic Chat"**; `@`-autocomplete offers only connected providers.

### B2 — Capped debate (opt-in, guarded)
- A **"Discuss"** control: pick 2 agents + a topic + **max rounds** (e.g. 3–6). Loop: A → B → A … until the round cap or the user hits **Stop**.
- **Hard guardrails:** read-only during the debate (no write-intent / approvals mid-argument), round cap, **Stop** aborts instantly (AbortSignal), cost cap, optional synthesis at the end. File writes happen only AFTER, when the human tells one agent to implement the agreed approach through the normal approval flow.
- Brain captures debate turns with attribution; agreement between agents raises confidence via corroboration.
- **Risks respected:** runaway loops, token/cost blowup, controllability — all bounded by the guardrails above. This is why we do NOT ship fully-autonomous agent↔agent.

---

## Feature C — Import existing agent memory (onboarding wedge)
**Status:** deferred, documented 2026-07-22. Pick up after the current round of testing.

**Idea:** on connect, import a user's EXISTING Claude Code / Codex memory into the Oplyr Brain so they never start from scratch. Kills the cold-start feeling and leans on our two real differentiators — the Brain + local-first.

**Where the source data lives (verified on-disk 2026-07-22):**
- **Claude — curated:** `<repo>/CLAUDE.md` (+ subdir `CLAUDE.md`, `@imports`) and global `~/.claude/CLAUDE.md`. **History:** `~/.claude/projects/<slugified-cwd>/<session-id>.jsonl` (one dir per project; path `/`→`-`) + `~/.claude/history.jsonl`. Config: `~/.claude.json`.
- **Codex — curated:** `<repo>/AGENTS.md`, `~/.codex/rules`. **History/memory:** `~/.codex/history.jsonl`, session rollouts, and structured SQLite stores (`~/.codex/memories_1.sqlite`, `goals_1.sqlite`).

**Build in two tiers:**
- **Tier 1 (first — easy, high value):** parse curated files (`CLAUDE.md` project+global, `AGENTS.md` / Codex `rules`) → Brain distiller → atoms, scoped project vs global (1:1 with the Brain's existing scopes). Stable, small, curated → instant "Oplyr already knows my project".
- **Tier 2 (deeper, opt-in):** distill recent `.jsonl` transcripts (Claude `projects/` + Codex sessions) into durable memories, selective by recency. Optionally read Codex's `memories_1.sqlite` directly.

**Must-haves / caveats:**
- **100% local** — read local files → distill locally → write local `brain.db`; never upload. On-brand; say it in the UI.
- **Provenance** — tag imported atoms (`source: claude-md | codex-agents | imported-transcript`) so recall can say "learned from your existing setup."
- **Consent + preview** before writing to the Brain (show which files + how many memories will be added).
- **Brittleness** — undocumented internal paths/formats; start with the stable MD files, treat transcripts/SQLite as best-effort.

**UI:** offer at the "connect a folder" onboarding step + in Settings: *"Import your existing Claude & Codex memory."*

---

## Notes
- Both features are **desktop-first** (PTY, IPC) — validate with `npm run dev:desktop`, not the browser.
- No code written yet for either — this file only captures the locked decisions so they aren't forgotten.
