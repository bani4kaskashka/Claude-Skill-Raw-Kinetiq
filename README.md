# RAW KINETIQ

A Claude Code skill that turns a song into a kinetic typography lyric video. Hand Claude an
audio file, answer four quick questions, and get back an MP4 where every word hits when it's
sung, and where the whole look, from the fonts to the background, is designed for that one song.

![RAW KINETIQ demo](https://raw.githubusercontent.com/bani4kaskashka/Claude-Skill-Raw-Kinetiq/media/demo.gif)

*Above: a phonk track, so hard slams and slashes. Your song gets its own look.*

## What it does

- **Times every word.** Whisper large-v3 transcribes the song twice (the full mix and a Demucs
  vocal stem), then lines up your lyrics against it. Chopped vocal chants and ad-libs that
  Whisper can't hear get placed on vocal onsets instead.
- **Reads the song's structure.** Beat grid, kick drums, energy and a 24-band spectrum,
  so drops, builds and breaks look different from verses.
- **Designed for each song.** No templates to pick from. Claude reads what the song is about
  and how it feels, then designs its video from a toolkit: any colours, any Google Font, a
  dozen ways for words to arrive and a dozen to leave, layouts from left-aligned diary lines to
  words stacked like doors, palettes that shift between sections, camera moves, and backgrounds
  that react to the beat, or to the voice on soft songs. Every section is its own shot, so a
  slow ballad keeps moving too. When the song has an image the toolkit doesn't (a song about
  being watched gets a building whose windows light up one by one), Claude writes it for that
  song. Two songs should never come out looking alike.
- **Uses your images.** Cover art, photos, a picture of you: send them in the chat or point
  to a folder. Claude looks at each one, cuts out people and objects when that helps, picks
  colours from them, and places them where the song needs them (a backdrop for the bridge, a
  cutout beside the verses that punches on the kick, a photo flashing in on the chorus).
- **Checks its own work.** Before rendering, a self-check renders the whole song at 4 frames
  a second and measures every piece of text: running off the frame, lines piling up, gaps while
  someone is singing, text that's hard to read over an image. It also flags a video that looks
  the same from start to finish, or a section that barely moves. Claude fixes what it finds and
  reviews a contact sheet of the whole video against the song's feel before the real render.
- **Any format.** 16:9, vertical 9:16 for TikTok/Reels/Shorts, or square. 60 fps by default.

Before it starts, Claude asks four quick questions (format, feel, optional corner overlays
like artist name or timer, and whether you have images to use). Pick "designed from the song"
for the feel, or describe the vibe you want in your own words. Say "just do it" and it decides
everything.

## Requirements

- [Claude Code](https://claude.com/claude-code)
- Python 3.10+
- Node.js 18+
- ffmpeg (with ffprobe) on your PATH
- Bash: built in on macOS and Linux; on Windows, Git Bash (comes with Git for Windows)
- About 5 GB of free disk for the Python environment and models, set up on first use in
  `~/.raw-kinetiq/venv` (override with the `RAW_KINETIQ_VENV` environment variable)

Everything runs locally. Nothing is uploaded anywhere: your song, lyrics and images never leave
your computer.

### What it downloads

Only on first use, and only from these sources:

- **Python packages** into `~/.raw-kinetiq/venv` with pip, from PyPI: faster-whisper, librosa,
  soundfile, demucs, pillow, and PyTorch (the CPU build comes from download.pytorch.org).
  rembg is added only the first time you ask for a cutout.
- **Node packages** into each song's `video/` folder with npm: Remotion and its packages, pinned
  to an exact version in `template/package.json`. Remotion fetches its own headless Chrome for
  rendering.
- **Models:** Whisper large-v3 (from Hugging Face, through faster-whisper), the Demucs `htdemucs`
  model (from Meta's public download server), and rembg's cutout models (from GitHub releases),
  each cached on your disk after the first download.
- **Fonts:** the Google Fonts the design uses, saved into the song's project.

## Install

**As a plugin** (inside Claude Code):

```
/plugin marketplace add bani4kaskashka/Claude-Skill-Raw-Kinetiq
/plugin install raw-kinetiq@raw-kinetiq
```

**Or by hand:** copy the `skills/raw-kinetiq` folder (just that folder) to
`~/.claude/skills/raw-kinetiq`.

## Use

Just ask, in your own words:

> make a kinetic lyric video for ~/Music/my-song.mp3

> RAW KINETIQ this track, vertical for TikTok. Lyrics: ...

Lyrics can be pasted into the chat, read from the file's tags (Suno embeds them), or
transcribed when you have none. Claude checks them against what's actually sung, shows you
any changes, reviews the timing, renders preview stills, and then renders the video next to
your song.

On a typical desktop CPU, a 3-minute song takes about 10 minutes to analyse (only the
first time; it's cached) and about 10 minutes to render at 1080p60.

## Tweaking

After the first render, ask Claude for changes ("the chant at 0:08 is early", "less going
on in the background", "make the chorus hit harder", "put the cover art behind the bridge").
Under the hood, each song gets a project folder with:

- `work/lyrics.txt` and `work/sections.json`: the lyrics, the timing of each section and line,
  and per-section looks
- `video/src/data/config.json`: the design (colours, fonts, motion, backgrounds, your images),
  size, fps, overlays and end card
- `video/src/custom/`: anything written just for this song

The whole toolkit is listed in [skills/raw-kinetiq/references/toolkit.md](skills/raw-kinetiq/references/toolkit.md).

Re-rendering never re-runs the slow analysis.

## How it works

1. `prepare.py`: beat and energy analysis (librosa), Demucs vocal separation, two Whisper passes
2. `build_timeline.py`: aligns your lyrics to the transcripts, proposes sections, picks a style
   per line, and flags lines it had to guess
3. Claude designs the video for this song and reviews the timing guesses against the vocal
   onsets and energy, like an editor would
4. `assets.py` brings in your images and cuts out subjects ([rembg](https://github.com/danielgatis/rembg))
5. `check.sh` renders the song at 4 frames a second and reports layout and readability problems
6. A [Remotion](https://www.remotion.dev) project renders the video in headless Chrome

## License

RAW KINETIQ is MIT licensed (see [LICENSE](LICENSE)).

It builds on other projects with their own licenses:

- **[Remotion](https://www.remotion.dev)** renders the video. Remotion is free for individuals
  and small teams, but larger companies need a paid company license. Check
  [remotion.dev/license](https://www.remotion.dev/license) before using it at work.
- [faster-whisper](https://github.com/SYSTRAN/faster-whisper) (MIT),
  [Demucs](https://github.com/facebookresearch/demucs) (MIT),
  [librosa](https://github.com/librosa/librosa) (ISC), PyTorch (BSD), Pillow (MIT-CMU)
- [rembg](https://github.com/danielgatis/rembg) (MIT) cuts out subjects from your images, only
  when you ask for a cutout; its models download on first use
- Fonts come from Google Fonts (mostly SIL Open Font License; each family has its own)

Demo: "Cut" by ca11mebucky.
