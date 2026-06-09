#!/usr/bin/env bash
# Full macOS build: backend (PyInstaller) + frontend (Vite) + Electron (DMG/ZIP)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "Error: macOS build must run on macOS (PyInstaller + electron-builder)." >&2
  exit 1
fi

echo "==> Backend (PyInstaller)"
cd backend
python3 -m pip install -r requirements.txt pyinstaller
python3 -m PyInstaller backend.spec --distpath ../dist/backend --clean --noconfirm
cd "$ROOT"

echo "==> Frontend (Vite)"
cd frontend
npm ci
npm run build
cd "$ROOT"

echo "==> Electron (DMG + ZIP)"
cd electron
npm ci
npm run build:mac
cd "$ROOT"

echo "Done. Output: dist/installer/"
