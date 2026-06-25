# Voice Runtime Bootstrap

## Goal

Before onboarding or the main app becomes interactive, Oplyr must confirm that the local voice
runtime is ready:

- `Parakeet` for speech-to-text (single engine, no fallback)

TTS is intentionally deferred. Oplyr is STT-only for now. A future paid provider (e.g. ElevenLabs)
will be integrated when voice output becomes a priority.

If any required asset is missing, Oplyr blocks the UI and installs the bundled voice assets into
the per-user application data directory.

## Install location

On macOS, Oplyr installs runtime voice assets into:

`~/Library/Application Support/Oplyr/models`

This directory is separate from the `.app` bundle so the runtime survives app updates and can be
reused across reinstalls.

## Bootstrap flow

1. App starts and requests `GET /api/voice/bootstrap`.
2. If assets are already available, Oplyr warms the local runtime.
3. If assets are missing and bundled seed assets are available, Oplyr copies them into the user
   data models directory.
4. Oplyr enables background warmup for Parakeet (STT). While this runs, the main page shows a
   "Warming up the speech models" loader.
5. Only after bootstrap reaches `ready` does onboarding or the signed-in app shell render.

The bootstrap steps surfaced in the loader are: `parakeet`, `warmup`.

## Development behavior

In development, Oplyr can resolve assets from repository `local-models/`. The bootstrap screen will
still report the final user-data install location, but the runtime may already be ready from the
developer model root.

## Packaged desktop requirement

Packaged desktop builds should bundle the seed voice assets so the runtime can install them into the
user-data directory on first launch. The desktop shell passes a seed path through
`OPLYR_MODEL_SEED_DIR`.

## Failure behavior

The bootstrap screen must remain visible when:

- bundled voice assets are missing
- copying/installing voice assets fails
- background warmup fails (including Parakeet failing to load/warm)

In those cases Oplyr shows:

- current step state
- progress bar
- failure message
- retry action

## Uninstall and reinstall policy

- Removing `Oplyr.app` does **not** delete `~/Library/Application Support/Oplyr`.
- Reinstalling Oplyr should reuse the existing local database and voice assets if they are still
  present.
- A user who wants a completely clean reinstall must manually remove the Application Support
  directory as well.

Recommended clean reset on macOS:

```bash
rm -rf ~/Library/Application\ Support/Oplyr
```

## QA scenarios

- First launch on a machine with no voice assets
- First launch with bundled seed assets missing
- Retry after an interrupted copy/install
- Reinstall with existing Application Support data intact
- Clean reinstall after deleting the Oplyr Application Support directory
- Disconnecting a provider should not restart bootstrap when voice runtime is already `ready`
