#!/usr/bin/env bash
# One-time setup of the shared timing environment (Whisper, Demucs, librosa; CPU builds).
# Lives outside the skill so the skill folder stays small and git-friendly.
# Usage: bash setup_env.sh            (idempotent: exits fast when already set up)
set -euo pipefail

VENV="${RAW_KINETIQ_VENV:-$HOME/.raw-kinetiq/venv}"
if [ -x "$VENV/Scripts/python.exe" ]; then PY="$VENV/Scripts/python.exe"; else PY="$VENV/bin/python"; fi

if [ -x "$PY" ] && "$PY" -c "import faster_whisper, librosa, demucs, soundfile" 2>/dev/null; then
  echo "ready: $PY"
  exit 0
fi

# first python that really runs (on Windows "python3" can be the Microsoft Store stub)
BASE_PY=""
for c in python python3 "py -3"; do
  if $c -c "import sys; assert sys.version_info >= (3, 10)" >/dev/null 2>&1; then BASE_PY="$c"; break; fi
done
[ -n "$BASE_PY" ] || { echo "no Python 3.10+ found on PATH" >&2; exit 1; }
mkdir -p "$(dirname "$VENV")"
if [ ! -x "$PY" ]; then $BASE_PY -m venv "$VENV"; fi
if [ -x "$VENV/Scripts/python.exe" ]; then PY="$VENV/Scripts/python.exe"; else PY="$VENV/bin/python"; fi

"$PY" -m pip install -q --upgrade pip
# CPU torch first so demucs doesn't pull a multi-GB CUDA build (macOS wheels are CPU already)
if [ "$(uname -s)" = Darwin ]; then
  "$PY" -m pip install -q torch torchaudio
else
  "$PY" -m pip install -q torch torchaudio --index-url https://download.pytorch.org/whl/cpu
fi
"$PY" -m pip install -q faster-whisper librosa soundfile demucs
"$PY" -c "import faster_whisper, librosa, demucs, soundfile; print('ready:', '$PY')"
