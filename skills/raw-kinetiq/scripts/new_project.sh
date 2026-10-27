#!/usr/bin/env bash
# Scaffold the Remotion project for one song.
# Usage: bash new_project.sh <song file> <project dir> [options]
#   --theme phonk            starting palette + font (phonk neon toxic gold ice paper); colours and
#                            fonts can be anything afterwards ("colors", "fonts" in config.json)
#   --size 1920x1080         frame size (1080x1920 for vertical)
#   --fps 60
#   --overlays a,b,...       corner readouts to show: artist section timer bpm (or "all"); default none
#   --no-endcard             skip the title + artist card at the end
#   --motion pulse           a starting recipe (aggressive bounce pulse smooth story anthem, see
#                            template/src/motion.ts); design the real mix in config.json afterwards
#   --background auto        auto (scenes from the motion), calm, classic (square tunnel)
#   --update                 refresh an existing project's code from the template (keeps src/data,
#                            src/custom and public/)
# Creates <project dir>/video (template + config + audio), installs node packages, fetches fonts.
# Safe to rerun: an existing config.json keeps everything you designed; only the options you
# pass on this run (and the frame size, fps and audio) are written into it.
set -euo pipefail
SKILL="$(cd "$(dirname "$0")/.." && pwd)"
SONG="$1"; PROJ="$2"; shift 2
THEME=""; SIZE=""; FPS=""; OVERLAYS="-"; ENDCARD=""; BG=""; MOTION=""; UPDATE=0
while [ $# -gt 0 ]; do
  case "$1" in
    --theme) THEME="$2"; shift 2 ;;
    --size) SIZE="$2"; shift 2 ;;
    --fps) FPS="$2"; shift 2 ;;
    --overlays) OVERLAYS="$2"; shift 2 ;;
    --no-endcard) ENDCARD=false; shift ;;
    --background) BG="$2"; shift 2 ;;
    --motion) MOTION="$2"; shift 2 ;;
    --update) UPDATE=1; shift ;;
    *) echo "unknown option $1" >&2; exit 1 ;;
  esac
done
EXT="${SONG##*.}"
V="$PROJ/video"

[ "$OVERLAYS" = "all" ] && OVERLAYS="artist,section,timer,bpm"

mkdir -p "$V"
if [ ! -f "$V/package.json" ]; then
  cp -r "$SKILL/template/." "$V/"
elif [ "$UPDATE" = 1 ]; then
  # replace the code, keep the song's data, its own pieces, assets, renders and stills
  OLD_PKG="$(cat "$V/package.json")"
  find "$V/src" -maxdepth 1 -type f -delete
  cp "$SKILL/template/src/"*.ts* "$SKILL/template/src/"*.json "$V/src/"
  [ -d "$V/src/custom" ] || cp -r "$SKILL/template/src/custom" "$V/src/"
  cp "$SKILL/template/"*.mjs "$SKILL/template/tsconfig.json" "$SKILL/template/package.json" "$V/"
  [ "$OLD_PKG" = "$(cat "$V/package.json")" ] || rm -f "$V/node_modules/.package-lock.json"
  echo "updated code from the template"
fi
mkdir -p "$V/public/assets" "$V/public/fonts" "$V/src/data" "$V/out"
cp "$SONG" "$V/public/song.$EXT"

# write the options given on this run into config.json, keeping everything else
ARGS_JSON="$(node -e '
const [size, fps, ext, theme, bg, motion, endcard, overlays] = process.argv.slice(1);
const o = { audio: `song.${ext}` };
if (size) { const [w, h] = size.split("x").map(Number); o.width = w; o.height = h; }
if (fps) o.fps = Number(fps);
if (theme) o.theme = theme;
if (bg) o.background = bg;
if (motion) o.motion = motion;
if (endcard) o.endCard = endcard === "true";
if (overlays !== "-") { const on = (k) => `,${overlays},`.includes(`,${k},`); o.overlays = { artist: on("artist"), section: on("section"), timer: on("timer"), bpm: on("bpm") }; }
console.log(JSON.stringify(o));
' "$SIZE" "$FPS" "$EXT" "$THEME" "$BG" "$MOTION" "$ENDCARD" "$OVERLAYS")"
node -e '
const fs = require("fs");
const p = process.argv[1];
const defaults = { width: 1920, height: 1080, fps: 60, theme: "phonk", background: "auto", motion: "pulse", endCard: true,
  overlays: { artist: false, section: false, timer: false, bpm: false } };
const old = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : defaults;
fs.writeFileSync(p, JSON.stringify({ ...defaults, ...old, ...JSON.parse(process.argv[2]) }, null, 2) + "\n");
' "$V/src/data/config.json" "$ARGS_JSON"

# placeholders so the project compiles before build_timeline.py runs
[ -f "$V/src/data/timeline.json" ] || echo '{"duration":1,"title":"","artist":"","bpm":120,"hooks":[],"sections":[{"name":"","kind":"verse","start":0,"end":1}],"lines":[],"kicks":[],"beats":[],"downbeats":[],"flashes":[]}' > "$V/src/data/timeline.json"
[ -f "$V/src/data/energy.json" ] || echo '{"sub":[],"rms":[],"high":[],"spec":[]}' > "$V/src/data/energy.json"
[ -f "$V/src/data/fonts.json" ] || echo '{}' > "$V/src/data/fonts.json"

if [ ! -d "$V/node_modules/remotion" ] || [ ! -d "$V/node_modules/@remotion/renderer" ] || [ ! -f "$V/node_modules/.package-lock.json" ]; then
  (cd "$V" && npm install --no-fund --no-audit --loglevel=error)
fi
(cd "$V" && node prep.mjs)
node -e '
const c = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
console.log(`project ready: ${process.argv[2]}  (${c.width}x${c.height} @ ${c.fps} fps, theme ${c.theme}, motion ${typeof c.motion === "string" ? c.motion : "custom"})`);
' "$V/src/data/config.json" "$V"
