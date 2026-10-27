#!/usr/bin/env bash
# Render the final MP4. Usage: bash render.sh <project dir> <output.mp4> [extra remotion flags]
# Chrome draws on the GPU (--gl=angle): measured ~7% faster than software drawing on a
# mid-range desktop GPU, identical pixels. Most of the time is Chrome capturing frames.
# If your GPU setup misbehaves, pass --gl=swiftshader to draw on the CPU instead.
set -euo pipefail
PROJ="$1"; OUTFILE="$2"; shift 2
case "$OUTFILE" in /*|?:*) ;; *) OUTFILE="$(pwd)/$OUTFILE" ;; esac
cd "$PROJ/video"
node prep.mjs
npx remotion render src/index.ts LyricVideo "$OUTFILE" \
  --codec=h264 --crf=18 --audio-codec=aac --audio-bitrate=320k \
  --gl=angle --concurrency=75% "$@"
ffprobe -v error -show_entries format=duration,size:stream=codec_name,width,height,r_frame_rate -of default=nw=1 "$OUTFILE"
