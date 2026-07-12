# Oplyr Security Audit & Hardening (pre-beta)

Adversarial pre-launch pentest of the Oplyr desktop app + local runtime. Goal: withstand an Apple
notarization/app review, a hostile security researcher, or a malicious repo/website without anything
to question. Status legend: ✅ fixed · 🔎 verified-false-alarm · ⏳ pending · 📋 documented.

## Threat model — who can attack, and how

Oplyr runs a **loopback HTTP + WebSocket API** on the user's Mac, drives **AI coding-agent CLIs**
(Codex/Claude/Gemini) that execute in the user's project, and captures **voice**. The untrusted
principals are:

1. **Any website the user has open in a browser** — can it reach `127.0.0.1` (CSRF / DNS-rebinding)
   and drive or read the local API / WebSocket?
2. **The renderer, if compromised** (XSS, malicious dep) — the Electron IPC boundary is the blast wall.
3. **The AI model's output + chat/voice/attachment text** (prompt injection) — flows into spawned CLIs.
4. **File/branch/path names inside a connected repo** — flow into git and the agents.
5. **A local co-user** on a shared Mac — file permissions on transcripts/tokens.
6. **The model-download supply chain** — the STT weights fetched at first run.

## Findings

### ✅ Fixed this pass
- **[CRITICAL→fixed] Voice WebSocket was unauthenticated in the default config.** `voice-stream.gateway.ts`
  gated on `env.localApiAuthToken` (empty by default) with a non-timing-safe `!==` and **no Origin
  check** — so any web page could open `ws://127.0.0.1:8787/api/voice/stream` and **spawn unbounded
  native STT workers** (DoS), inheriting full `process.env`. Fixed: authenticate against the *resolved*
  API token (the same secret HTTP uses) with `timingSafeEqual`, **fail closed**, add an Origin
  allowlist (trusted renderer / packaged `file://` only), cap concurrent workers (3), and strip
  `LOCAL_API_AUTH_TOKEN` from the worker env. Regression test added (unauthenticated connect → 1008).
- **[Medium→fixed] DNS-rebinding defense-in-depth.** Added a Host-header allowlist (loopback only) as
  the first HTTP middleware, so a rebound domain can't treat the local API as same-origin — and it
  guards the pre-auth health routes too.
- **[High→fixed] Secret filter defeated by git path-quoting.** `isSecretRelativePath` now dequotes
  git output (strips wrapping quotes + collapses C-escapes) before matching, so `"café.pem"` /
  `".aws/credentials"` no longer slip through. Denylist broadened (`.ssh`/`.gnupg`/`private`/`certs`
  dirs; `.env` suffix; `.p8/.jks/.keystore/.kdbx/.netrc/.pgpass/.git-credentials/*.tfstate`, …).
  Regression test added (`path-security.test.ts`).
- **[High→fixed] Agent CLIs inherited the API token.** All Codex/Claude/Gemini spawns now use
  `agentSpawnEnv()` (`lib/spawn-env.ts`), which strips `LOCAL_API_AUTH_TOKEN` from the child env — an
  agent can no longer read the local API secret from its own environment.
- **[Medium→fixed] World-readable local data.** The runtime DB (+ `-wal`/`-shm`) and attachment blobs
  are now created `0o600` in `0o700` dirs, so a co-user on a shared Mac can't read transcripts/uploads.
- **[High→fixed] Model slug not allowlisted.** Claude/Gemini persist only a known slug; Codex's
  `normalizeCodexSettings` now returns the validated canonical slug (drops unknown → default) so no
  arbitrary string reaches `--model` / `-c model=…`.
- **[Medium→fixed] `shell.openExternal` scheme allowlist.** The window-open handler now opens only
  `http(s)` URLs, blocking `file:`/custom-scheme launches from renderer-originated opens.

### 🔎 Verified — not the vuln it looked like
- **HTTP "auth off by default / any website drives the API"** — actually mitigated: `resolveLocalApiAuthToken`
  *always* returns a non-empty token (generates + persists `0o600` if unset) and both entrypoints pass
  it to `createApp`, so every `/api/*` route requires the header token a cross-origin page can't obtain.
  The `if (!expectedToken) next()` branch only triggers in tests (no token passed). Left as-is;
  consider a `production`-env assertion later.
- **Git/Codex command injection** — not present. Every git call uses `execFile('git', [argv])` with
  `--` before file paths; agent CLIs spawn with `shell:false`. The one `-lc` shell use (STT) is built
  only from a resolved, shell-escaped binary path — transcripts never reach it.
- **Data egress / "nothing leaves your Mac"** — holds up: no telemetry/analytics/crash reporting; API
  binds `127.0.0.1`; audio goes mic → local WS → local STT binary; only provider CLIs egress (user-chosen).

### ⏳ Pending — prioritized

**P0 — ⏳ DEFERRED (decision logged 2026-07-02): accepted risk for the invite-only beta; revisit
before public GA and before recommending Claude/Gemini for write-mode with untrusted prompts.**
Interim mitigation to consider: keep **Codex** (the sandboxed path) as the recommended provider for
write-enabled turns, and surface a one-time warning when a write turn runs on Claude/Gemini.

- **Claude & Gemini approved-writes run UNSANDBOXED shell, unreviewed.** The "reviewed-diff" guarantee
  holds only for Codex (`--sandbox workspace-write`). `claude-client.ts:848` grants the `Bash` tool;
  `gemini-client.ts:507` uses `--approval-mode yolo`. The approval UI shows file diffs, but the agent
  turn can run arbitrary shell (exfiltrate `~/.ssh`, write outside the project) with side effects the
  diff never shows — and chat/voice/attachment text is partly attacker-influenced (prompt injection).
  Fix direction: confine all three equivalently — drop `Bash` from Claude's write path (Read/Edit/Write
  only) + a workspace-scoped permission mode; replace Gemini `yolo` with a non-shell, workspace-scoped
  auto-edit; if shell is ever needed, surface the commands for review. Needs verifying each CLI's flags.

**P1 — all fixed (see "Fixed this pass" above): secret-filter dequote + denylist, agent env token
stripping, DB/attachment `0o600`, model-slug allowlist, `openExternal` scheme allowlist.**

**P2 — mostly fixed this pass:**
- ✅ **Generic 500 error bodies.** Both the global handler and the NDJSON stream now return a generic
  message for unclassified errors (only `AppError` / assistant friendly messages surface); the real
  error stays in the server log.
- ✅ **Electron origin hardening.** Dev renderer + media checks are now exact-origin (`new URL().origin`
  === trusted) instead of loose `startsWith`; added `webviewTag: false` and a `will-frame-navigate`
  lock so subframes can't navigate to attacker content.
- ✅ **FluidAudio pinned exactly** (`exact: "0.15.3"`) so the native model-download dependency can't
  drift without review.
- ✅ **STT model download integrity (mitigated 2026-07-03).** Investigation corrected the original
  finding: FluidAudio downloads via **HuggingFace Hub, which verifies each file's SHA-256** against the
  repo on download (per-file integrity is already active over HTTPS). Added a **tamper canary**
  (`apps/api/src/features/voice/model-integrity.ts`) — a pinned SHA-256 of the stable vocab file,
  checked after provision; a present-but-mismatched model is rejected, fail-open if the file isn't
  where expected (never false-rejects a valid model). A full-model hash pin was rejected as too
  fragile (461 MB / 23 files incl. compiled CoreML → false-reject risk). **Pre-GA:** pin the HF repo
  revision (needs a FluidAudio API/feature) so the model version can't be swapped upstream.
- 📋 **CSP notes.** `style-src 'unsafe-inline'` is retained by necessity (React inline `style={…}` +
  framer-motion set style attributes at runtime; there's no nonce mechanism for style *attributes*).
  `script-src`/`worker-src` allow `blob:` so the AudioWorklet (mic capture) can load its module from an
  app-created Blob URL under `file://` — a standard, low-risk worklet concession. The security-critical
  parts hold: **no `unsafe-inline`/`unsafe-eval` for scripts**, `object-src 'none'`, `base-uri 'self'`.
  Delivered via `<meta>` (correct for the packaged `file://` renderer). Accepted trade-offs.

## Solid (defenses that already hold)
Electron `contextIsolation:true` + `nodeIntegration:false` + `sandbox:true`, strict `script-src 'self'`
CSP (no unsafe-eval), IPC sender-URL validation on every handler, loopback bind, 256-bit `0o600`
API token with timing-safe HTTP compare, realpath+symlink+`..` workspace-boundary enforcement, secret
policy applied on read and in diffs, no committed secrets, no TLS-verify bypasses, clean `npm audit`
(one dev-only low).
