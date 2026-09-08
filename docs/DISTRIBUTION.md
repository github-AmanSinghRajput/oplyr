# Shipping Oplyr — DMG, Signing, Notarization, Hosting

**[Release runbook](#release-runbook) is what you want for a normal release.** Everything below it is
one-time setup and background on how the packaging works.

> **Golden rule:** notarization is the LAST step. Most of the work is making the _packaged_ app
> actually run on a machine that isn't your dev machine.

---

## Release runbook

Copy-paste, in order. `X.Y.Z` is the new version.

**Before you start**

- Quit the installed `/Applications/Oplyr.app` — it owns port 8787.
- Export the three notarization secrets: `APPLE_ID`, `APPLE_TEAM_ID`,
  `APPLE_APP_SPECIFIC_PASSWORD`. Then run this preflight, which resolves the signing identity from
  the keychain and fails loudly if anything is missing:

```bash
: "${APPLE_ID:?export APPLE_ID first}" \
  "${APPLE_TEAM_ID:?export APPLE_TEAM_ID first}" \
  "${APPLE_APP_SPECIFIC_PASSWORD:?export APPLE_APP_SPECIFIC_PASSWORD first}"

# Resolve the identity instead of retyping it. `security find-identity` prints the SHA-1, which
# codesign accepts and which cannot be broken by a quoting or name mismatch.
export CSC_NAME=$(security find-identity -v -p codesigning \
  | awk '/Developer ID Application/{print $2; exit}')
echo "signing identity: ${CSC_NAME:?no Developer ID Application identity in the keychain}"
```

> **Why the preflight exists.** electron-builder finds the signing identity on its own, so a missing
> `CSC_NAME` causes no trouble until step 4, which then fails with a bare `: no identity found` —
> the empty string before the colon IS the error. This has bitten more than once. Resolving the
> identity from the keychain removes the variable you can forget.

```bash
cd /Users/amansingh/Desktop/aman/vocod/VOCOD

# ── 1. Version + gate ─────────────────────────────────────────────────
npm version X.Y.Z --workspaces --include-workspace-root --no-git-tag-version
npm run format          # must precede check, or format:check fails
npm run check           # format + lint + typecheck + tests, must exit 0
# add the X.Y.Z entry to docs/releases/CHANGELOG.md, then commit + push

# ── 2. Clean + build ──────────────────────────────────────────────────
rm -rf apps/desktop/release        # a dirty release/ causes transient hdiutil errors
npm run build:stt                  # Swift STT binary (Apple Silicon)
npm run build:pack -w @oplyr/runtime
npm run build -w @oplyr/web
npm run rebuild:native -w @oplyr/desktop   # native modules for Electron's ABI — never skip

# ── 3. Package both artifacts, ONE TARGET AT A TIME — FROM apps/desktop ───
cd apps/desktop
npm run dist:mac
# → release/Oplyr-X.Y.Z-arm64.dmg
#   release/Oplyr-X.Y.Z-arm64-mac.zip{,.blockmap} + latest-mac.yml
#
# `dist:mac` is two invocations in a fixed order, and both parts of that matter:
#   electron-builder --mac dmg --publish never
#   electron-builder --mac zip --prepackaged release/mac-arm64/Oplyr.app --publish never
#
#  - NOT in one pass. `--mac dmg zip` builds the targets concurrently, so `hdiutil create
#    -srcfolder` copies Oplyr.app while the zip target reads the same tree, and hdiutil dies with a
#    bare `unable to execute hdiutil ... Exit code: 1`. electron-builder retries and usually still
#    produces a valid DMG, so this reads as noise. It is not: verify the DMG before trusting it.
#  - ZIP LAST. The last target to run owns `latest-mac.yml`, and the update feed must point at the
#    zip. A dmg-last build rewrites it to `path: Oplyr-X.Y.Z-arm64.dmg` and breaks auto-update for
#    every existing install. Step 6 checks this.
#  - `--prepackaged` on the second call reuses the app the first call already signed and notarized,
#    so nothing is re-notarized and the zip is byte-identical to the notarized build. It takes
#    seconds, and it is what makes splitting the targets safe (the old warning here about a second
#    invocation clobbering release/ applied to re-running the FULL build, which --prepackaged skips).
#  - The cwd must be apps/desktop. From the repo root it packages the ROOT package.json as the app
#    and dies with 'Application entry file "index.js" ... does not exist'.
#
# electron-builder signs AND notarizes the .app inside both. It does NOT touch the DMG wrapper.

# ── 4. Sign, notarize and staple the DMG ──────────────────────────────
# Sign FIRST: signing modifies the file, which would invalidate a ticket stapled earlier.
cd release
codesign --force --timestamp --sign "${CSC_NAME:?run the preflight above}" Oplyr-X.Y.Z-arm64.dmg
xcrun notarytool submit Oplyr-X.Y.Z-arm64.dmg \
  --apple-id "$APPLE_ID" --team-id "$APPLE_TEAM_ID" \
  --password "$APPLE_APP_SPECIFIC_PASSWORD" --wait
xcrun stapler staple Oplyr-X.Y.Z-arm64.dmg

# ── 5. Verify the DMG (this is the real success check) ────────────────
xcrun stapler validate Oplyr-X.Y.Z-arm64.dmg
spctl -a -t open --context context:primary-signature -v Oplyr-X.Y.Z-arm64.dmg
# BOTH must pass. spctl MUST say: accepted / source=Notarized Developer ID.
# "rejected / no usable signature" = the DMG is not codesigned → redo step 4 from the top.
ls -lh Oplyr-X.Y.Z-arm64.dmg && shasum -a 256 Oplyr-X.Y.Z-arm64.dmg

# ── 6. Verify the zip (the auto-update feed) ──────────────────────────
grep -m1 'version:' latest-mac.yml                       # must be X.Y.Z
grep -m1 'path:' latest-mac.yml                          # MUST be the .zip, never the .dmg
rm -rf /tmp/zt && mkdir -p /tmp/zt && ditto -x -k Oplyr-X.Y.Z-arm64-mac.zip /tmp/zt
spctl -a -t exec -vv /tmp/zt/Oplyr.app                   # accepted / Notarized Developer ID
echo "zip: $(openssl dgst -sha512 -binary Oplyr-X.Y.Z-arm64-mac.zip | openssl base64 -A)"
echo "yml: $(grep -m1 'sha512:' latest-mac.yml | awk '{print $2}')"   # must match
rm -rf /tmp/zt

# ── 7. Boot-test the packaged app BEFORE publishing ───────────────────
cd /Users/amansingh/Desktop/aman/vocod/VOCOD
apps/desktop/release/mac-arm64/Oplyr.app/Contents/MacOS/Oplyr
# want: "server.started port:8787"   NOT: ERR_MODULE_NOT_FOUND
# 0.2.0 shipped broken exactly here — see the extraResources gotcha below.

# ── 9. Restore the dev tree ───────────────────────────────────────────
npm rebuild better-sqlite3 node-pty
```

**Step 8 — Publish (manual, between 7 and 9)**

- **GitHub** `oplyr-releases` → new release, tag `vX.Y.Z`, marked **Latest** (not pre-release —
  electron-updater reads the latest release's `latest-mac.yml`). Upload **only** the zip, its
  `.blockmap`, and `latest-mac.yml`. Miss one and existing installs never see the update.
  **Never upload the DMG here** — the auto-update feed is public, the DMG is gated.
- **R2** (private bucket `oplyr-releases`) → upload the stapled DMG, keep the current plus one
  previous version, then point the Vercel env `R2_DMG_KEY` at the new object.
- **Website** → add the version to `vocod-website/content/releases.ts` (version, date, `sizeLabel`,
  `sha256` from step 5). Skip if you're not publishing notes for this release.

**Step 10 — Verify auto-update:** on a machine running the previous version, fully quit and relaunch
Oplyr → it should find X.Y.Z, download, and offer to restart.

---

## One-time setup and background

Everything below was written while packaging was first being figured out. It's reference now, not a
checklist — the runbook above supersedes it.

---

## Phase 0 — Apple Developer Program (do this now, in parallel)

- **Pay for the Apple Developer Program (~₹8,700 / $99 per year). Required.** Without a paid membership
  you cannot create the signing certificate or notarize, and the app is unusable on anyone else's Mac.
- After paying, in Xcode (Settings → Accounts) add your Apple ID, then create/download a
  **"Developer ID Application"** certificate (this is the one for distributing _outside_ the App
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

`npm run dist --workspace @oplyr/desktop` then codesigns the `.app` with the hardened runtime,
submits **the app** to Apple's notary service, and staples the ticket to **the app**.

> **It stops there.** electron-builder neither signs nor notarizes the **DMG wrapper**. An unsigned,
> un-notarized DMG fails `spctl -a -t open` with _"no usable signature"_ and shows users the
> "Apple could not verify this app is free of malware" dialog — the exact thing you're paying for a
> certificate to avoid.
>
> Steps 4 and 5 of the [release runbook](#release-runbook) do the DMG half. Don't skip them, and sign
> before notarizing — signing rewrites the file and voids a ticket stapled beforehand.

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
   _use_, not the download. Validate all new form/endpoint inputs; no secrets in client.
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
  - terminal will need careful entitlement review or may not be App-Store-compatible as-is), an App
    Store Connect listing, screenshots, privacy nutrition labels, and Apple review.
- Realistically a post-1.0 effort; the DMG (Developer ID) path is the beta/GA distribution channel.

---

## Quick status (updated 2026-09 — shipping 0.5.0)

Everything below Phase 0 is DONE and now reads as background. The commands you actually run each
release are in the [release runbook](#release-runbook) at the top of this file;
[`releases/README.md`](./releases/README.md) covers where each artifact gets published.

- Phase 0 — ✅ Apple Developer account active; Developer ID cert + app-specific password in place.
- Phase 1 — ✅ Packaged app runs on-device: forked API, STT binary, PATH fix, native modules.
- Phase 2 — ✅ electron-builder config + icon + esbuild API bundle, all validated.
- Phases 3–4 — ✅ Signed, notarized and stapled — **the app by electron-builder, the DMG by hand.**
- Phase 5 — ✅ Website `/download`, invite gate, and emailed `/get` link live.
- Phase 6 — Homebrew / Mac App Store: still post-public, unbuilt.

### Two gotchas learned the hard way (not obvious from the phases above)

**Ship every esbuild external AND the native deps of those externals.** The first rule cost us
0.2.0 (a missing `node-pty` stopped the API booting). The second cost us everything through 0.4.1:
`@xenova/transformers` shipped, but its `onnxruntime-node` did not, because the packaging config
assumed transformers would fall back to the bundled WASM runtime. It does not —
`backends/onnx.js` holds a **static** `import * as ONNX_NODE from 'onnxruntime-node'`, so the
module must resolve even when WASM is the backend actually used. Absent it, the whole embedding path
failed at load, every brain atom was stored with no vector, and semantic recall silently degraded to
keyword overlap. Nothing in the product said so; only `brain.embeddings.unavailable` in
`api-child.log` did. **After any packaging change, check the log for that event and confirm
`brain.embeddings.ready` instead.**

- **Don't set `CSC_NAME`** to the full `"Developer ID Application: …"` string — electron-builder auto-
  selects the cert from the keychain, and the prefixed name trips its validation.
- **electron-builder notarizes the `.app`, not the DMG wrapper.** After `npm run dist` you must still
  `codesign` → `notarytool submit` → `stapler staple` the DMG by hand. And quit the installed
  `/Applications/Oplyr.app` before `dev:desktop` — they both bind `:8787`.
