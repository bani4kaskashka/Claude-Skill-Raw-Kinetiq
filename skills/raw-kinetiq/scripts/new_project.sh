#!/usr/bin/env bash
# Scaffold the Remotion project for one song.
# Usage: bash new_project.sh <song file> <project dir> [options]
#   --theme phonk            colour/type theme (phonk neon toxic gold ice paper)
#   --size 1920x1080         frame size (1080x1920 for vertical)
#   --fps 60
#   --overlays a,b,...       corner readouts to show: artist section timer bpm (or "all"); default none
#   --no-endcard             skip the title + artist card at the end
#   --background auto        auto (scenes follow the song), calm, classic (square tunnel)
#   --chunk 3                most words on screen at once in verse/drop lines
#   --update                 refresh an existing project's code from the template (keeps src/data)
# Creates <project dir>/video (template + config + audio) and installs node packages.
# Safe to rerun: keeps an existing video/ and only rewrites config.json and the audio.
set -euo pipefail
SKILL="$(cd "$(dirname "$0")/.." && pwd)"
SONG="$1"; PROJ="$2"; shift 2
THEME=phonk; SIZE=1920x1080; FPS=60; OVERLAYS=""; ENDCARD=true; BG=auto; CHUNK=3; UPDATE=0
while [ $# -gt 0 ]; do
  case "$1" in
    --theme) THEME="$2"; shift 2 ;;
    --size) SIZE="$2"; shift 2 ;;
    --fps) FPS="$2"; shift 2 ;;
    --overlays) OVERLAYS="$2"; shift 2 ;;
    --no-endcard) ENDCARD=false; shift ;;
    --background) BG="$2"; shift 2 ;;
    --chunk) CHUNK="$2"; shift 2 ;;
    --update) UPDATE=1; shift ;;
    *) echo "unknown option $1" >&2; exit 1 ;;
  esac
done
W="${SIZE%x*}"; H="${SIZE#*x}"
EXT="${SONG##*.}"
V="$PROJ/video"

[ "$OVERLAYS" = "all" ] && OVERLAYS="artist,section,timer,bpm"
on() { case ",$OVERLAYS," in *",$1,"*) echo true ;; *) echo false ;; esac; }

mkdir -p "$V"
if [ ! -f "$V/package.json" ]; then
  cp -r "$SKILL/template/." "$V/"
elif [ "$UPDATE" = 1 ]; then
  # replace the code, keep the song's data, renders and stills
  OLD_PKG="$(cat "$V/package.json")"
  find "$V/src" -maxdepth 1 -type f -delete
  cp "$SKILL/template/src/"*.ts* "$V/src/"
  cp "$SKILL/template/stills.mjs" "$SKILL/template/tsconfig.json" "$SKILL/template/package.json" "$V/"
  [ "$OLD_PKG" = "$(cat "$V/package.json")" ] || rm -f "$V/node_modules/.package-lock.json"
  echo "updated code from the template"
fi
mkdir -p "$V/public" "$V/src/data" "$V/out"
cp "$SONG" "$V/public/song.$EXT"
cat > "$V/src/data/config.json" <<EOF
{
  "width": $W,
  "height": $H,
  "fps": $FPS,
  "audio": "song.$EXT",
  "theme": "$THEME",
  "background": "$BG",
  "chunk": $CHUNK,
  "endCard": $ENDCARD,
  "overlays": { "artist": $(on artist), "section": $(on section), "timer": $(on timer), "bpm": $(on bpm) }
}
EOF
# placeholders so the project compiles before build_timeline.py runs
[ -f "$V/src/data/timeline.json" ] || echo '{"duration":1,"title":"","artist":"","bpm":120,"hooks":[],"sections":[{"name":"","kind":"verse","start":0,"end":1}],"lines":[],"kicks":[],"beats":[],"downbeats":[],"flashes":[]}' > "$V/src/data/timeline.json"
[ -f "$V/src/data/energy.json" ] || echo '{"sub":[],"rms":[],"high":[],"spec":[]}' > "$V/src/data/energy.json"

if [ ! -d "$V/node_modules/remotion" ] || [ ! -d "$V/node_modules/@remotion/renderer" ] || [ ! -f "$V/node_modules/.package-lock.json" ]; then
  (cd "$V" && npm install --no-fund --no-audit --loglevel=error)
fi
echo "project ready: $V  (theme $THEME, ${W}x${H} @ ${FPS} fps, background $BG, overlays: ${OVERLAYS:-none}, end card $ENDCARD)"
