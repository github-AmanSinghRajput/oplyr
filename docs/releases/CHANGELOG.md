# Changelog

All notable changes to Oplyr, newest first. Dates are IST (Asia/Kolkata). Versions follow the
`apps/desktop/package.json` version that ships in each DMG/zip. See
[`README.md`](./README.md) for how we cut and record a release, and
[`../DISTRIBUTION.md`](../DISTRIBUTION.md) for the build/notarize/ship commands.

Format loosely follows [Keep a Changelog](https://keepachangelog.com/): **Added / Changed / Fixed**.

---

## 0.5.2 — 2026-09-09

Semantic recall still did not run in 0.5.1. Same path, third packaging fault, and the one this
release is for.

**Fixed**

- **The Brain embeds again.** 0.5.1 shipped a stand-in for `sharp` that exported `null`, on the
  reading that `@xenova/transformers`' `utils/image.js` guards its use with `else if (sharp)`. Two
  lines past that guard the chain ends in
  `else { throw new Error('Unable to load image processing library.') }`, so a falsy value does not
  disable image handling — it throws while the module is still loading. The embedding path died at
  import exactly as it had when the package was missing altogether, every memory was stored without
  a vector, and recall fell back to matching keywords. The stand-in is now truthy, which is all the
  branch requires: the image code it selects is never reached, because the brain only ever embeds
  text. Memories written by 0.4.x, 0.5.0 or 0.5.1 are re-embedded on first launch.

**Internal**

- The test that vouched for this was worthless and passed throughout. It read the library's source
  and asserted the guard existed, which said nothing about the branch below it. It now assembles the
  dependency set the DMG actually ships, loads the real library against it, and asserts a
  384-dimension vector comes out. It also runs under `--preserve-symlinks`: without that, Node
  resolves each symlinked package to its realpath and then resolves `sharp` from there, i.e. out of
  the fixture and into the repo's real copy, so an earlier version of this test embedded happily
  against a deliberately broken stub. Verified to fail on the exact bundle 0.5.1 shipped.

---

## 0.5.1 — 2026-09-09

The Brain release. Semantic recall has been in the product since 0.3.0 and has never actually run in
a shipped build — this fixes that, and then makes the memory around it worth recalling.

> 0.5.0 carried these same changes but was never published: its build was missing `sharp`, which
> left the headline fix inert. It is folded in here rather than listed separately, because no
> install could ever reach it.

**Added**

- **Voice knows your project's vocabulary.** Names from the repo you have open — files, exported
  symbols, the current branch — are passed to the recogniser as keyterms, so `brain-recall.ts` and
  `sqlite-vec` come back spelled the way you wrote them instead of phonetically. The speech
  refinement model this needs downloads in the background on first launch with visible progress;
  dictation works the whole time, and an interrupted download resumes by itself.
- **Agent replies render like a real markdown client.** Tables, task lists, footnotes, block and
  inline math (KaTeX), and syntax-highlighted code, on par with the Claude and Codex desktop apps.
- **Mermaid diagrams render inline**, in chat and in the docs browser — flowcharts, sequence
  diagrams, state charts. Invalid diagram source falls back to a code block instead of breaking the
  message.
- **The empty chat offers somewhere to start** rather than a blank panel.

**Changed**

- **A new look — "Plum × Linen", shared with the website.** Warm near-black with a single plum
  accent replaces the cool blue-black and cyan of earlier releases; cyan-on-blue is the default "AI
  tool" palette and shared nothing with the brand. Light mode now uses the site's tokens verbatim,
  so the two halves are one language instead of two.
- **The app no longer reads as zoomed in.** Corner radii are tighter (panels 20 → 12px, controls
  14 → 8px), elevation comes from three shared shadow tokens instead of ad-hoc shadows, all motion
  uses one curve, and a surface is now either filled or outlined rather than both. Welcome and
  empty-state headings are set in the site's serif.
- **Sessions import about 13× more of your history.** A session used to be distilled from one
  9,000-character excerpt — roughly the final two exchanges — so the Brain's picture of a day's work
  was whatever happened in the last few minutes. It now reads up to 120,000 characters in slices,
  distilling each one and merging the results.
- **Voice auto-send is off by default.** Having it on by default meant a stray noise could dispatch
  a half-formed instruction to an agent that writes files.

**Fixed**

- **Semantic recall never worked in any shipped build.** `@xenova/transformers` has a static
  `import` of `onnxruntime-node`, so the module must resolve even when the WASM backend is the one
  that runs. It was excluded from the DMG on the assumption that transformers would fall back; it
  did not — the embedding path failed at load, every memory was stored with no vector, and recall
  silently degraded to keyword overlap. Packaged builds now ship it (filtered to darwin/arm64,
  92MB → ~20MB). **Memories written by an older build have no vectors and are re-embedded on
  first launch.**
- **`sharp` was missing from the packaged app too, for exactly the same reason.** Fixing
  `onnxruntime-node` moved the failure one dependency along: transformers' `utils/image.js` opens
  with a static `import sharp from 'sharp'` and `transformers.js` re-exports it, so a build without
  it still died at load and still stored every memory with no vector. Caught only because this
  release added the "Keyword only" warning. Oplyr embeds text and never an image, and running
  without sharp is the library's own supported configuration, so a stub ships in its place rather
  than 25MB of image codecs and a 37-package dependency closure. A test now reads the library's
  real source and fails if the packaging list misses anything it imports, so there is no third time.
- **Codex sessions stopped being read at all.** Codex changed its rollout format: recent sessions
  emit no `user_message` / `agent_message` records, so the parser found nothing in them while the
  import still reported success. An 883MB session of real work distilled to zero memories. Both
  schemas are now read.
- **Claude sessions were invisible for any project with a space or an underscore in its path.**
  Claude names its transcript folder after the working directory, replacing every non-alphanumeric
  character with `-`, so a space, an underscore and a slash all collapse to the same thing. We
  rebuilt that name by replacing only `/`, which found nothing for the rest. Sessions are now
  attributed by the working directory recorded inside the transcript, which also surfaces projects
  Claude has history for but `~/.claude.json` does not list. On one real machine this had hidden
  76 sessions across three projects.
- **The "newest" session was picked by filename, not by when you last worked in it.** `codex resume`
  appends to the file the session started in, so its name freezes while its content keeps growing.
  A 0.1MB session named a minute later beat the 883MB session holding the actual work, and every
  long-running session lost the same way. Ranking is now by last-written time.
- **The scan's own file budget was ordered by name too**, so on a large history a resumed session
  could be excluded before it was ever considered. The budget now goes to the most recently written
  files, for both agents.
- **Only one session per project was ever imported.** A repo with a hundred sessions contributed a
  single arbitrary one. Up to three are now offered per project, newest first, and the newest is
  read deepest.
- **Monorepos recalled nothing.** Agents record a session against whatever directory they were
  launched from, so one package's memories land under the monorepo root and another's under
  `<root>/packages/api`. Connecting the root matched neither. Memories filed below the connected
  project are now in scope. Scoping never widens upward.
- **"Where did we leave off?" returns recent work.** Continuation questions share no vocabulary with
  the work they're asking about, so they scored below the relevance threshold and returned older,
  wordier memories. Such questions are now recognised and ranked by recency first.
- **Claude Code no longer reports you as signed out while you are signed in.** The check matched the
  word "auth" anywhere in the CLI's output, so a CLI that didn't recognise `auth status` produced an
  error containing "auth" and hard-blocked every turn. It now reads the JSON payload, and an
  unreadable status fails open instead of locking you out.
- **Onboarding's last step is no longer a dead end**, and the flow was rebuilt around it.
- **"Reset Oplyr" resets everything.** It named seven tables explicitly and left behind your user
  record, codebase maps, file summaries, notes, and every attachment and cache on disk. It now
  clears everything Oplyr put on the Mac, discovered dynamically, so the app is genuinely
  as-installed.
- **"Clear chat" is scoped to the connected workspace, and keeps your memories.** It cleared every
  workspace's history, and took the Brain memories distilled from those conversations with it.
  Memories now survive; only the conversation goes.
- **Connecting a project no longer imports your agent history without asking.** Every pending source
  arrived pre-ticked, which made "proceed" import all of them and made the panel's own promise
  ("nothing is added until you press the button") false. Nothing is selected until you select it,
  and there's a Select all for when you want it.
- **Re-importing a source no longer duplicates memories.** The content-hash ledger is enforced on
  the write path, and near-identical restatements collapse to a single memory.
- **The codebase map shows your code, not your dependencies.** `node_modules`, `.next`, virtualenvs
  and installed Python packages, lockfiles, minified and generated output, and dotfiles and secret
  files are all excluded.
- **Root files appear in the codebase map.** The 600-node trim ranked by connectedness, and
  top-level files have few imports, so they were the first thing cut from their own repo.
- **The logo on a reply is the agent that wrote it.** Switching the active agent from the topbar
  restamped past replies with the new agent's logo.
- **Refresh refreshes everything**, not a subset of the panels.
- **The Memory screen is rebuilt around the graph.** The canvas is now full width instead of giving
  a third of it to a permanent right-hand rail whose inspector read "Nothing selected" most of the
  time. Search is one toolbar field, memories sit in a collapsible drawer under the canvas as a
  responsive grid instead of one narrow column, and clicking a node or a link slides a detail sheet
  in over the canvas rather than resizing it, which used to re-run the force simulation and make the
  whole layout jump. Nothing on the screen scrolls the page any more: the drawer and the sheet each
  bound their own content.
- **Clearing the memory search and pressing Enter goes back to where you were.** An empty box was
  sent to the API as a search for nothing, which left the results view pinned open and empty with no
  way back. It now reverts to the live capture feed, and there is a clear button.
- **The Memory screen says when recall is keyword-only** instead of leaving semantic search quietly
  degraded.
- **Quitting the app does not reset the Brain.**

**Internal**

- Docs pass over everything published on GitHub: stale context removed, superseded plans deleted,
  the rest brought up to date (~1,400 lines removed). Markdown is now covered by `format`/`check`.
- New tests for Claude auth interpretation, codebase-map filtering, keyterm extraction, session
  transcript reading and chunked distillation, and recency-first recall.
- `brain_edges` is documented as reserved: Memory-graph edges are computed per request from stored
  entities and never persisted.
- The mac build no longer packages both targets in one pass. Concurrent targets made
  `hdiutil create` race the zip target over the same `.app` and fail; `npm run dist:mac` builds them
  one at a time, zip last so it owns `latest-mac.yml`. The runbook no longer depends on `CSC_NAME`,
  which was both easy to forget and documented as something never to set.
- Fixed a flaky test in the voice bootstrap: the detached speech-refinement fetch wrote its marker
  file after the test returned, racing the temp-directory cleanup. The in-flight task is now
  awaitable, and a fixed 10ms sleep next door was replaced with the same wait.

---

## 0.4.1 — 2026-09-07

**Fixed**

- **Codex usage reads its limits.** Codex defers the rate-limit numbers on the first `/status` after
  launch ("refresh requested; run /status again shortly"); the scrape treated the panel as complete
  and reported "Could not read Codex usage". It now waits for the limit lines and asks again.
- **Usage is scoped to the active agent.** Every agent's card was handed the same snapshot, so
  Claude Code's section displayed Codex's numbers — and Codex's errors. A non-active agent now
  explains where usage comes from instead of showing another agent's data.
- **Usage recovers after a network drop.** Refresh forces a fresh capture, and a failed read is
  retried after 15s instead of being cached for two minutes.
- **Rounded corners across the app.** Panels, tabs, buttons and the workspace controls rendered
  square — every one used an invalid `rounded-radius-*` class that Tailwind emitted nothing for.
- **Onboarding** has a Back step, and confirms before skipping a memory import that has pending
  sources.
- **The workspace memory-import card is recoverable.** Dismissing it collapses it to a one-line row
  with a re-scan button rather than hiding it for good.
- **Toggling auto-send mid-recording** no longer fails the turn — the setting is pinned when capture
  starts and the toggle is disabled while a turn is in flight.
- **The voice heading reflects what Oplyr is actually doing.** It no longer reads "Listening…" when
  the mic is closed, which looked like an always-on microphone.
- **The working animation is only rendered once** on the voice screen.

**Changed**

- **Agents are identifiable.** Vendor logos and brand accents in Settings, with the vendor named
  under each agent; the active agent's logo appears on its row.
- **New working indicator** — a signal travelling across linked nodes, tinted with the working
  agent's accent, replacing the generic bouncing dots.
- **Desk pets rebuilt.** Six characters (duck, bird, frog, cat, dog, and Crabby the crab), each
  redrawn and given its own gait and idle behaviours — foraging, croaking, grooming, digging,
  snapping — instead of pacing on a loop. Crabby also scuttles along the top of the chat composer.

**Internal**

- `parseCodexStatus` gained its first tests, including the deferred-limits transcript.
- The native-module preflight now self-heals a missing `better-sqlite3` binding (not just an ABI
  mismatch), and no longer inherits an outer `--workspace` filter into its rebuild.

---

## 0.4.0 — 2026-09-04

**Added**

- **Import your existing agent memory into the Brain.** Oplyr finds the context files you already
  keep (`AGENTS.md`, `CLAUDE.md`, and friends) and imports them as memories, so the Brain starts
  with what you've already written down instead of empty.
- **Import ledger** — each source is tracked by content hash, so Oplyr knows what is new, what
  changed since last time, and what is already in the Brain. Progress is shared across screens and
  survives navigating away mid-import.

**Changed**

- **Brain canvas** — faster on large graphs, with a render cap, curved floating edges that leave and
  enter nodes on the correct side, and calmer physics on re-layout.
- **Voice streaming** is smoother — the speech engine runs with its streaming window configuration
  rather than the batch default.

**Fixed**

- **Review diffs work in nested repositories.** A workspace containing more than one Git repo
  produced an empty or partial diff; diff, snapshot and revert are now repo-aware and aggregate
  across every repo under the workspace.

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

- **Agent responses now render like a proper chat UI** (chat _and_ voice) — automatic language
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
