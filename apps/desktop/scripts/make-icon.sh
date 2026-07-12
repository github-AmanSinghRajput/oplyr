#!/usr/bin/env bash
#
# Build the macOS app/DMG icon (build/icon.icns) from a single 1024x1024 PNG master.
# electron-builder uses build/icon.icns for BOTH the app icon and the DMG volume icon, so the .dmg
# file itself shows the Oplyr logo.
#
# Usage (from apps/desktop):  ./scripts/make-icon.sh
# Requires macOS built-ins: sips + iconutil. No extra installs.
#
# One-time input: export the Oplyr logo mark as a 1024x1024 PNG to build/icon-1024.png first.
set -euo pipefail

DESKTOP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
MASTER="$DESKTOP_DIR/assets/icon-1024.png"
ICONSET="$DESKTOP_DIR/assets/icon.iconset"
OUT="$DESKTOP_DIR/assets/icon.icns"

if [ ! -f "$MASTER" ]; then
  echo "error: missing $MASTER" >&2
  echo "Export the Oplyr logo mark as a 1024x1024 PNG to that path, then re-run." >&2
  exit 1
fi

rm -rf "$ICONSET"
mkdir -p "$ICONSET"

# macOS iconset requires these exact sizes (1x and 2x).
for size in 16 32 128 256 512; do
  sips -z "$size" "$size" "$MASTER" --out "$ICONSET/icon_${size}x${size}.png" >/dev/null
  retina=$((size * 2))
  sips -z "$retina" "$retina" "$MASTER" --out "$ICONSET/icon_${size}x${size}@2x.png" >/dev/null
done

iconutil -c icns "$ICONSET" -o "$OUT"
rm -rf "$ICONSET"
echo "Wrote $OUT"
