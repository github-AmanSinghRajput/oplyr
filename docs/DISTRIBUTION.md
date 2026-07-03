# Shipping Oplyr — DMG, Signing, Notarization, Hosting (step by step)

This is the practical, beginner-friendly guide to getting a real, installable Oplyr build into
users' hands for the invite-only beta, and the path to Homebrew + the Mac App Store after we go
public. Read top to bottom the first time; after that it's a checklist.

> **Golden rule:** notarization is the LAST step. Most of the work is making the *packaged* app
> actually run on a machine that isn't your dev machine.

---

## Phase 0 — Apple Developer Program (do this now, in parallel)

- **Pay for the Apple Developer Program (~₹8,700 / $99 per year). Required.** Without a paid membership
  you cannot create the signing certificate or notarize, and the app is unusable on anyone else's Mac.
- After paying, in Xcode (Settings → Accounts) add your Apple ID, then create/download a
  **"Developer ID Application"** certificate (this is the one for distributing *outside* the App
  Store — the DMG path). The App Store uses a different cert later.
- Create an **app-specific password** at appleid.apple.com (Sign-In & Security → App-Specific
  Passwords). Notarization uses this, not your real password.
- Note your **Team ID** (found in the Apple Developer portal, top-right / Membership page).

You'll plug three things into notarization later: your **Apple ID email**, the **app-specific
password**, and your **Team ID**.

---

## Phase 1 — Make the packaged app actually run (engineering; the real blocker)

A built `.app` has no `npm`, no dev server, no `node_modules` layout. Status:

1. ✅ **Packaged API startup wired** (`apps/desktop/src/main.ts`). In a packaged build Electron now
   **forks the bundled API** (`resources/api/dist/index.js`) using its own Node via
   `ELECTRON_RUN_AS_NODE`, with production env (loopback host, generated token, DB in userData). Dev
   still spawns `npm run dev`, unchanged. The existing health-check gates "ready".
2. ✅ **STT binary + token path wired.** The packaged env passes `OPLYR_STT_BINARY` →
   `resources/stt/oplyr-stt` (the API already prefers that env var), and the auth-token file now lives
   in writable **userData** when packaged (the old path was inside the read-only .app).
3. ⏳ **First-run model download** (decided: download on first run). The provisioner exists; still to
   build: a first-run progress UI + the SHA-256 integrity check from SECURITY_AUDIT.md.
4. ✅ **Packaged app verified on-device (2026-07-03):** built an unsigned `.app`, it launches, the web
   UI renders, and the forked API connects (onboarding loads). Key fixes that got it working: ship
   `web/dist` + Vite `base: './'`; ship `file-uri-to-path`; bump better-sqlite3 → 12.11.1 (Electron-42
   V8) and rebuild via `-m apps/api`; rebuild node-pty via `-m apps/desktop`; launch the API with
   `spawn(process.execPath, [entry])` + `ELECTRON_RUN_AS_NODE` (NOT `fork()` — its IPC channel broke it).
   Still pending: first-run speech-model download UI (voice shows "needs attention" until the model exists).

⚠️ **GUI-launch PATH gotcha (fixed 2026-07-03):** apps launched via Finder/`open` inherit a minimal
`PATH` (`/usr/bin:/bin:/usr/sbin:/sbin`) that omits Homebrew (`/opt/homebrew/bin`), npm-global and
nvm dirs — so the forked API couldn't find the agent CLIs (`codex`/`claude`/`gemini`), surfacing
"OpenAI Codex is not installed on this machine yet." (git works because it's in `/usr/bin`.) Fixed in
`main.ts`: `fixPackagedPath()` probes the user's login+interactive shell (`$SHELL -ilc`) once at
`whenReady` (packaged only) and merges the real PATH in, so the forked API and everything it spawns
resolve the CLIs. Dev is launched from a terminal (full PATH) so it's skipped there.

⚠️ **Native-module gotcha for Phase 2:** the API's `better-sqlite3` is a native addon. Because it runs
under Electron's Node ABI (via `ELECTRON_RUN_AS_NODE`), electron-builder must rebuild it for Electron
(`@electron/rebuild`, which electron-builder runs automatically) and ship `resources/api/node_modules`
**unpacked** from asar. This is verified only when we do the first real build in Phase 2.

_Startup code is written but unverifiable until the Phase 2 build runs on your Mac._

---

## Phase 2 — Packaging config + app/DMG icon

We use **electron-builder** (automates DMG creation, signing, and notarization). Status:

- ✅ **`electron-builder.yml`** added (`appId: com.oplyr.desktop`, product `Oplyr`, `dmg` target,
  hardened runtime, entitlements, `notarize: true`, resource layout for `api/` + `stt/`), plus the
  `electron-builder` dev dep and a `dist` script (`npm run dist`).
- ✅ **`build/entitlements.mac.plist`** added (JIT + unsigned-exec-memory + disable-library-validation
  for the native addon/child processes + `device.audio-input` for the mic).
- ✅ **Icon generated.** `build/icon-source.svg` (the Oplyr mark on a dark brand background) →
  `build/icon-1024.png` → `build/icon.icns` via `scripts/make-icon.sh`. Used for **both** the app icon
  and the DMG volume icon. **Verify it looks right visually**, and regenerate from a higher-fidelity
  master anytime by replacing `build/icon-1024.png` and running `npm run icon`.

✅ **API bundling done + validated.** `npm run build:pack -w @oplyr/runtime` esbuilds the whole API to
a single `apps/api/dist-pack/server.mjs` (~1.6 MB, ESM, `better-sqlite3` kept external) — verified it
bundles + passes `node --check`. Packaged paths fixed: migrations dir (`OPLYR_MIGRATIONS_DIR`), token
file (userData), STT binary + `NODE_PATH` all resolve from `resources/` when packaged. Packaging
resources live in **`apps/desktop/assets/`** (tracked; the old `build/` is gitignored).

### Free local test build — the recipe (run on your Mac)

```
# 1. install deps (adds electron-builder + esbuild)
npm install

# 2. build the native STT binary (Apple Silicon)
(cd apps/stt && swift build -c release)

# 3. bundle the API + generate the icon
npm run build:pack -w @oplyr/runtime
npm run icon -w @oplyr/desktop        # regenerates assets/icon.icns from the logo

# 4. rebuild native modules (better-sqlite3, node-pty) for Electron's ABI — one reliable command.
#    (`npm install`/`npm rebuild` build them for system Node, which the packaged app can't load.
#    @electron/rebuild --force and node-gyp's CLI --target were both unreliable; the script uses the
#    npm_config_* env form. better-sqlite3 must be >= 12.11 for Electron 42's V8.)
npm run rebuild:native -w @oplyr/desktop

# 5. package (local test build → the .app; DMG needs a less-restricted Mac or a paid cert)
npm run pack:test -w @oplyr/desktop   # → apps/desktop/release/mac-arm64/Oplyr.app (no DMG/hdiutil)
open apps/desktop/release/mac-arm64/Oplyr.app
```

⚠️ **The dev ↔ package ABI dance.** The native modules can only be built for ONE ABI at a time:
- **To package:** `npm run rebuild:native -w @oplyr/desktop` (Electron ABI), then `pack:test`/`dist`.
- **To run dev / `npm test`:** `npm rebuild better-sqlite3 node-pty` (system-Node ABI).
- Any `npm install` resets them to system-Node ABI, so re-run `rebuild:native` before packaging again.

The app bundle ships `file-uri-to-path` + `better-sqlite3` under `resources/api/node_modules`
(better-sqlite3 → bindings → file-uri-to-path). Model integrity: HuggingFace Hub verifies each file's
SHA-256 on download; a pinned vocab-file canary (`model-integrity.ts`) rejects a tampered on-disk
model, fail-open. Pre-GA: pin the HF repo revision.

⏳ **Expect iteration here.** The first `npm run dist` will very likely error on the native module or a
missing path — that's normal for Electron packaging. Run it, paste me the error, and we fix it round
by round until the packaged app launches, reaches API health, and mic/STT work. The result is a
**testing-only** DMG (right-click → Open to bypass Gatekeeper on your Mac); it is NOT distributable
until you have the paid account and flip `notarize: true`.

_Owner: Claude (config, icon, bundling, path fixes — done). You: run the recipe + report failures._

---

## Phase 3 — Sign + notarize + staple (you run this on your Mac)

With electron-builder, this is mostly automatic once the environment is set. Set these env vars
(never commit them — use your shell, a local untracked `.env`, or CI secrets):

```
APPLE_ID="you@apple.com"
APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
APPLE_TEAM_ID="YOURTEAMID"
CSC_NAME="Developer ID Application: Your Name (YOURTEAMID)"   # the signing identity
```

Then:

```
npm run dist --workspace @oplyr/desktop     # (script we'll add) → builds, signs, notarizes, staples
```

electron-builder will: codesign with hardened runtime → submit to Apple's notary service →
staple the ticket to the DMG. Verify:

```
spctl -a -t open --context context:primary-signature -v Oplyr.dmg   # should say "accepted / Notarized Developer ID"
xcrun stapler validate Oplyr.dmg
```

If you ever do it by hand (understanding the pieces): `codesign --deep --force --options runtime
--sign "$CSC_NAME" Oplyr.app` → zip → `xcrun notarytool submit --apple-id … --team-id … --password …
--wait` → `xcrun stapler staple Oplyr.dmg`.

---

## Phase 4 — Where to host the DMG

**Recommended: GitHub Releases.** Stable per-version URLs, free, and it's exactly what Homebrew casks
and auto-update expect later. Alternative: `oplyr.com/downloads/…` on Vercel/blob storage.

Whichever you pick, the download must be a **public, unauthenticated URL** (see the invite-gate note
below) with a stable per-version path and a published **SHA-256**.

Wire it into the site: put the version + URL + SHA-256 into `content/releases.ts` (already built for
this — `macAssetUrl`), and the `/download` page + CTA light up automatically.

---

## Phase 5 — Website, invite gate, email, DB (Claude)

The beta is **invite-only**, but `brew`/direct download can't go through a login wall, so we split it:
the **DMG URL is public**; the **invite gate lives inside the app** (you need an approved invite to
log in / use it). The website flow:

1. User joins the waitlist (exists). Admin approves → we **email them the download link + their
   invite** (new email template).
2. `/download` page already auto-detects macOS + shows requirements; the download button becomes live
   once `macAssetUrl` is set, and clicks are logged (`app_download_events`, already wired).
3. **Security:** keep the download URL public but rate-limit/track; the invite/login gate protects
   *use*, not the download. Validate all new form/endpoint inputs; no secrets in client.
4. **DB:** the download-events table is auto-created; if we email invites-with-links we may add an
   `invite_token`/`download_url` column to `beta_invites` — decided when we build this phase.

---

## Phase 6 — After public launch (documented now; build later)

Neither is appropriate during invite-only beta (both need a public, notable, stably-versioned,
login-free download).

### Homebrew (own tap first)
- Requires a signed + notarized DMG at a stable public URL + SHA-256 (Phases 3–4).
- Create a `homebrew-oplyr` GitHub repo with `Casks/oplyr.rb` (version, sha256, url, name, homepage,
  `app` stanza, `auto_updates true`). Users then run:
  ```
  brew tap oplyr/oplyr
  brew install --cask oplyr
  ```
- Automate the per-release `version` + `sha256` bump with a GitHub Action.
- Submit to the official `homebrew-cask` only once Oplyr is public + notable (invite-only/beta
  versions are rejected).

### Mac App Store
- Separate track: needs an **App Store Distribution** certificate + provisioning, **App Sandbox**
  entitlements (stricter than the Developer ID hardened runtime — our child-process API + native STT
  + terminal will need careful entitlement review or may not be App-Store-compatible as-is), an App
  Store Connect listing, screenshots, privacy nutrition labels, and Apple review.
- Realistically a post-1.0 effort; the DMG (Developer ID) path is the beta/GA distribution channel.

---

## Quick status

- Phase 0: **you** — pay Apple, make cert + app-specific password.
- Phase 1: not started — the real gate (packaged runtime not wired).
- Phase 2: not started — no electron-builder config yet; icon pipeline defined here.
- Phases 3–4: blocked on 1–2.
- Phase 5: `/download` page + event logging done; invite-email + wiring pending.
- Phase 6: documented; build post-public.
