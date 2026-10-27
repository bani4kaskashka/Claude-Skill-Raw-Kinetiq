#!/usr/bin/env bash
# Self-check before rendering: renders frames across the song in check mode, measures where
# every piece of text and every image lands, and writes video/check/report.md plus
# issues.png and overview.png to look at.
# Usage: bash check.sh <project dir> [per-second=4] [from-s] [to-s]
set -euo pipefail
SKILL="$(cd "$(dirname "$0")/.." && pwd)"
PROJ="$1"; shift
VENV="${RAW_KINETIQ_VENV:-$HOME/.raw-kinetiq/venv}"
if [ -x "$VENV/Scripts/python.exe" ]; then PY="$VENV/Scripts/python.exe"; else PY="$VENV/bin/python"; fi
(cd "$PROJ/video" && node check.mjs "$@")
"$PY" "$SKILL/scripts/check.py" "$PROJ"
