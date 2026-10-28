# RAW KINETIQ design toolkit

Everything a song's design can use. It is all set in `video/src/data/config.json` (song-wide)
and `work/sections.json` (per section, rebuilt into the timeline by `build_timeline.py`), plus
anything you write in `video/src/custom/`. Re-render only; no re-analysis.

Contents: palette, type, motion parts, recipes, backgrounds, assets, custom pieces, a full example.

## Palette

`"theme"` picks a starting palette and font (`phonk`, `neon`, `toxic`, `gold`, `ice`, `paper`;
see `template/src/themes.json`). Treat it as a starting point, not a choice of look:

```json
"colors": { "bg": "#080a10", "text": "#ede4d3", "accent": "#ffb04a", "accent2": "#7c93ff", "dim": "rgba(237,228,211,0.5)" },
"upper": false,
"grit": 0.55
```

- `accent` colours the sung word (when a part highlights) and most glows; `accent2` is the
  second RGB-split colour and secondary details.
- `upper` uppercases the lyrics (default from the theme); `grit` 0..1 is grain, scanlines and vignette.
- A section can shift the palette for itself: `"colors": {"bg": "#120b07", "accent": "#ffcc66"}`
  in `sections.json`. It crossfades in over ~1 s. Use it for the turn in a song (a warmer
  chorus, a colder bridge, a flash of red in the one angry verse).
- Pull colours from the song's own world: the user's cover art (`assets.py` prints each
  image's main colours), the objects and places in the lyrics, the time of day it lives in.

## Type

Any Google Fonts family, or a font file in `video/public/`:

```json
"fonts": {
  "display": { "family": "Fraunces", "weight": 500 },
  "alt": { "family": "Instrument Serif", "italic": true },
  "mono": "Space Mono"
}
```

`display` is the main lyric font, `alt` a second voice a part can switch to (`"font": "alt"`),
`mono` the small overlay/end-card type. A string is just the family name. A local file:
`{"family": "Mine", "file": "fonts/mine.otf"}`. `prep.mjs` downloads them (it runs before
stills, checks and renders) and fails with close matches if a name is wrong.

Text is measured with the real font, so any font fits the frame. Ideas: a serif for an intimate
diary-like verse; a condensed grotesk for hard rap; a wide extended face for big electronic hooks;
a handwritten face for one bridge; a monospace for something cold and mechanical; two fonts
that argue with each other for a duet.

## Motion parts

`"motion"` holds two parts, `verse` (verse lines) and `drop` (chorus, hook and drop lines), plus
`energy`, `react`, `camera` and `scenes`. A section can override any of it except `react` with
`"motion": {...}` (same shape).

| field | values |
|---|---|
| `burst` | most words on screen at once; `0` = the whole line, wrapping |
| `enter` | `slam` crash in big + blurred, `rise` each word out of a mask, `fade` soft focus in, `pop` bounce per word, `type` letters as sung, `drop` fall in and bounce, `wipe` revealed left to right with the singing, `zoom` fly in from far, `flip` each word flips up, `scatter` letters gather from all over, `glitch` stutter in, `stretch` grow up from the baseline, `breathe` each word exhales into place as sung (out of a blur, letters drawing together; nothing shows before it is sung) |
| `exit` | `slash` cut in half diagonally, `cut` gone the frame the next lands, `fade` fade up, `blur` dissolve, `fall` letters drop away, `push` shoved sideways, `zoom` rush past the camera, `sink` sink behind a mask line, `scatter` letters blow apart, `glitch` stutter out, `wipe` wiped away, `drift` floats up and dissolves like smoke while the next burst arrives |
| `layout` | `center`, `jump` hop between spots, `left`, `right`, `drift` float, `stack` one word per row, `scatter` a new spot each burst, `low` lower third, `high` upper third |
| `size` | 1 = normal verse size (measured to fit, so big values are safe) |
| `highlight` | colour of the word being sung: `accent`, `accent2`, `text` (none) or any CSS colour |
| `font` | `display` or `alt` |
| `case` | `upper`, `lower`, `as-is` |
| `color` | base text colour: `text`, `accent`, `accent2` or any CSS colour |
| `stroke` | `true`: outlined letters that fill in as they are sung |
| `tracking` | letter spacing in em (e.g. `-0.03` tight, `0.2` airy) |
| `skew` | fake italic in degrees, e.g. `-8` |

`energy`: camera shake, kick punch, RGB split and flash strength. 0 = still, 0.2 = a breath,
1 = normal, 1.4 = violent. `scenes`: see backgrounds.

`react`: what the visuals pulse with. `"beat"` = kicks and bass. `"voice"` = the singing: every
sung word is a hit (rings, glows, cutouts that kick) and the vocal stem's loudness is the drive
(swells, halftone, light). Default: `voice` when `energy` is under 0.5, so soft songs with
barely any drums still pulse. Use `voice` for any song where the singing carries it.

`camera`: how the frame moves through a section. `still`, `float` (slow handheld drift),
`push` / `pull` (slowly in / out across the section), `pan` (sideways), `rise` (cranes up),
`orbit` (slowly turns), `breathe` (swells with the voice); or `{"move": "push", "amount": 1.5}`.
The scene moves fully and the lyrics about a third as much, which gives depth. Moves blend
into each other at section changes. Unset on a soft song (energy under 0.5): intro push,
verse float, build push, chorus breathe, break orbit, outro pull. Unset on a hard song: still
(kick shake does the work). Set it per section in `sections.json` to make each section a new shot.

Line styles that are not bursts: **chant** (each chop a giant hit, sliced when the drop part
exits with `slash`), **tunnel** (falling into the hook word), **shout** (one word at a time),
**outro** (letters drift apart). Change any line's style with `"modes"` in `sections.json`, or
give it a style you wrote (custom pieces).

## Recipes (examples, not a menu)

Mixes that worked, in `template/src/motion.ts`. Start from one with `"recipe": "smooth"` inside
`motion` if it helps, then change things; a song between genres should borrow from several.

| recipe | was made for | verse / chorus |
|---|---|---|
| `aggressive` | a phonk track | 3-word slams that get slashed / huge centred slams |
| `bounce` | bubbly pop | pops pushed out sideways / 2-word pops |
| `pulse` | clean electronic | rising words, hard cuts / slams |
| `smooth` | slow R&B | whole phrases fade and dissolve, drifting |
| `story` | storytelling rap / folk | typed, left-aligned lines / rising hooks |
| `anthem` | rock choruses | rising words that crumble / drops that fall apart |

## Backgrounds

Each section kind gets a scene; scenes crossfade at section changes. Pick them by family
(`"scenes": "hard" | "neon" | "soft" | "minimal"`), or list layers per section kind (each
inner list is one variant; repeats of a kind take the next variant):

```json
"scenes": { "verse": [["windows"], ["windows", "drift"]], "drop": [["windows", "beams"]], "outro": [["windows"]] }
```

or name one section's layers in `sections.json`: `"scene": ["bokeh"]`.

Built-in layers: `aurora` (soft colour clouds), `drift` and `rise` (dust / rising sparks),
`warp` (star streaks), `bars` (a quiet spectrum strip), `grid`, `gridFast`, `gridBoth`
(perspective floor), `rings`, `diamonds` (shockwaves on kicks), `tunnel` (square tunnel),
`marquee` (scrolling hook words), `halftone` (dot field swelling with the bass), `beams`
(sweeping light from above), `bokeh` (out-of-focus lights), `stripes` (sliding diagonal bands),
`glitch`.

Treat the background as a sequence of shots. Each section gets its own picture: a different
layer mix, camera move, palette or framing of the central image, and the chorus always opens
something up. Within one shot keep it clean (one main idea plus a quiet layer or two); across
the song, change it. A custom layer that carries the whole song should itself change by
section (see the example below), not just sit there.

## Assets (the user's images)

Bring them in with `scripts/assets.py` (it copies them to `video/public/assets/`, cuts out
subjects, prints main colours and writes `assets/sheet.png`). Then place them in config.json:

```json
"assets": [
  { "file": "assets/cover.jpg", "as": "backdrop", "sections": ["Bridge"], "mono": true, "dim": 0.6, "blur": 2 },
  { "file": "assets/me.cut.png", "as": "cutout", "kinds": ["verse"], "place": "right", "size": 0.85, "glow": true },
  { "file": "assets/cover.jpg", "as": "poster", "sections": ["Chorus 3"], "place": "center", "size": 0.5, "aspect": 1 },
  { "file": "assets/photo.jpg", "as": "flash", "kinds": ["drop"], "on": "downbeats", "every": 8 },
  { "file": "assets/paper.jpg", "as": "texture", "blend": "multiply", "opacity": 0.3 }
]
```

| as | what | options |
|---|---|---|
| `backdrop` | full-frame photo behind everything (the scene layers draw over it) | `dim` 0..1, `blur` px, `zoom` in/out/none, `mono`, `tint` colour, `react` bass/none, `opacity` |
| `cutout` | transparent PNG of a person or object | `place` left/right/center/bottom, `size` 0..1 of the frame height, `react` kick/float/none, `glow`, `mono`, `front` (over the lyrics) |
| `poster` | framed picture that floats | `place`, `size`, `aspect` (width/height), `tilt` |
| `flash` | full-frame cut-in for a split second | `on` downbeats/kicks/sections, `every` n, `hold` s, `blend`, `mono` |
| `texture` | overlay over everything | `blend`, `opacity` |

When: `"sections"` (names), `"kinds"` (section kinds), `"at": [[from, to]]` seconds, or always.
Plan the text around the images: a cutout on the right wants left or `high`/`low` text there;
a centred poster wants text above or below it; a busy backdrop wants `dim` and a solid font.
A backdrop sits under the scene layers, so give its sections light layers (or `"scene": []`).
The self-check flags text sitting on images and checks it is still readable.

## Custom pieces (`video/src/custom/index.tsx`)

When the song has an image the toolkit can't show, write it. Kept on `--update`.

- `layers`: background layers by name, used in `scenes`/`scene`. Props `{t, s, progress, display}`
  (time, section, 0..1 through the section, display font).
- `modes`: line styles by name, used in `"modes"`. Props `{line, t, display, chroma}`. Tag the
  text with `{...checkTag(text, settled)}` from `../lyrics` so the self-check sees it.
- `Foreground`: drawn over everything every frame.

Helpers: `theme` (the live palette), `timeline` (kicks, beats, downbeats, sections, lines),
`energy` + `energyAt(curve, t)` (`drive` = what to pulse with, plus sub, rms, high, voc),
`HITS` (kicks, or sung words on a voice-reactive song), `pulse(arr, t, rate)` (decay since the
last hit), `REACT`, `W`, `H`, `U` (1 at 1080p) from `../data`; `family(role)`, `textWidth`, `fitPx` from
`../fonts`; `hexA`, `mixColor` from `../themes`.

Example (from a song about being watched, a man counting windows at night): a building facade
whose windows light up one by one across the song, counting to twenty-five like the lyric.
It tells a story by section: the verses frame the whole facade from across the street, the
chorus pushes in on one lit window with a silhouette in it, the bridge turns the lights off
except one, the outro pulls back to the street at dawn.

```tsx
const Windows: React.FC<LayerProps> = ({ t, s, progress }) => {
  const lit = Math.round(25 * Math.min(1, t / (timeline.duration - 8)));
  const close = s.kind === "drop"; // the chorus frames one window, big
  const dark = s.name.startsWith("Bridge"); // the bridge: every light out but one
  // ...a grid of windows (or one window filling the frame when `close`); the first `lit` of a
  // fixed random order glow in theme.accent, brightening with energyAt(energy.drive, t)
};
export const layers = { windows: Windows };
```

## A full example

A paranoid soul song, "Count the Windows" (116 BPM, slow, sung, about being watched):

```json
{
  "theme": "ice",
  "colors": { "bg": "#080a10", "text": "#ede4d3", "accent": "#ffb04a", "accent2": "#7c93ff", "dim": "rgba(237,228,211,0.5)" },
  "fonts": { "display": { "family": "Fraunces", "weight": 500 }, "alt": { "family": "Instrument Serif", "italic": true } },
  "upper": false,
  "grit": 0.55,
  "motion": {
    "verse": { "burst": 5, "enter": "wipe", "exit": "fade", "layout": "left", "size": 0.85, "highlight": "accent", "case": "as-is" },
    "drop": { "burst": 4, "enter": "rise", "exit": "sink", "layout": "center", "size": 1.55, "font": "alt", "highlight": "accent", "case": "as-is" },
    "energy": 0.15,
    "react": "voice",
    "scenes": { "intro": [["bokeh"]], "verse": [["windows"], ["windows", "drift"]], "drop": [["windows", "beams"]], "build": [["rise", "aurora"]], "outro": [["windows", "aurora"]] }
  }
}
```

with warmer chorus colours and a cold bridge whose words stack like doors in `sections.json`:

```json
{ "name": "Chorus", "motion": { "camera": "push" } },
{ "name": "Bridge", "colors": { "bg": "#05080f", "accent": "#9db8ff" },
  "motion": { "camera": "orbit", "verse": { "burst": 3, "layout": "stack", "enter": "flip", "exit": "fade", "size": 1.1 } } }
```
