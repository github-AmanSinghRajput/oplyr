# Releases

This folder is the source of truth for what shipped in each Oplyr build.

- **[`CHANGELOG.md`](./CHANGELOG.md)** — running, developer-facing changelog (newest first).
- **[`../DISTRIBUTION.md`](../DISTRIBUTION.md)** — the full build → sign → notarize → staple → ship
  runbook (commands).
- **[`../FEATURES.md`](../FEATURES.md)** — the canonical list of current product features.

## How to cut a release

**The commands live in one place: [`../DISTRIBUTION.md` → Release runbook](../DISTRIBUTION.md#release-runbook).**
Follow it top to bottom. This file previously carried a second, subtly different copy of those steps;
that's how a release went out with an unsigned DMG.

The shape of it, so you know what you're committing to:

1. Version bump across all four workspaces + `npm run check` must pass.
2. A new `CHANGELOG.md` section (Added / Changed / Fixed), then commit and push.
3. Build the DMG **and** zip in one electron-builder pass, from `apps/desktop`.
4. Sign → notarize → staple the **DMG** by hand. electron-builder does the `.app`, never the wrapper.
5. Verify both artifacts, boot-test the packaged app, then publish.
6. Restore the dev ABI: `npm rebuild better-sqlite3 node-pty`.

## Where each artifact goes

- **Auto-update feed (public)** — `Oplyr-x.y.z-arm64-mac.zip` + `.zip.blockmap` + `latest-mac.yml` to
  a GitHub release in `github-AmanSinghRajput/oplyr-releases`, marked **Latest**. This is what updates
  existing installs. **Never upload the DMG here.**
- **New-user download (gated)** — the stapled **DMG** to the private R2 `oplyr-releases` bucket. Keep
  the current plus one previous version, then point `R2_DMG_KEY` (Vercel env) at the new object.
- **Website** — add the version to `vocod-website/content/releases.ts` (version, date, `sizeLabel`,
  `sha256`, notes). `macAssetUrl` stays `null` while access is invite-only.

## Conventions

- **Versioning**: semantic `major.minor.patch`. The DMG/zip name embeds the version + arch
  (`Oplyr-x.y.z-arm64.dmg`).
- **Distribution split**: DMG = gated first install (private R2 + emailed link). Zip + `latest-mac.yml`
  = the public auto-update feed on GitHub. The two must be built from the same version.
- **Framing**: "early access", not "beta", in all user-facing copy.
