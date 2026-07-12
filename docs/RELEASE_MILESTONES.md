# Oplyr Release Milestones

This file is the active release roadmap for Oplyr.

It exists to answer one question clearly:

`What is shipped, what is next, and what is intentionally later?`

If a milestone or feature is not useful for deciding product direction or execution priority, it should not live here.

## Versioning stance

Current release posture:

- `0.1.0-beta.x` = invite-only beta
- `0.2.x` = launch hardening and public-beta readiness
- `1.0.0` = first serious public Oplyr release

## Product phases

The current product sequence is:

1. `0.1 beta`: reliable invite-only desktop beta
2. `0.2`: public-beta readiness and packaging/distribution hardening
3. `1.0`: trustworthy voice-first coding desktop launch
4. `1.1`: note-taker foundation and meeting memory
5. `1.2`: Granola-level developer meeting note-taker
6. `2.0`: vibe music and immersive coding ambience

---

## 0.1 Beta: Invite-Only Desktop Beta

Goal:
Ship a testable macOS desktop beta that feels coherent, safe enough to demo, and strong enough to put in front of real users on an invite basis.

### Product identity

- [x] product renamed to `Oplyr`
- [x] desktop-first product direction
- [x] dynamic provider-aware UI instead of Codex-only language
- [ ] README and repo-level naming fully cleaned up everywhere

### Core assistant flow

- [x] project/workspace selection
- [x] read-only by default
- [x] approval-gated write flow
- [x] review screen for proposed code changes
- [x] text chat fallback
- [x] voice conversation loop
- [x] multi-provider support for Codex and Claude Code
- [x] app-managed provider connection state
- [x] provider switching between connected providers
- [ ] end-to-end provider reliability fully validated on real machines

### Voice quality

- [x] local STT path
- [x] Parakeet STT integration (single engine, no fallback)
- [x] speaking/listening UI states
- [x] streamed text visibility while the assistant responds
- [ ] final tuning for barge-in sensitivity and noisy-room robustness
- [ ] real-device validation across multiple microphones and rooms
- [ ] TTS deferred — intentionally not shipped in 0.1; future paid provider (e.g. ElevenLabs) planned

### Platform reach

Current hard floor: **Apple Silicon (M1+) + macOS 14 Sonoma** — gated by the STT engine
(`apps/stt/Package.swift` → `.macOS(.v14)`, FluidAudio/CoreML on the Neural Engine, no fallback).

- [x] **investigated lowering the floor to macOS 13 — not possible with the current engine.**
  FluidAudio itself declares `platforms: [.macOS(.v14)]`, so our Swift package can't target Ventura
  without dropping/replacing FluidAudio (same effort as cross-platform STT). Floor stays macOS 14.
- [x] **graceful non-supported path** — voice availability now checks Apple Silicon + macOS 14
  precisely (`apps/api/src/platform.ts` → `resolveVoicePlatformSupport()`), so an Intel or pre-Sonoma
  Mac gets a clear reason (surfaced via `audio.error`) instead of a failed STT launch; `start()`
  refuses cleanly without spawning the worker.
- [ ] test on the oldest Apple Silicon we can (M1, 2020) to confirm the real minimum
- [ ] document the true minimum in-app and on the site once validated on real old hardware
- [ ] (only if we want Intel / macOS ≤13) replace FluidAudio with a cross-platform STT engine —
  tracked with the Windows-voice work; a major sub-project, deliberately out of 0.1

### UI and UX

- [x] step-based onboarding
- [x] app-level display name
- [x] light and dark mode
- [x] provider-aware onboarding
- [x] PR-style review flow
- [x] voice screen redesign
- [x] chat screen with message-only scrolling
- [ ] final full-app visual QA in light theme
- [ ] final pass on spacing, copy, and consistency across every screen
- [ ] **first-time UX + product tour** — a per-screen guided walkthrough that fires the first time a
  user opens each screen (Agentic Chat, Voice, Review, Codebase Map, Markdown, Settings…): short,
  dismissible, shown once per screen, with a "reset tour" control. Ties into onboarding completion.

### Security baseline

- [x] local API bound to localhost
- [x] per-install local API auth token
- [x] workspace root validation tightened
- [x] secret-path enforcement in code
- [x] sensitive diff/status filtering
- [x] stricter desktop IPC/runtime boundary
- [x] CSP baseline
- [ ] dedicated security review after beta stabilization
- [ ] **pentest / external-audit readiness (HIGH PRIORITY).** Harden so that an Apple notarization/app
  review, a future Microsoft store review, or a hostile security run finds nothing to question.
  Scope: written threat model; dependency + supply-chain audit (`npm audit`, pinned/verified native
  binaries); IPC/preload boundary review (contextIsolation, no `nodeIntegration`, channel allowlist);
  CSP + no remote code execution in the renderer; secret-handling + local-API-token review; no
  telemetry/PII egress; signed + notarized artifacts; documented data-flow ("nothing leaves the Mac").

### Distribution baseline

Full step-by-step guide: **`docs/DISTRIBUTION.md`** (Apple account → packaged runtime → DMG → sign +
notarize → hosting → website/email → post-public Homebrew & Mac App Store).

- [ ] wire the packaged runtime (bundle + start the API, bundle STT binary + models) — the real gate
- [ ] DMG packaging path (electron-builder) + app/DMG icon from the Oplyr logo (`apps/desktop/scripts/make-icon.sh`)
- [ ] sign + notarize + staple (requires the paid Apple Developer Program)
- [ ] first-launch dependency/model setup experience
- [ ] host the DMG (GitHub Releases) + wire `content/releases.ts` / `/download`
- [ ] invite-approval email with the download link
- [x] beta QA checklist documented in `docs/BETA_QA_CHECKLIST.md`
- [x] voice runtime bootstrap policy documented in `docs/VOICE_RUNTIME_BOOTSTRAP.md`

Post-public distribution (documented in `docs/DISTRIBUTION.md`, build after public launch):
- [ ] Homebrew cask via own tap (`brew install --cask oplyr`)
- [ ] Mac App Store submission (separate cert + App Sandbox entitlements + review)

---

## 0.2: Public-Beta Readiness

Goal:
Turn the private beta into something that can be downloaded and tested by broader external users without hand-holding.

### Required scope

- [ ] stable DMG generation
- [ ] signing/notarization plan
- [ ] simple install flow for local runtimes/models
- [ ] first-run health checks inside the app
- [ ] better failure recovery when local models/providers are missing
- [ ] provider/account/session messaging polished for real users
- [ ] version display and update strategy
- [ ] public-facing website for product messaging and download

### Non-goals

- [ ] enterprise admin
- [ ] team collaboration
- [ ] cloud-hosted code execution

---

## 1.0: Oplyr Public Launch

Goal:
Launch Oplyr as a trustworthy voice-first coding desktop app for real developer workflows.

### Launch bar

- [ ] voice experience feels fast, clear, and dependable
- [ ] text chat feels polished and production-grade
- [ ] review flow is trustworthy enough for daily use
- [ ] onboarding is fast and understandable for first-time users
- [ ] Claude and Codex both feel first-class
- [ ] desktop app install experience is clean
- [ ] public website explains the product and sets expectations
- [ ] core security posture is credible for external users

### Product bar

- [ ] users can reliably talk, review, and approve work in one loop
- [ ] users can choose their provider and model confidently
- [ ] voice mode feels native rather than gimmicky
- [ ] the product is demo-worthy and founder-pitch-worthy

---

## 1.1: Note-Taker Foundation

Goal:
Expand Oplyr from voice coding into durable developer memory and session capture.

### Scope

- [ ] strong notes data model
- [ ] searchable note history
- [ ] note timeline/session timeline
- [ ] transcript-linked notes
- [ ] note summaries and extracted actions
- [ ] settings and UX for note capture preferences

### Why this matters

This starts moving Oplyr from "voice coding app" toward "voice-native developer workspace."

---

## Post-Beta TODO

### Shared memory ("brain")

The design is **approved** — see `docs/superpowers/specs/2026-06-25-oplyr-brain-memory-design.md`
(unified local-first graph + vector memory; per-agent write permission; SQLite + sqlite-vec). The
open schema/access/storage questions that used to live here are settled there. Build follows the
spec's staged delivery (single-project loop → machine-wide → richer sources).

This is intentionally deferred until after beta launch so bootstrap, onboarding, voice, chat, and
provider reliability can reach demo quality first.

---

## 1.2: Granola-Level Developer Note-Taker

Goal:
Ship a note-taking experience that feels competitive with best-in-class meeting-note products, but built for developers.

### Product ambition

- [ ] meeting capture flow
- [ ] high-quality transcripts
- [ ] decisions extraction
- [ ] action items extraction
- [ ] engineering-context summaries
- [ ] code/task references tied to discussion
- [ ] searchable memory across sessions
- [ ] beautiful detail views for sessions and notes
- [ ] conversational recall of past meetings and decisions

### Important constraint

This is a major product line, not a sidebar feature.
It should be treated with the same seriousness as the core voice-coding experience.

---

## 2.0: Vibe Music

Goal:
Add an immersive, high-quality vibe/music layer that amplifies focus and makes Oplyr feel more like an intelligent coding environment.

### Scope direction

- [ ] music and ambience system
- [ ] coding-session-aware recommendations
- [ ] focus modes / mood modes
- [ ] personalized taste/profile controls
- [ ] optional adaptive music based on session state

### Constraint

This should only be pushed hard after the core coding and note-taking product is already trusted.

---

## Post-beta backlog (deferred good-to-haves)

Not required for the 0.1 beta; revisit after launch.

- [ ] **Voice control for the assistant model** — let the user, by voice, (a) switch the active AI
  provider, (b) choose from that provider's available models, and (c) set the model's reasoning
  strength. The manual Topbar picker (agent dropdown + model picker) already covers this by click;
  this adds the hands-free voice path on top of the same apply-path.

- [ ] **STT accuracy on technical terms + accented speech (HIGH BAR — "Claude mic-button" quality).**
  **Problem:** Parakeet v3 runs with `config: .default` and a *general* English LM, so rare/domain words
  lose to common ones — "Claude" → "God", "auth" → "earth", "Codex" → "codecs", "repo" → "depot" — and
  Indian/non-US accents widen the gap. **It is NOT a mic, locale, or sample-rate bug.** FluidAudio's
  Parakeet API exposes **no hotword/biasing/custom-vocab hook**, so the model can't be told to expect
  our terms — the fix must be a correction layer (and/or a better engine).
  **Target (explicit owner ask):** match the accuracy of Claude's web/desktop mic button — speak any
  word (incl. tool names, code identifiers, abbreviations) → it transcribes accurately → fills the
  message input box → the user reviews and sends. **No constraint on time / tokens / compute for
  accuracy — do it properly.**
  **Approach — go beyond the minimum (the chosen "best possible"):**
  1. **LLM cleanup pass** after STT: rewrite the raw transcript in coding context, fixing mis-heard
     tool names + technical terms without changing meaning (use a fast model; accuracy over latency).
  2. **Guarded domain dictionary** for high-frequency safe fixes (agent names when addressing one,
     `auth`, `repo`, `Codex`, `Gemini`) as a fast first layer feeding the LLM pass.
  3. **Evaluate a stronger engine** if 1+2 fall short — a larger Parakeet, FluidAudio's Cohere ASR, or
     (decision point) a top-tier **cloud STT**. ⚠️ Cloud STT conflicts with Oplyr's local-first/privacy
     pillar — that trade-off must be decided explicitly, not slid into.
  4. **UX:** transcript populates the input box for review/edit before send (not blind auto-send).

---

## Ongoing rules

- [ ] keep the beta and launch experience grounded in trust and reliability
- [ ] do not let future note-taker scope derail core voice-coding quality
- [ ] do not let vibe/music novelty outrun product fundamentals
- [ ] keep Oplyr desktop-first
- [ ] keep local execution and explicit user control as product pillars
- [ ] update this file when scope changes materially
