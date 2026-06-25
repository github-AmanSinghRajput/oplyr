# Oplyr Beta QA Checklist

This file is the end-to-end QA and release-checklist companion for Oplyr beta.

It exists to answer four questions clearly:

1. What should happen when a brand-new user downloads Oplyr on a new Mac?
2. What should stay local versus what should touch cloud services?
3. What scenarios must be tested before invite-only beta and public-beta expansion?
4. What counts as a blocker versus a tolerable beta issue?

This document should be read alongside:

- [PRODUCT_GUIDE.md](./PRODUCT_GUIDE.md)
- [RELEASE_MILESTONES.md](./RELEASE_MILESTONES.md)

## 1. Scope

This checklist covers the intended beta product shape:

- macOS desktop app distributed as a DMG
- local runtime on the user's machine
- local SQLite for device-local app data
- provider-backed coding through Codex and Claude Code
- cloud control plane for website, beta access, downloads, releases, installs, and feedback

This is not only a test checklist.
It is also the intended user journey and quality bar for beta.

## 2. Architecture Assumptions

### Local on the user's machine

- Electron desktop shell
- React frontend
- local runtime service
- local SQLite database
- local voice pipeline
- local review / approval flow
- local workspace state
- local chat history
- local diff / review history
- local settings and preferences
- provider CLI execution
- local model runtimes and related support scripts

### Cloud

- website
- beta access / invite flow
- release metadata
- download tracking
- install registration
- feedback collection
- future update manifest

### Must not be stored online by default in beta

- user repository contents
- raw local diffs
- raw coding chat history
- local review history
- local notes / memory

## 3. Severity Levels

### P0

Release blocker. Do not ship beta if found.

- app cannot install or launch
- runtime fails to start on a clean supported Mac
- app writes outside the approved workspace
- secret-like files are exposed in diff/status/chat output
- provider execution can mutate files without approval
- reset flow leaves sensitive state behind
- app crashes on common flows

### P1

Core workflow broken. Beta may be paused until fixed.

- onboarding fails for normal users
- provider connection flow is confusing or broken
- voice mode frequently fails or times out
- text chat truncates, duplicates, or loses replies
- review / approve / reject flow is unreliable
- persistence fails after restart
- update signal points users to a broken release

### P2

Usable with a workaround, but should be fixed quickly.

- poor copy
- light-theme visibility issues
- weak spacing or layout regressions
- inconsistent status messaging
- small reliability or polish gaps with recovery

### P3

Non-blocking polish.

- subtle visual issues
- animation roughness
- small naming inconsistencies
- low-impact UX improvements

## 4. QA Environment Matrix

Every major beta pass should cover at least this matrix.

### Machines

- Apple Silicon Mac
- Intel Mac if still supported

### macOS states

- clean machine with no prior Oplyr data
- machine with prior Oplyr install
- machine with prior provider CLI already installed

### Provider states

- Codex installed and logged in
- Codex installed and logged out
- Codex not installed
- Claude installed and logged in
- Claude installed and logged out
- Claude not installed

### Permissions

- microphone allowed
- microphone denied
- file picker access normal
- desktop app launched from Applications

### Network conditions

- normal network
- flaky network
- offline after install
- provider rate limit hit

### App modes

- no workspace selected
- workspace selected, read-only mode
- workspace selected, write access enabled
- voice model mode `auto`
- voice model mode `fast`
- voice model mode `inherit`

### Theme and form factor

- dark theme
- light theme
- smaller laptop viewport

## 5. Intended End-to-End User Journey

This is the intended step-by-step beta flow for a brand-new user.

### Step 1: Discovery

- user lands on the Oplyr website
- user understands what Oplyr is and what it is not
- user sees platform expectations clearly
- if beta is gated, user submits details or invite code

Expected:

- website communicates that Oplyr is a desktop-first voice-native coding app
- beta access flow is clear
- no broken forms
- no dead download links

### Step 2: Download

- user clicks `Download for macOS`
- DMG is downloaded from the active release asset host
- download is logged in the cloud control plane

Expected:

- download starts immediately
- file name and version are clear
- broken or stale release links are treated as blockers

### Step 3: Install

- user opens the DMG
- user drags `Oplyr.app` into `Applications`
- user launches the app
- macOS security prompts behave as expected for the build state

Expected:

- app launches cleanly
- no manual Postgres setup is required
- no terminal-only setup is required for the main app shell

### Step 4: First Launch Bootstrap

- Electron starts
- local runtime starts
- local SQLite database is created automatically
- local app directories are created automatically
- local model/runtime assets are resolved or bootstrapped

Expected:

- no absolute developer-machine path dependency
- no need for local Postgres
- no machine-specific path failure
- failure states are visible and human-readable

### Step 5: Runtime Health

- app checks runtime health
- app checks voice/runtime asset readiness
- app checks provider status surfaces

Expected:

- the app does not silently fail
- if local models are missing, users get an actionable message
- if a worker cannot start, the app degrades cleanly instead of crashing

### Step 6: Onboarding

- user enters the name Oplyr should use
- user selects provider
- app detects whether provider CLI is already installed / logged in

Expected:

- onboarding copy is short and clear
- user understands whether Oplyr detected an existing provider session
- app does not imply it stores provider credentials

### Step 7: Provider Connection

Possible cases:

- provider installed and logged in already
- provider installed but not logged in
- provider not installed

Expected:

- already-logged-in case offers continue or switch-account path
- not-logged-in case shows the correct login command
- not-installed case explains the requirement cleanly
- Oplyr stores app-level connection state only

### Step 8: Workspace Selection

- user picks a project directory
- Oplyr validates it
- user optionally enables write access

Expected:

- root filesystem path is rejected
- full home directory is rejected
- non-git directories are rejected if git repo is required
- symlink / approved-root logic behaves correctly
- read-only remains the safe default

### Step 9: Ready State

When provider and workspace are ready, user can use:

- voice
- text chat
- shell
- review
- settings

Expected:

- navigation feels coherent
- theme persists
- no screen causes accidental reset to onboarding

### Step 10: Text Chat

- user sends text message
- optional attachments or pasted images are added
- assistant streams back text
- assistant either replies directly or creates an approval proposal

Expected:

- streaming is stable
- final reply is not truncated
- scroll behavior is stable
- pasted images and files preview correctly
- chat history persists locally after restart

### Step 11: Voice Chat

- user opens voice mode
- starts session
- microphone input is captured
- STT transcribes
- assistant reasons
- assistant reply is displayed as text (TTS is deferred to a future paid provider)

Expected:

- voice works with no workspace selected
- voice discussion uses the configured voice-model strategy
- write-intent work still follows approval flow
- interruption behavior is predictable
- failures are spoken or surfaced clearly

### Step 12: Review / Approval

- assistant proposes code changes
- user opens review screen
- user approves or rejects

Expected:

- approve path applies changes only inside approved workspace
- reject path applies nothing
- diff view stays readable
- protected files are redacted or withheld correctly

### Step 13: Persistence

- user restarts the app
- app restores local state

Expected:

- workspace selection persists
- write-access preference persists
- chat persists
- approval history persists
- theme and settings persist
- no cross-device sync is implied

### Step 14: Update Detection

- app checks whether a newer version exists
- app shows update message if needed

Expected:

- current version is visible
- latest release metadata is correct
- download target points to the correct release

### Step 15: Reset / Clean Exit

- user uses `Reset everything`
- app clears local state
- user returns to onboarding

Expected:

- local app data is cleared
- provider app-connection state is cleared
- history and settings are cleared
- system CLI login sessions are not silently modified unless explicitly designed

## 6. Core Test Scenarios

## 6.1 Website and Download Flow

- landing page loads on desktop and mobile
- SEO basics work: title, description, canonical, robots, sitemap
- beta access or invite flow works
- invalid invite code is rejected cleanly
- valid invite or access path reveals the correct download target
- multiple download clicks do not break flow
- stale release link is treated as a blocker
- download analytics event is recorded once per successful path

## 6.2 DMG and Install Scenarios

- fresh install on clean machine
- reinstall over existing app
- install after older version already exists
- app launched from Applications
- app launched directly from DMG should be discouraged if needed
- unsigned / signing prompt behavior is understood
- notarization / Gatekeeper path tested once available

## 6.3 First-Run Bootstrap Scenarios

- local SQLite file is created automatically
- user does not have Postgres installed
- local model assets exist already
- local model assets are missing
- voice workers fail to start
- app reports missing assets clearly
- bootstrap leaves files in expected app/user-data location
- app does not depend on developer-machine absolute paths

## 6.4 Provider Detection and Auth Scenarios

- Codex already logged in
- Codex logged out
- Codex not installed
- Claude already logged in
- Claude logged out
- Claude not installed
- switch provider after onboarding
- disconnect provider from app only
- reconnect provider after reset
- provider rate limit is surfaced clearly
- provider auth expiration is surfaced clearly

## 6.5 Workspace Scenarios

- valid git repo
- non-git directory
- root filesystem path
- home directory
- directory outside approved roots
- symlink pointing outside approved roots
- workspace restore after restart
- write access toggle persistence

Expected:

- no workspace should ever default to `/`
- no workspace should ever default to the machine root
- general assistant mode should work without a workspace

## 6.6 Text Chat Scenarios

- short reply
- long streamed reply
- reply with code blocks
- reply with markdown lists and tables
- cancel streamed reply
- retry after a failed stream
- attachment-only message
- image paste from clipboard
- drag and drop image
- drag and drop code/text file
- multiple attachments in one turn
- app restart after chat session
- no workspace selected general chat
- workspace selected advisory chat
- workspace selected write-intent chat

Expected:

- no duplicate messages
- no truncated final assistant reply
- no scroll jumping when user is reading older messages
- attachments render back correctly in thread history

## 6.7 Voice Scenarios

- microphone permission granted
- microphone permission denied
- start voice with no workspace
- start voice with workspace selected
- long answer streamed fully as text
- barge-in / interruption
- muted narration mode
- reply-only narration mode
- noisy room input
- silence window tuning
- Codex voice turns with `auto`
- Claude voice turns with `auto`
- voice request that stays conversational
- voice request that becomes write-intent work
- provider rate limit during voice turn
- STT primary failure path

Expected:

- voice can still answer generally without workspace
- faster voice model strategy improves responsiveness
- write-intent path still preserves trust and approval gating
- failures do not crash the entire runtime

## 6.8 Review and Approval Scenarios

- assistant proposes write
- user reviews changed files
- approve request
- reject request
- no diff available
- redacted diff because protected file was touched
- review screen after app restart
- large diff readability
- split versus unified rendering if supported

Expected:

- approve path only affects approved workspace
- reject path performs no write
- secret-like file contents never leak to review/status/chat

## 6.9 Settings and Navigation Scenarios

- sidebar navigation works on every screen
- topbar stays thin and stable
- settings page works in sidebar flow
- light theme and dark theme both readable
- provider model selection persists
- provider voice model mode persists
- transcription settings persist
- refresh action works
- disconnect action works

## 6.10 Persistence and New-Machine Scenarios

- same machine restart
- same machine reinstall
- brand-new Mac with no prior Oplyr data
- user downloads Oplyr on second laptop

Expected:

- local app data is device-local
- second machine starts clean unless cloud features later add sync
- no local chat or review history magically appears on a second machine

## 6.11 Cloud Control Plane Scenarios

- lead creation works
- invite validation works
- download event logging works
- install registration works
- feedback submission works
- cloud outage does not brick the local coding runtime

Expected:

- local runtime remains local-first
- cloud failures should degrade beta logistics, not core local code execution

## 6.12 Update and Release Scenarios

- app version shown correctly
- release manifest points to latest beta
- update available message shown for older build
- no update shown for current build
- broken update URL is handled clearly
- user can still continue with current build if update is optional

## 6.13 Failure and Recovery Scenarios

- runtime fails to bind/start
- local DB is corrupt or inaccessible
- user disk is nearly full
- provider CLI command hangs
- model worker times out
- STT worker crashes during session
- app loses network mid-turn
- provider returns malformed or partial output
- user resets app after a failed session

Expected:

- app should fail loudly and clearly
- runtime should not hard-crash on expected dependency failures
- retry or recovery path should exist where possible

## 6.14 Security and Trust Scenarios

- local API not reachable from LAN
- local API requires auth token
- workspace validation rejects unsafe roots
- secret-like paths blocked
- protected files redacted from diff/status
- no approval bypass
- no write outside approved workspace
- reset clears local sensitive app state
- provider credentials not copied into app storage

## 6.15 Performance and Quality Scenarios

- cold launch timing
- first voice reply latency
- text stream responsiveness
- long reply rendering
- memory behavior over long session
- CPU usage during voice session
- STT warmup versus cold-start behavior
- UI responsiveness while streaming

## 7. Special Scenarios Worth Explicitly Testing

These are easy to forget and should be tested intentionally.

- no workspace selected, user asks a general engineering question
- no workspace selected, user asks for a code change
- user selects workspace but keeps write access disabled
- user says something vague in voice and then follows up in text
- user starts a voice turn while the provider is rate limited
- user pastes an image and expects the app to keep it attached through restart
- user approves a change and then immediately restarts the app
- user disconnects one provider and switches to the other
- user tests everything in light theme only
- user tests on a laptop microphone in a noisy environment
- user has provider CLI already logged in before Oplyr is installed

## 8. Beta Pass / Fail Criteria

Beta should not be opened to broader external users unless these are true:

- clean install works on a fresh supported Mac
- onboarding is understandable without founder hand-holding
- at least one provider path is stable enough for real use
- voice mode is reliable enough for demo and real task discussion
- text chat is stable and persistent
- approval flow is trustworthy
- reset flow is trustworthy
- no machine-specific path assumptions remain
- no local Postgres requirement exists
- local history stays local
- download and update path is understandable

## 9. Bug Filing Guidance

When logging issues from this checklist, always include:

- machine type
- macOS version
- app version
- provider used
- workspace state
- voice or text mode
- exact reproduction steps
- expected result
- actual result
- logs / screenshot / screen recording where possible

## 10. Ongoing Rule

If Oplyr behaves differently from this checklist during beta, either:

- the product flow is wrong and should be fixed, or
- this document is stale and should be updated immediately

This file should stay current as the real source of truth for beta QA.
