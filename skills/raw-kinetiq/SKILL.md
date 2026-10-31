---
name: raw-kinetiq
description: RAW KINETIQ. Turns a song file into a finished kinetic-typography lyric video (MP4) where every word hits on time and the whole look (colours, fonts, motion, backgrounds) is designed from what that song is about and how it feels - lyrics timed with Whisper plus a Demucs vocal stem, visuals synced to the beat, the user's own images and cutouts placed in it, a self-check before rendering, rendered with Remotion. Use this whenever the user wants a lyric video, kinetic lyrics, a "music video" or visualizer for their own song, animated lyrics for YouTube, or a vertical TikTok/Reels/Shorts lyric clip, even when they say it casually ("make a vid for my track", "do the kinetic thing for this song", "raw kinetiq this"). Works from just an audio file; lyrics can be pasted, read from the file's tags (Suno embeds them) or transcribed. Not for AI-generated footage music videos unless they want lyrics on top.
---

# RAW KINETIQ

Song in, MP4 out. The pipeline is already built; your job is to run it, review the timing
like an editor would, and fix what the machines got wrong. The finished video should feel
like every word lands exactly when it is sung, and the visuals breathe with the track's energy.

**The video is designed around the song, never the song squeezed into a house style.** What
the song is about, how it feels, its genre and tempo decide everything: the colours, the fonts,
how many words are on screen, how they arrive and leave, where they sit, how hard the camera
hits, what lives in the background, and where the user's own images go. There are no presets
to pick from, only a toolkit to mix ([references/toolkit.md](references/toolkit.md)), and when
the song has an image the toolkit doesn't, you build it for that song. Two songs should never
come out looking alike, and a video should look like nobody else's on YouTube. Be creative,
take risks, then check your work (step 5) so the risks land.

**Things happen in it because of what the words say.** A video where only the background and
the type change is a slideshow. When a line holds something, a hand holds it; when it names a
mouth, a mouth opens and the camera goes in; when it says "I know every exit", exit signs race
past. These moments are drawn by you in code (SVG shapes, animated in Remotion; never an image
generator), timed to their words (step 4b).

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
| Feel | Designed from the song (Recommended) / then 2-3 concrete directions drawn from this song's own images, each in plain words (for a song about a fever: "Words trembling in heat haze, sweat-yellow on black"). "Other" lets them describe the vibe in their own words | designed from the song |
| Overlays (multiSelect) | Artist name (top left) / Section names (bottom left) / Timer + progress bar / BPM + beat counter. Say in the question that picking none gives a clean music video | none |
| Assets | "Do you have images you'd like in the video (cover art, photos, a logo, a picture of you)?" No, design it from the song (Recommended) / Yes, I'll send them here / Yes, they're in a folder | no |

The answers map onto `new_project.sh` flags: `--size` and `--overlays artist,section,timer,bpm`
(only the picked ones). Always 60 fps unless they ask otherwise. The feel is
yours to design in step 2b, steered by their answer.

**If they have assets,** reply right away: "Send them over (or tell me the folder), and a word on
what each one is or where you'd like it, if you have a preference." Descriptions are optional:
open every image with the Read tool and see for yourself what it is. Bring them in during
step 2c.

Other inputs, which need no question:

| Input | Default |
|---|---|
| Lyrics | pasted > file tags (Suno writes them) > transcript you clean up |
| Title / artist | file tags; if the tag title is junk (e.g. `[Rec] Oct 24 ...`) use the file name |
| Background | `auto`: scenes follow the sections and your design |
| End card | title + artist over the last seconds; `--no-endcard` when they don't want it |

## 1. Set up (once per machine, instant after that)

```bash
bash SKILL/scripts/setup_env.sh
```

Creates the shared Python env (faster-whisper, Demucs, librosa, Pillow; CPU builds) and prints its
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

## 2b. Design this song's video

**Start from the song, not from the toolkit.** Don't open the toolkit yet: a menu of ready-made
moves pulls every song toward the same handful of looks. First work out what this song is, and
write it down in `<project>/work/design.md`:

1. **The song in a few lines:** the story, who is speaking and to whom, the place, the time of
   day, the objects and images the lyrics keep returning to, and how it feels (tense, tender,
   numb, defiant, playful, paranoid). Feeling picks the motion more than genre does.
2. **The world it lives in.** Read the vocabulary, not just the story: lyric words cluster into
   a world, and that cluster says where the song lives, often more than the title's everyday
   meaning does. A song full of "verdict", "testify", "sentence" lives in a courtroom; "anchor",
   "drift", "harbour" at sea; "balance", "owe", "interest" in money. Then list every meaning of
   the title and of the hook, including slang and what the words mean in games, films, sports and
   subcultures ("ghost" is a spirit, someone who vanishes on you, and a gamer's term), and pick
   the meaning the vocabulary backs up, or fuse two. Write the candidates and why you picked one.
3. **The central image,** from that world and the lyrics' own words, never from the genre. A song
   about being watched: windows lighting up one by one. A song about running out of time: a fuse
   burning down the frame.
4. **Signature moves: what the words themselves do, in this song's terms.** Two or three, each
   in one sentence: how a word arrives, how it leaves, what the hook does. They come from the
   central image: in a song about a fever, words arrive trembling in heat haze and cool to still;
   in a song about unsent letters, words are written in ink that bleeds, then the page folds them
   away. **The test:** if the same move would fit a random other song, it isn't a signature yet.
   Make it big enough to notice: after one chorus a viewer should be able to describe what the
   words did. A hairline glint or a light blur for a fraction of a second reads as nothing; let
   the move take space and time at the peaks, and keep it quieter in the verses.
   You will write these as effects for this song (`video/src/custom`, toolkit "The song's own pieces").
5. **The shot list:** every section with its scene, camera, lyric layout, palette and which move
   it uses. The central image evolves through it like a short film (below), and each section is
   framed differently: a new tint or a few more lights on the same view is not a new shot.
6. **What you are not doing:** name the obvious moves for this genre and mood that you are
   avoiding, so you don't drift back into them.
7. **The drawing style** the moments will share (step 4b), from the song's world: neon line
   art, flat cut paper, ink and wash, blueprint lines, bold silhouettes, comic panels, woodcut.
   One style for the whole song, so the moments look like one film.

The facts to read for it: the BPM (note half-time feels: a 140 BPM trap beat often feels like
70), vocal density (words per second in `whisper_full.json`: fast rap needs short bursts; slow,
sustained singing can hold phrases) and energy per second (where it jumps, the video changes:
a chorus that moves differently from the verse, a bridge that breaks the pattern, a final
chorus bigger than the first).

Now read [references/toolkit.md](references/toolkit.md) and build the design:
- **Moments** are drawn after the timeline exists (step 4b), but plan them now: the storyboard
  shapes the shot list, and a section built around a moment can stay simple behind it.
- **The song's own pieces first.** Write the signature moves as `effects`, the central image
  as `layers` (and a line style as `modes` when a moment needs one) in
  `video/src/custom/index.tsx`. Use the signature move where the song peaks (at least the
  choruses), and keep it at the centre of the video, not as a one-off.
- **The toolkit is the supporting cast.** Its built-in enters, exits, line styles and layers
  carry the in-between lines and fill out a scene. Many were made for earlier songs (the
  slams, slashes, cuts and glitches for a phonk track, chants sliced in half, the tunnel), and
  reaching for them by default is exactly what makes two videos look alike. Use a built-in
  only when it honestly fits this song's image, and write why in `design.md`.
- **Palette:** colours from the song's world or the user's images, with per-section shifts.
  Write all of them; don't start from a theme.
- **Type:** any Google Font for `display` and a contrasting `alt`, chosen for this song's voice.
- **Camera, energy and react:** a move per section, how hard the camera hits, and whether the
  visuals pulse with the beat or with the voice.
- **Assets:** where each of the user's images goes and how the text makes room for it (2c).

**A video is a sequence of shots, never one picture with words on it.** One central idea is
right, one unchanging frame is not. Plan the song like a short film, section by section: what
the viewer sees in the intro, how the first verse frames it, what opens up in the chorus, what
breaks in the bridge, how it resolves. The central image should evolve: change the scale, the
angle or camera move, the time of day, the palette, what is in the frame. A custom layer gets
the section and its progress, so it can show different things in different sections. Every
chorus must look clearly different from its verse, and the last chorus bigger than the first.
If two neighbouring sections share scene, camera, layout and palette, change one.

**Change the framing, not just the colours.** When one custom layer carries the song, give it
real shots: a different camera position (from above, from inside, at ground level, close on one
detail), a different scale, a different subject in the frame. Re-tinting the same view, or
adding lights to it, still reads as one shot, and the check flags a framing that fills too much
of the song (`one-shot`).

**Place the words with the image.** Where the lyrics sit is part of the design: on the surface
the scene shows, in the window, beside the subject, moving to a new spot with each burst when
the music moves. A whole section of bursts in exactly the same spot is a subtitle. An effect's
`burst` hook can move a burst anywhere (its `transform`).

**Slow is not static.** A soft, slow or whispered song moves slowly but never stops: the camera
drifts or pushes, the light swells with the voice (`"react": "voice"`, the default for soft
songs), scenes change at every section. Keep the feeling (tender stays tender) and still make
each section a new picture. Give slow lyrics room to be big: fewer words at a time, set large,
placed with intent, not a small subtitle on the same line all song.

Be bold: borrow across genres (a soul song with brutalist type, a drill track in a serif) and
take risks; the self-check (step 5) catches what doesn't land. It also flags a video with no
`design.md` (`no-design`), choruses that only use built-in moves (`no-signature`), built-ins
borrowed from earlier songs (`borrowed`), and a background made only of built-in layers
(`stock-world`).

Tell the user the design in two or three plain sentences ("a song about being watched, so the
words sit in front of a building at night whose windows light up one by one; each word switches
on like a window as it is sung, and the chorus dims the street to one lit room").

Then set up the video project (it reuses an existing one):

```bash
bash SKILL/scripts/new_project.sh "<song>" "<project>" --size 1920x1080 --fps 60 [--overlays artist,timer] [--no-endcard]
```

and write the design into `video/src/data/config.json` (colours, fonts, motion, scenes,
assets). Rerunning `new_project.sh` keeps everything you put there. For a project made with an
older version of this skill, add `--update`: it swaps in the current template code and keeps
the song's data, its custom pieces and its assets.

## 2c. The user's images

```bash
PY SKILL/scripts/assets.py "<project>" <image files or folder> [--cutout name1,name2 [--person]]
```

Copies them into the project (upright, sensible size), prints each one's shape, brightness and
main colours, and writes `video/public/assets/sheet.png`. Look at the sheet. Cut out the subjects
that should stand in the frame without their background (`--cutout`; add `--person` when it is
a person, or the model may keep only a hand or a face). Check every cutout on the sheet; if the
edges are wrong, try the other model, or use the image as a backdrop or poster instead.

Use what the user said about each image; when they said nothing, decide from what you see.
Place them where the song needs them (toolkit, "Assets"): a portrait cutout beside the verses,
the cover art as a backdrop for the bridge, a photo flashing in on the chorus downbeats. Use
their main colours for the palette when it fits. Never put words over a face.

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

Line styles are picked automatically from the lyrics:
- a word repeated as a whole line with hyphens or 4+ times (`Cut-cut-cut-cut`) becomes **chant**:
  each chop is a giant word in a new spot (sliced in half when the song's motion uses `slash`).
- the song's hook word repeated across several lines (`Deeper, deeper`) becomes **tunnel**: you fall into the word.
- other short repeats (`Yeah, yeah`, `Go, go, go`) become **shout**: one word at a time, centre screen.
- chorus and drop lines become **drop**, verse lines **verse**, and both move the way the song's
  motion says. Bursts break at commas and pauses and never end on "the"/"a"/"to".
- outro lines become **outro**: letters drift apart and blur.

These styles only decide the rhythm (one hit per chop, on the vocal onsets). Their built-in
looks were made for earlier songs, so give them this song's look: write a mode with the same
name (`chant`, `shout`, `tunnel` or `outro`) in `video/src/custom`, which replaces the built-in
look for this song and keeps the timing, or turn the line into `verse`/`drop` with `"modes"`
(below).

The background, the palette shifts and the motion all follow the sections, so getting the
section kinds right also gets the visuals right.

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
4. **Wrong style?** Set `"modes": {"<idx>": "verse|drop|chant|tunnel|shout|outro"}` (or a line
   style you wrote in `video/src/custom`), or top-level `"tunnel"`/`"chant"` word lists.
5. **Long instrumentals** get the scrolling hook-word marquee. `"bars": 16` adds a bar counter (shown only with the section overlay on),
   `"fast": true` runs it at full speed, and `"flashAt": [secs]` adds a flash where the beat
   switches up. Every drop/chorus start flashes automatically.
6. **Times jumping backwards** or one word stretched over a gap: a stray Whisper match. Pin the line.

Rerun `build_timeline.py` after each edit; it keeps your `sections.json`
(`--reset-sections` starts the proposal over).

## 4b. Moments: draw what the lines say

**Storyboard first.** Write `<project>/work/storyboard.md`: go through the lyrics line by line
and write down what each one shows, literally:
- objects (a key, a phone, a jacket on a chair, a receipt),
- body parts and gestures (a mouth, hands holding something, eyes, a handshake, feet),
- places and things in them (a door, exits, a corridor, a window, a street),
- actions (holding, leaving, counting, memorising, breaking, locking),
- figures of speech you can make literal ("keep my name out of your mouth": a mouth closing on
  the name; "I'm on thin ice": cracks spreading under the words).

Then pick the moments and give each one a few lines: the lyric, what we see, the action and the
word it lands on, the camera (where it looks, how it moves, how it leaves: a dive into the
subject, a cut on the beat, a whip into the next shot), where the lyrics go, how long. For
example, for "Still got your name in my phone": a hand holds a phone, the thumb flicking the
contacts; the list slows and stops on one name as "name" is sung; the camera pushes into the
screen with the line written above the list; on "phone" it dives through the glass into the
chorus.

How many: one every 10-20 seconds of singing, every chorus with its own. A repeated chorus
doesn't replay its moment, it moves it on (the first time the door is shut, the second it is
locked, the last it stands open). The hook's image gets the biggest one. Prefer lines with a
concrete noun or gesture; abstract lines can carry the central image instead.

**Then draw them** in `video/src/custom/index.tsx` (`moments`, toolkit "Moments"). Each is a
React component drawing SVG in the song's drawing style, timed with `lineAt`/`wordIn` so it
follows the lyrics, with its own camera and lyric placement. Draw like an illustrator, not a
diagram: build each subject from its defining parts (lips with their own curves, teeth, the dark
inside; a palm, bending fingers, a thumb), big and simple enough to read in a second, always a
little alive, with the main action on the word.

**A moment is a close-up, not an icon.** The subject fills a third of the frame or more; a small
padlock in the middle of a dark frame reads as clip art. Hands get real fingers (separate
tapered shapes that bend at two joints, a thumb that opposes them, knuckle lines); a rectangle
with lines on it, or a mitten, is not a hand.

**Move the camera like it means it.** A 1.1x push over three seconds looks like a still. Every
moment gets one real camera move, chosen from what the line says:
- **go inside** what the line names as an opening or a body part: into the mouth on "out of your
  mouth", through the door, into the screen, into an eye; zoom to 8-12 and come out in the next
  shot,
- **push hard** onto the detail the word lands on (1.5x-3x in under a second, on the word),
- **whip** across to the next thing on a hit,
- **pull back** to reveal what the subject was part of (start at 2-3x, end at 1),
- **race past**: a row of things scrolling by fast (`Strip`) while the camera holds or tilts.
Save the biggest moves for the choruses. The check flags moments whose camera barely moves
(`timid-camera`, must-fix when more than half of them do).

**Look at every one.** Render stills across each moment (`node stills.mjs` in `video/`, or the
check's `moments.png`, step 5) and open them. Ask: would someone who hasn't heard the song say
what this is and what it is doing? If not, redraw it and look again; a moment that doesn't read
is worse than none.

## 5. Self-check, then look

Before every render, run the check:

```bash
bash SKILL/scripts/check.sh "<project>"
```

It renders the whole song at 4 frames a second in check mode (about 10-30 s), measures where
every piece of text and every image really lands, and writes `video/check/report.md` plus the
sheets (`overview.png`, `issues.png`, and `moments.png`: each moment at its start, middle and
end). It flags:
- **off-frame**: text running past the edge,
- **overlap**: two settled lines on top of each other,
- **crossing**: one line animating over another (a split second is a transition; longer is a pile-up),
- **gap**: someone is singing and no lyric is on screen,
- **contrast**: text hard to read against what is behind it,
- **tiny**: text too small for a phone,
- **over-image**: text sitting on a cutout or poster,
- **same-look**: most sections look alike (must-fix), or a chorus looks just like its verse,
- **one-shot**: one framing keeps coming back across the song, only re-tinted (must-fix past half the song),
- **still**: a section where the picture barely moves.
- **no-design** / **no-signature**: no `work/design.md`, or choruses that only use built-in
  moves (both must-fix),
- **borrowed** / **stock-world**: built-in moves and line styles made for earlier songs, a
  background made only of built-in layers.
- **no-storyboard** / **no-moments**: no `work/storyboard.md`, or nothing drawn for the lyrics
  (both must-fix); **few-moments**: fewer than one per 20 s of singing; **bare**: a long
  stretch of singing with nothing drawn for it; **timid-camera**: most moments barely move the
  camera, or none dives or makes a big move (must-fix).

Fix every `FIX` line at its source (layout, size, burst, timing, colours, image placement),
and decide on each `look` line. Rerun until it is clean. `check.sh <project> 4 60 90` checks
just 60-90 s.

Then open `video/check/overview.png` (30 frames across the song) and judge it as a viewer:
- Does it look like this song: its story, its feeling, its world?
- Does each section feel different where the music changes?
- Is anything generic, cluttered or same-y? Would a viewer feel each new section arrive?
- Could it be mistaken for any other lyric video, or for another song made with this skill?
- Do the signature moves from `design.md` actually show, and read as this song's image?
- Open `moments.png`: does each drawing read as what it is, and does it do what its line says?
  Is the subject big, and does the camera go somewhere between the first and last tile?
- Is there a stretch where the words say something concrete and the picture ignores it?

Where any answer falls short, push the design further. For a closer look at moments that matter,
render stills:

```bash
cd "<project>/video" && node stills.mjs 0.5 15.2 42.6 ...
```

## 6. Render (background) and check the file

```bash
bash SKILL/scripts/render.sh "<project>" "<project>/<Title> - Lyric Video.mp4"
```

Roughly 3.5x real time at 1080p60 (a 3-minute song takes about 10 minutes). Chrome draws on
the GPU (`--gl=angle`); most of the time is spent capturing frames, so the GPU only helps a
little. When it finishes, check the ffprobe line (size, fps, audio present) and pull 3-4 frames
from the MP4 itself with ffmpeg to confirm it isn't black or broken.

Tell the user: where the file is, the design in a sentence or two, every place the video follows the
audio rather than the lyric sheet, and how to tweak it (next section).

## Tweaking after the fact

Everything below is a re-render; no re-analysis needed. Run the check again after changes.
- **Look:** `"colors"`, `"fonts"`, `"motion"`, `"assets"`, `"upper"`, `"grit"` in
  `video/src/data/config.json`; per section `"colors"`, `"motion"`, `"scene"` in `sections.json`
  (rerun `build_timeline.py`). Everything is listed in [references/toolkit.md](references/toolkit.md).
- **Overlays, end card:** `"overlays": {"artist", "section", "timer", "bpm"}`, `"endCard"`.
- **Something new for this song:** write it in `video/src/custom/index.tsx`.
- **Format:** rerun `new_project.sh` with a new `--size` and re-render. The layout scales to any aspect ratio.
- **Timing:** edit `sections.json` or `lyrics.txt`, rerun `build_timeline.py`, then render.
- **Scrub it live:** `cd video && ./node_modules/.bin/remotion studio src/index.ts` opens a preview with a timeline.
- **New tools for every song** go in `SKILL/template/src/`.

## Notes

- Whisper and Demucs run on the CPU so the skill works on any machine (CTranslate2, which
  faster-whisper uses, has no AMD GPU support on Windows). The env is separate on purpose:
  never swap torch builds in the user's other Python environments to get GPU speed.
- faster-whisper's own decoder breaks on some PyAV versions, so `prepare.py` decodes audio
  with librosa and passes an array. Keep it that way.
- Flashes are accent-tinted and capped, never a full-white strobe at beat rate (photosensitivity).
