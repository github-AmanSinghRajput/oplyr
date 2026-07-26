# Releases

This folder is the source of truth for what shipped in each Oplyr build.

- **[`CHANGELOG.md`](./CHANGELOG.md)** — running, developer-facing changelog (newest first).
- **[`../DISTRIBUTION.md`](../DISTRIBUTION.md)** — the full build → sign → notarize → staple → ship
  runbook (commands).
- **[`../FEATURES.md`](../FEATURES.md)** — the canonical list of current product features.

## How to cut a release

1. **Bump the version** in every package to the new `x.y.z`:
   ```bash
   npm pkg set version=x.y.z
   npm pkg set version=x.y.z -w @oplyr/web -w @oplyr/runtime -w @oplyr/desktop
   ```
2. **Write the changelog** — add a new section at the top of `CHANGELOG.md` (Added / Changed / Fixed).
3. **Build + notarize + ship** — follow `../DISTRIBUTION.md`. In short:
   - `rm -rf apps/desktop/release`
   - prep: STT (`swift build -c release`), `build:pack -w @oplyr/runtime`, `build -w @oplyr/web`,
     `rebuild:native -w @oplyr/desktop`
   - build both artifacts: `npx electron-builder --mac dmg zip --publish never` (from `apps/desktop`)
   - notarize + staple the **DMG** (electron-builder notarizes the `.app`, not the DMG wrapper)
   - restore dev ABI afterwards: `npm rebuild better-sqlite3 node-pty`
4. **Publish the auto-update feed** (this is what updates existing installs): upload **only**
   `Oplyr-x.y.z-arm64-mac.zip` + `.zip.blockmap` + `latest-mac.yml` to a GitHub release in
   `github-AmanSinghRajput/oplyr-releases`, marked **Latest**. Never upload the DMG here.
5. **New-user download**: upload the stapled **DMG** to the private R2 `oplyr-releases` bucket, keeping
   the current + one previous version, then point `R2_DMG_KEY` (Vercel env) at the new object.
6. **Website**: add the version to `vocod-website/content/releases.ts` (version, date, `sizeLabel`,
   `sha256` from `shasum -a 256`, notes). `macAssetUrl` stays `null` while access is invite-only.

## Conventions

- **Versioning**: semantic `major.minor.patch`. The DMG/zip name embeds the version + arch
  (`Oplyr-x.y.z-arm64.dmg`).
- **Distribution split**: DMG = gated first install (private R2 + emailed link). Zip + `latest-mac.yml`
  = the public auto-update feed on GitHub. The two must be built from the same version.
- **Framing**: "early access", not "beta", in all user-facing copy.
