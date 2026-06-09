#!/usr/bin/env bash
# Optional: launch PCYBOX Orbis with sudo from the Terminal.
# Double-clicking the .app now prompts for your macOS password automatically.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP=""

if [[ -d "$ROOT/dist/installer/mac/PCYBOX Orbis.app" ]]; then
  APP="$ROOT/dist/installer/mac/PCYBOX Orbis.app"
elif [[ -d "/Applications/PCYBOX Orbis.app" ]]; then
  APP="/Applications/PCYBOX Orbis.app"
else
  echo "PCYBOX Orbis.app introuvable." >&2
  exit 1
fi

BIN="$APP/Contents/MacOS/PCYBOX Orbis"
exec sudo "$BIN"
