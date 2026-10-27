---
name: raw-kinetiq
description: RAW KINETIQ. Turns a song file into a finished kinetic-typography lyric video (MP4) where every word hits on time - lyrics timed with Whisper plus a Demucs vocal stem, visuals synced to the beat and 808s, rendered with Remotion. Use this whenever the user wants a lyric video, kinetic lyrics, a "music video" or visualizer for their own song, animated lyrics for YouTube, or a vertical TikTok/Reels/Shorts lyric clip, even when they say it casually ("make a vid for my track", "do the kinetic thing for this song", "raw kinetiq this"). Works from just an audio file; lyrics can be pasted, read from the file's tags (Suno embeds them) or transcribed. Not for AI-generated footage music videos unless they want lyrics on top.
---

# RAW KINETIQ

Song in, MP4 out. The pipeline is already built; your job is to run it, review the timing
like an editor would, and fix what the machines got wrong. The finished video should feel
like every word lands exactly when it is sung, and the visuals breathe with the track's energy.

Paths below: `SKILL` = this skill's folder (`${CLAUDE_SKILL_DIR}`), `PY` = the Python that
`setup_env.sh` prints (`~/.raw-kinetiq/venv/Scripts/python.exe` on Windows,
`~/.raw-kinetiq/venv/bin/python` elsewhere). Use the Bash tool for the `.sh` scripts (Git Bash
on Windows).

## 0. What you need from the user

Only the song is required. Get the song (and lyrics, if they have them), then ask the look
questions **once, up front, in a single AskUserQuestion call** so the user can pick and walk
away while the analysis runs. Skip any question their message already answered. If they said
"just do it", or they're away, use the defaults and say which you used.

| Question (header) | Options | Default |
|---|---|---|
| Format | 16:9 (1920x1080) (Recommended) / Vertical 9:16 for TikTok, Reels, Shorts (1080x1920) / Square (1080x1080) | 16:9 |
| Look | Auto from the genre (Recommended) / then the 3 themes that fit the genre best (table below). "Other" lets them name any theme or colours | auto |
| Overlays (multiSelect) | Artist name (top left) / Section names (bottom left) / Timer + progress bar / BPM + beat counter. Say in the question that picking none gives a clean music video | none |
| End card | Title + artist at the end (Recommended) / No end card | yes |

The answers map onto `new_project.sh` flags: `--size`, `--theme`, `--overlays artist,section,timer,bpm`
(only the picked ones), `--no-endcard`. Always 60 fps unless they ask otherwise.

Other inputs, which need no question:

| Input | Default |
|---|---|
| Lyrics | pasted > file tags (Suno writes them) > transcript you clean up |
| Title / artist | file tags; if the tag title is junk (e.g. `[Rec] Oct 24 ...`) use the file name |
| Background | `auto`: the scene changes with the song (below). `calm` and `classic` on request |

Themes (in `template/src/themes.ts`, colours overridable per project):

| theme | suits |
|---|---|
| `phonk` | phonk, trap, drill, dark hip-hop: black, blood red, tape grit |
| `neon` | synthwave, EDM, house: purple night, magenta + cyan |
| `toxic` | rage, hyperpop, punk, metal: acid green on black |
| `gold` | luxury rap, boom bap, soul: warm black and gold |
| `ice` | R&B, ambient, sad/dreamy, lo-fi: cold blue, softer, mixed case |
| `paper` | pop, indie, acoustic: light background, ink and red |

## 1. Set up (once per machine, instant after that)

```bash
bash SKILL/scripts/setup_env.sh
```

Creates the shared Python env (faster-whisper, Demucs, librosa; CPU builds) and prints its
Python path. Needs Python 3.10+, Node 18+ and ffmpeg (with ffprobe) on PATH; if one is missing,
tell the user what to install rather than installing system software yourself. The first run
downloads a few GB (CPU torch now, the Whisper and Demucs models on first use).

## 2. Analyse the song (cached, run in the background)

Project folder: `<song's folder>/<song name> lyric video/` unless the user says otherwise.
If the user pasted lyrics, save them first as `<project>/work/lyrics.txt`, keeping `[Section]` tags.

```bash
PY SKILL/scripts/prepare.py "<song>" "<project>/work"
```

About 8-10 minutes on CPU for a 3-minute song (Demucs, then Whisper large-v3 twice). Every step
caches its output, so a rerun only does what's missing. Never delete those outputs to "start
clean"; to redo one step, delete just that file. It prints:
- duration, BPM, bar length (`240 / BPM`), energy per second (drops are jumps in it),
- **vocals present** ranges (gaps = instrumental),
- both Whisper transcripts (full mix, and the isolated vocal stem).

Then set up the video project (it reuses an existing one):

```bash
bash SKILL/scripts/new_project.sh "<song>" "<project>" --theme phonk --size 1920x1080 --fps 60 [--overlays artist,timer] [--no-endcard]
```

For a project made with an older version of this skill, add `--update`: it swaps in the
current template code and keeps the song's data.

## 3. Lyrics: make them match what is actually sung

Read `work/lyrics.txt` next to the transcripts. AI-generated songs (Suno especially) often
drop lines, repeat a chant more times than written, swap two lines, or skip the written intro.
The video must follow the audio, so edit `lyrics.txt` to match what's sung: reorder, delete or
add lines. Tell the user what you changed.

Format: `[Section name]` headers (Intro, Verse, Pre-Chorus, Chorus, Hook, Bridge, Build, Drop,
Break, Instrumental, Outro, and so on; `| notes` after the name are ignored), one sung line per
line. Bracketed production notes like `[First 8 bars: ...]` are skipped. An instrumental section
can be a header with no lines.

With no lyrics at all, `lyrics.draft.txt` holds the transcript. Clean it into `lyrics.txt`: fix
obvious mishearings, split it into sung lines, and add section headers where the energy and
vocals show them.

## 4. Build the timeline, then review it like an editor

```bash
PY SKILL/scripts/build_timeline.py "<project>/work" "<project>/video" --title "Title" --artist "Artist"
```

The first run proposes `work/sections.json` and prints every section and line with times.
Lines marked `CHECK` were mostly not heard by Whisper, so their times are guesses. That is
normal for chopped vocal chants, ad-libs and heavily processed hooks.

Line styles are picked automatically:
- a word repeated as a whole line with hyphens or 4+ times (`Cut-cut-cut-cut`) becomes **chant**: each chop is a giant word sliced in half.
- the song's hook word repeated across several lines (`Deeper, deeper`) becomes **tunnel**: you fall into the word.
- other short repeats (`Yeah, yeah`, `Go, go, go`) become **shout**: one word at a time, centre screen.
- chorus and drop lines become **drop**, verse lines **verse**. Both are shown as bursts of at
  most 3 words on one line (`"chunk"` in config.json): a burst slams in on its first word, its
  words light up as they're sung, and once it's sung it gets sliced in half just before the
  next burst lands. Breaks prefer commas and
  pauses and never leave a burst ending on "the"/"a"/"to". Verse bursts jump between spots on
  the frame; drop bursts are centred, huge and pump on the beat.
- outro lines become **outro**: letters drift apart and blur.

The background follows the sections too (`template/src/backgrounds.tsx`). Each section kind has
its own scene, built from audio-reactive layers: colour clouds, dust, warp streaks, spectrum bars,
a synthwave grid, kick shockwaves, glitch bands, the square tunnel and the hook-word marquee.
A repeated kind (verse 2, the final drop) gets the next variant, and scenes crossfade at section
changes. Keep scenes sparse (one main idea plus at most one quiet layer): users found stacked
effects and a big spectrum visualiser distracting, because the words are the show. So getting the section kinds right also gets the visuals right.

Review checklist. The skill earns its keep here:
1. **Sections vs vocals present and energy.** Every lyric section should sit inside a vocals
   range, and breaks in the vocal gaps. Drops and choruses usually start where the energy per
   second jumps. Sections tend to begin on bar lines, so starts should be multiples of the bar
   length apart. Fix `start`/`end` in `sections.json`.
2. **Every `CHECK` line.** Find where it is really sung: the vocal onsets (`work/vocal_onsets.json`)
   and the vocal-stem transcript are the evidence. Pin it with `"lines": {"<idx>": [from, to]}`
   on its section (line index within that section). Chant/shout/tunnel lines inside a window
   snap to the vocal onsets in it.
   When neither transcript hears a passage (chopped intros, risers), re-run Whisper on just that
   stretch with `initial_prompt` set to the expected words: it often recovers lines and their
   order. Be careful: on near-instrumental audio it can simply echo the prompt back, so
   believe it only when the times line up with vocal onsets or the stem's loudness. If the
   user says what they hear ("deeper, then cut a couple of times"), their ears win. Pin exact
   hit times with `"at": {"<idx>": [t1, t2, ...]}`; a chant/shout/tunnel line gets one hit per time.
3. **Chants.** Add the line index to the section's `"all"` list to get one hit per chop actually
   sung, instead of the number written in the lyrics.
4. **Wrong style?** Set `"modes": {"<idx>": "verse|drop|chant|tunnel|shout|outro"}`, or
   top-level `"tunnel"`/`"chant"` word lists.
5. **Long instrumentals** get the scrolling hook-word marquee. `"bars": 16` adds a bar counter (shown only with the section overlay on),
   `"fast": true` runs it at full speed, and `"flashAt": [secs]` adds a flash where the beat
   switches up. Every drop/chorus start flashes automatically.
6. **Times jumping backwards** or one word stretched over a gap: a stray Whisper match. Pin the line.

Rerun `build_timeline.py` after each edit; it keeps your `sections.json`
(`--reset-sections` starts the proposal over).

## 5. Look before rendering

```bash
cd "<project>/video" && node stills.mjs 0.5 15.2 42.6 ...
```

Pick moments that matter: one per section, a few mid-line, a line change, each chant and tunnel,
each break, the drop hits, one frame per background scene, and the end card. Tile them and look at the sheet:

```bash
cd stills && ls t*.png | sed "s/.*/file '&'/" > c.txt && ffmpeg -v error -y -f concat -safe 0 -i c.txt -vf "scale=640:-1,tile=3x3" -fps_mode passthrough sheet%d.png
```

Look for text running off the frame, two lines fighting for the same spot, long empty stretches
while someone is singing, and wrong words. Fix the source, then look again.

## 6. Render (background) and check the file

```bash
bash SKILL/scripts/render.sh "<project>" "<project>/<Title> - Lyric Video.mp4"
```

Roughly 3.5x real time at 1080p60 (a 3-minute song takes about 10 minutes). Chrome draws on
the GPU (`--gl=angle`); most of the time is spent capturing frames, so the GPU only helps a
little. When it finishes, check the ffprobe line (size, fps, audio present) and pull 3-4 frames
from the MP4 itself with ffmpeg to confirm it isn't black or broken.

Tell the user: where the file is, the theme you picked, every place the video follows the
audio rather than the lyric sheet, and how to tweak it (next section).

## Tweaking after the fact

- **Theme or colours:** `video/src/data/config.json` takes `"theme"`, and `"colors": {"accent": "#..."}` overrides on top of it. Re-render; no re-analysis needed.
- **Overlays, end card, background, burst size:** `"overlays": {"artist", "section", "timer", "bpm"}` (true/false each), `"endCard"`, `"background": "auto" | "calm" | "classic"`, `"chunk": 3` in the same file.
- **Scenes:** the per-section scene table is `AUTO` in `video/src/backgrounds.tsx`.
- **Format:** rerun `new_project.sh` with a new `--size` and re-render. The layout scales to any aspect ratio.
- **Timing:** edit `sections.json` or `lyrics.txt`, rerun `build_timeline.py`, then render.
- **Scrub it live:** `cd video && npx remotion studio src/index.ts` opens a preview with a timeline.
- **New visual styles** go in `video/src/lyrics.tsx` for that song, or in `SKILL/template/src/` to make them permanent.

## Notes

- Whisper and Demucs run on the CPU so the skill works on any machine (CTranslate2, which
  faster-whisper uses, has no AMD GPU support on Windows). The env is separate on purpose:
  never swap torch builds in the user's other Python environments to get GPU speed.
- faster-whisper's own decoder breaks on some PyAV versions, so `prepare.py` decodes audio
  with librosa and passes an array. Keep it that way.
- Flashes are accent-tinted and capped, never a full-white strobe at beat rate (photosensitivity).
