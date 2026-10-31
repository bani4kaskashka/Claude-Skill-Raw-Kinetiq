# RAW KINETIQ design toolkit

Everything a song's design can use. The heart of it is what you write for this song in
`video/src/custom/index.tsx`: the moments where the picture does what the lines say, its own
ways for words to arrive and leave, its own world in the background. Everything else is set in `video/src/data/config.json` (song-wide) and
`work/sections.json` (per section, rebuilt into the timeline by `build_timeline.py`).
Re-render only; no re-analysis.

Contents: the song's own pieces, moments, palette, type, motion parts, backgrounds, assets, a full example.

## The song's own pieces (`video/src/custom/index.tsx`)

Start here. The built-in parts below were made for earlier songs; what makes this video this
song's is what you write for it, from the central image and signature moves in `design.md`.
Kept on `--update`.

- `effects`: ways for words to arrive and/or leave, by name. Use the name as a motion part's
  `enter` and/or `exit` (song-wide or per section). Timing, bursts, layout, sizing and the
  self-check all keep working; you only write how it looks.
- `layers`: background layers by name, used in `scenes`/`scene`. Props `{t, s, progress, display}`
  (time, section, 0..1 through the section, display font).
- `modes`: line styles by name, used in `"modes"`. Props `{line, t, display, chroma}`. Tag the
  text with `{...checkTag(text, settled)}` from `../lyrics` so the self-check sees it. A mode
  named `chant`, `shout`, `tunnel` or `outro` replaces that built-in look for this song and keeps
  its rhythm timing.
- `moments`: what happens on screen because of what a line says (next section).
- `Foreground`: drawn over everything every frame.

An effect has up to two hooks:

- `word(f)`: draws one word and returns its element (split it into letters if you like). `f`
  has `text`, `w` (its timing: `w.s` sung at, `w.e` done), `t`, `since` (seconds since it was
  sung, negative before), `sung`, `e` (0 on screen, 0..1 while leaving), `seed` (for
  `random()`), `color` (highlight while sung) and `ink` (colour and outline styles to spread
  onto the text). Before a word is sung, draw it hidden or faint: words appear as they are sung.
- `burst(f)`: moves the whole burst while it arrives (`p` 0..1) and leaves (`e` 0..1); also gets
  `text`, `size` (px), `kind`, `first`, `out`. Returns any of `transform` (appended, e.g.
  `" scale(1.2)"`), `opacity`, `blur` (px at 1080p), `clip`, `filter`, and `over`: an element
  drawn over the burst's text box (a line through it, marks spreading across it, a stamp),
  positioned absolutely, `inset: 0` covers the words.
- `enterDur` / `exitDur` in seconds (defaults 0.3 / 0.5), and `overlap: true` when the exit may
  keep playing while the next burst arrives.

Example, from a song about a fever: words arrive trembling in heat haze and cool to still as
they are sung; a burst leaves by melting down, a wet line running through it.

```tsx
// the file already imports React and the Effect, LayerProps and LineProps types
import { random } from "remotion";
import { theme, U } from "../data";

const fever: Effect = {
  word: ({ text, since, sung, ink, seed }) => {
    const k = sung ? Math.max(0, 1 - since / 0.6) : 1; // 1 = feverish, 0 = cooled
    const j = random(seed) * 6;
    return (
      <span style={{ display: "inline-block", opacity: sung ? 1 : 0.12, filter: `blur(${4 * k * U}px)`,
        transform: `translateY(${Math.sin(since * 38 + j) * 7 * k * U}px) skewX(${9 * k}deg)`, ...ink }}>
        {text}
      </span>
    );
  },
  burst: ({ e }) => ({
    transform: ` translateY(${e * e * 60 * U}px) scaleY(${1 + 0.5 * e})`,
    opacity: 1 - e,
    over: e > 0 ? <div style={{ position: "absolute", left: 0, right: 0, top: "55%", height: 3 * U,
      background: theme.accent, transform: `scaleX(${Math.min(1, e * 2)})`, transformOrigin: "left" }} /> : null,
  }),
  exitDur: 0.6,
};
export const effects: Record<string, Effect> = { fever };
```

then `"drop": { "enter": "fever", "exit": "fever", "burst": 3, "layout": "center", "size": 1.5 }`.

A layer example, from a song about being watched (a man counting windows at night): a building
facade whose windows light up one by one across the song, counting to twenty-five like the
lyric. It tells a story by section: the verses frame the whole facade from across the street,
the chorus pushes in on one lit window with a silhouette in it, the bridge turns the lights off
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

Helpers: `theme` (the live palette), `timeline` (kicks, beats, downbeats, sections, lines),
`energy` + `energyAt(curve, t)` (`drive` = what to pulse with, plus sub, rms, high, voc),
`HITS` (kicks, or sung words on a voice-reactive song), `pulse(arr, t, rate)` (decay since the
last hit), `REACT`, `W`, `H`, `U` (1 at 1080p), `clamp01`, `easeOutExpo`, `easeInOut` from
`../data`; `family(role)`, `textWidth`, `fitPx` from `../fonts`; `hexA`, `mixColor` from
`../themes`; `checkTag`, `colorOf` from `../lyrics`.

## Moments: the picture does what the line says

A moment is a drawing that acts out a lyric: a hand flicking through a phone's contacts on "still
got your name in my phone", a corridor of exit signs racing past on "I know every exit", a pair
of lips closing on "don't say it". It is timed to its line, can move the camera (push in, dive
through, scroll), and can move the lyrics while it is on. They live in `moments`, in song order:

```tsx
import type { Moment, MomentProps } from "../moments";
import { lineAt, wordIn, seg, keys, ease, Stage } from "../draw";

const line = lineAt("still got your name in my phone");     // the 1st line with these words
const nameAt = wordIn(line, "name").s;                       // when "name" is sung

export const moments: Moment[] = [
  { name: "phone", from: line.start - 0.4, to: line.end + 0.4, draw: Phone,
    cover: true, cam: [...], lyrics: { y: 0.2, scale: 0.5, ride: true } },
];
```

A moment:
- `name`; `from`, `to` in song seconds. Take them from the lyrics, never type times: `lineAt(text,
  nth)` finds the nth sung line containing the text (`.start`, `.end`, `.words`), `wordIn(line,
  "word").s` the moment a word is sung, `wordAt("word", nth)` the nth time a word is sung in the
  song, `section("Chorus 2")` a section's `.start`/`.end`. A wrong text fails the build with the
  lines it could have meant.
- `draw`: the drawing, a React component given `{t, local, p, dur, on, display}` (song time,
  seconds since `from`, 0..1 through it, its length, its fade 0..1, the display font's family).
- `layer`: `"back"` (behind the lyrics, default) or `"front"` (over them: a hand reaching
  across the words, rain on the glass).
- `cover: true` when the drawing fills the frame: the scene behind stops showing (`bg` sets the
  backing colour). Leave it off to draw over the section's scene.
- `fadeIn` / `fadeOut`: seconds before `from` and after `to` (default 0.25; 0 is a hard cut on
  the beat).
- `cam`: the moment's own camera as keys `{at, x, y, z, r, ease}`: at song time `at`, look at
  point (x, y) (0..1 of the frame, 0.5 0.5 the centre) zoomed `z`, turned `r` degrees. Values
  left out carry on from the key before. Zoom moves in ratios, so a dive from 1.3 to 10 keeps
  its speed all the way in. `world` (0..1) is how much of it the scene behind gets (default 1,
  0 with `cover`).
- `lyrics`: where the words go meanwhile: `{x, y}` where their centre sits (0..1 of the frame),
  `scale`, `rotate`, `opacity`, and `ride: true` to move with the moment's camera, as if
  written on the thing it looks at. Or a function of the moment's props for words that move.

**Camera grammar.** Every moment makes one real move; a push of 1.1x reads as a still, and the
check flags it (`timid-camera`).
- **Dive** into an opening (a mouth, a door, a screen, an eye, a keyhole) that ends the moment,
  so the next shot comes out of it: `z` to 8-12 with `ease: ease.in` over the last half second,
  `x`/`y` on the opening, `fadeOut` 0.3-0.5, `cover: true`.
- **Push hard** on the word: 1.5x-3x in under a second, `ease: ease.out`, onto the detail it names.
- **Whip**: `x` swung 0.3-0.5 across in 0.2 s on a hit, onto the next thing.
- **Pull back**: start at 2-3x on one detail, end at 1 on the whole picture.
- **Race past**: the subject scrolling by fast (`Strip`, below), the camera holding or tilting.

```tsx
// "keep my name out of your mouth": hold on the lips, push in as "name" lands, dive in on "mouth"
cam: [
  { at: line.start - 0.3, z: 1 },
  { at: nameAt + 0.2, z: 1.8, y: 0.56, ease: ease.out },
  { at: mouthAt, z: 2.1 },
  { at: line.end + 0.4, z: 11, y: 0.6, ease: ease.in },
],
```

**The drawing kit** (`../draw`), all SVG, all in code:

| | |
|---|---|
| `Stage` | a full-frame `<svg>` in pixels (0..W, 0..H): draw in it |
| `seg(t, a, b, ease?)` | 0 before `a`, 1 after `b`: an action timed between two moments (`seg(t, nameAt - 0.2, nameAt + 0.2)`) |
| `keys(t, [[time, value], ...], ease?)` | a value through keyframes |
| `ease.inOut / out / in / back / linear` | easings (`back` overshoots and settles) |
| `smooth(points, closed?)` | a smooth curve through points: lips, a palm, a cable, a cloud |
| `poly(points, closed?)` | straight segments |
| `chain(x, y, [[len, deg], ...])` | a jointed chain (fingers, an arm, a swinging sign): animate the angles |
| `morph(a, b, k)` / `morphKeys(t, [[time, path], ...])` | between two drawings of one shape made with the same commands: lips shut and open, a fist and an open hand |
| `boil(d, t, amount)` | a hand-drawn wobble on every point, a few new drawings a second |
| `<Ink d draw={0..1}>` | a stroke drawing itself on |
| `<Strip n gap offset axis render>` | an endless row scrolling past as `offset` grows; `render(k)` gets which copy it is (a new number on every exit sign) |
| `<Glow id>`, `<Streak id x y>` | filter defs: soft light, motion blur for things moving fast |
| `noise(seed, t, rate)` | seeded flicker |

**Draw like an illustrator.** One drawing style for the whole song, chosen in `design.md` from
its world (neon line art, flat cut paper, ink and wash, blueprint lines, bold silhouettes,
comic panels, woodcut), with colours from its palette. Build each subject from its defining
parts: a mouth is two lips with their own curves, the dark inside, teeth, a highlight; a hand is
a palm, fingers that bend at two joints (separate tapered shapes, `chain` + `smooth`), a thumb
that opposes them, the knuckle lines; a rectangle with lines, or a mitten, is not a hand. Make it
big (a third of the frame or more: a close-up, not an icon) and simple enough to read in a
second on a phone. Keep it alive: something
always moves (a breath, a boil on the lines, light), and the main action lands on the word. Text
drawn inside a moment (a name on a screen, a sign) is part of the picture; the sung line still
shows as lyrics (place it with `lyrics`). Never use image generators or stock pictures; the
user's own images come in through assets.

Worked example, from a song about an old friend ("Still got your name in my phone, though"): a
hand holds a phone, the thumb flicking the contacts; the list slows and stops on one name as
"name" is sung, the camera pushes in with the line written above the list, and at the end of
the line it dives into the name, into the next section.

```tsx
import type { Moment, MomentProps } from "../moments";
import { Glow, Stage, Strip, chain, ease, keys, lineAt, poly, seg, smooth, wordIn } from "../draw";
import { H, W, theme } from "../data";

const phoneLine = lineAt("still got your name in my phone");
const nameAt = wordIn(phoneLine, "name").s;
const NAMES = ["Mom", "Dentist", "Dan (work)", "Elliot", "Gym", "Grandma", "Jules", "Landlord", "Maya", "Noah", "Pizza place", "Sam"];
const ROW = 92;
const TARGET = 36 + NAMES.indexOf("Jules"); // three times round the list, then this name

const Phone: React.FC<MomentProps> = ({ t, local, display }) => {
  const cx = W / 2, cy = H / 2 + 40, pw = 380, ph = 760;
  const sx = cx - pw / 2 + 24, sy = cy - ph / 2 + 64, sw = pw - 48, sh = ph - 128;
  // the list flicks fast, slows, and stops on one name as "name" is sung
  const stop = TARGET * ROW - (sh / 2 - ROW / 2);
  const offset = keys(t, [[phoneLine.start - 0.4, 0], [nameAt - 0.7, stop * 0.86], [nameAt, stop]], ease.out);
  const landed = seg(t, nameAt - 0.15, nameAt + 0.25);
  const flick = Math.sin(local * 10) * 14 * (1 - landed);
  const skin = theme.accent, line = "#2a1c18", glass = theme.accent2;
  const palm = smooth([[cx - 330, H + 40], [cx - 300, cy + 270], [cx - 250, cy + 130], [cx - 190, cy + 80], [cx - 120, cy + 140],
    [cx - 40, cy + 280], [cx + 90, cy + 330], [cx + 210, cy + 300], [cx + 250, cy + 400], [cx + 140, H + 40]], true);
  const thumb = chain(cx - 205, cy + 215, [[120, -48 + flick], [95, 22]]);
  return (
    <Stage>
      <defs><Glow id="screen" size={18} strength={0.9} /></defs>
      <g transform={`rotate(-6 ${cx} ${cy})`}>
        <path d={palm} fill={skin} stroke={line} strokeWidth={6} />
        <rect x={cx - pw / 2} y={cy - ph / 2} width={pw} height={ph} rx={56} fill="#07080f" stroke={glass} strokeWidth={5} filter="url(#screen)" />
        <rect x={cx - 50} y={cy - ph / 2 + 22} width={100} height={22} rx={11} fill="#000" />
        <clipPath id="list"><rect x={sx} y={sy} width={sw} height={sh} rx={20} /></clipPath>
        <g clipPath="url(#list)">
          <rect x={sx} y={sy + sh / 2 - ROW / 2} width={sw} height={ROW} fill={skin} opacity={0.18 * landed} />
          <g transform={`translate(${sx + 26} ${sy})`}>
            <Strip n={10} gap={ROW} offset={offset} axis="y" render={(k) => {
              const name = NAMES[((k % NAMES.length) + NAMES.length) % NAMES.length];
              const hit = k === TARGET;
              return (
                <g opacity={hit ? 0.5 + 0.5 * landed : 0.55}>
                  <circle cx={26} cy={ROW / 2} r={24} fill="none" stroke={glass} strokeWidth={3} />
                  <text x={26} y={ROW / 2 + 10} fontSize={26} textAnchor="middle" fontFamily={display} fill={glass}>{name[0]}</text>
                  <text x={70} y={ROW / 2 + 12} fontSize={34} fontFamily={display} fill={hit && landed > 0.5 ? skin : theme.text}>{name}</text>
                </g>
              );
            }} />
          </g>
        </g>
        {/* fingers wrapped round the right edge, in front of the phone */}
        {[0, 1, 2, 3].map((i) => (
          <g key={i}>
            <rect x={cx + pw / 2 - 26} y={cy - 70 + i * 78} width={78 - i * 6} height={62} rx={31} fill={skin} stroke={line} strokeWidth={6} />
            <path d={`M${cx + pw / 2 + 30 - i * 6} ${cy - 56 + i * 78} q 12 18 0 36`} fill="none" stroke={line} strokeWidth={3} opacity={0.5} />
          </g>
        ))}
        {/* the thumb on the glass, flicking the list: outline, then skin */}
        <path d={poly(thumb)} fill="none" stroke={line} strokeWidth={70} strokeLinecap="round" strokeLinejoin="round" />
        <path d={poly(thumb)} fill="none" stroke={skin} strokeWidth={58} strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </Stage>
  );
};

export const moments: Moment[] = [
  {
    name: "phone",
    from: phoneLine.start - 0.4,
    to: phoneLine.end + 0.4,
    draw: Phone,
    cover: true,
    fadeIn: 0.35,
    fadeOut: 0.4,
    cam: [
      { at: phoneLine.start - 0.4, z: 0.92 },
      { at: nameAt, z: 1.15, y: 0.52 },
      { at: phoneLine.end - 0.1, z: 1.25 },
      { at: phoneLine.end + 0.4, z: 10, ease: ease.in },
    ],
    lyrics: { y: 0.2, scale: 0.5, ride: true },
  },
];
```

That is one style for one song; another song's hands would be drawn its own way. Look at every
moment before rendering: `check/moments.png` shows each one at its start, middle and end, and
`node stills.mjs <times>` renders full-size frames. If a drawing doesn't read as what it is to
someone who hasn't heard the song, redraw it (more of its defining parts, a clearer silhouette,
better proportions) and look again.

## Palette

Write every colour for this song. (The `"theme"` names in `template/src/themes.json` are old
starting palettes from earlier songs; don't design from them.)

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
`"motion": {...}` (same shape). Set every field of both parts yourself.

`enter` and `exit` take the name of one of this song's own effects (above), or a built-in. The
built-ins are building blocks for the in-between lines; several were made for earlier songs
(`slam`, `slash`, `cut`, `glitch` for a phonk track), so use one only when it fits this song's
image and say why in `design.md`.

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

Line styles that are not bursts, assigned from the lyrics for their rhythm: **chant** (one hit
per chop), **tunnel** (the hook word repeated), **shout** (one word at a time), **outro** (the
last lines). Their built-in looks (giant hits sliced in half, falling into the word, letters
drifting apart) were made for earlier songs: give them this song's look by writing a mode of the
same name, or turn the line into `verse`/`drop` with `"modes"` in `sections.json`.

## Backgrounds

Each section kind gets a scene; scenes crossfade at section changes. List the layers per
section kind, the song's own layers first (each inner list is one variant; repeats of a kind
take the next variant):

```json
"scenes": { "verse": [["windows"], ["windows", "drift"]], "drop": [["windows", "beams"]], "outro": [["windows"]] }
```

or name one section's layers in `sections.json`: `"scene": ["bokeh"]`.

Built-in layers, to sit around the song's own world (a quiet second layer, a texture), not to
be it: `aurora` (soft colour clouds), `drift` and `rise` (dust / rising sparks),
`warp` (star streaks), `bars` (a quiet spectrum strip), `grid`, `gridFast`, `gridBoth`
(perspective floor), `rings`, `diamonds` (shockwaves on kicks), `tunnel` (square tunnel),
`marquee` (scrolling hook words), `halftone` (dot field swelling with the bass), `beams`
(sweeping light from above), `bokeh` (out-of-focus lights), `stripes` (sliding diagonal bands),
`glitch`.

Treat the background as a sequence of shots. Each section gets its own picture: a different
layer mix, camera move, palette or framing of the central image, and the chorus always opens
something up. Within one shot keep it clean (one main idea plus a quiet layer or two); across
the song, change it. A custom layer that carries the whole song should itself change by
section (see the windows example above), not just sit there.

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

## A full example

A paranoid soul song, "Count the Windows" (116 BPM, slow, sung, about being watched). Its
signature: each word switches on like a lit window as it is sung (an effect, `window`), and the
facade above (a layer, `windows`) carries the story.

```json
{
  "colors": { "bg": "#080a10", "text": "#ede4d3", "accent": "#ffb04a", "accent2": "#7c93ff", "dim": "rgba(237,228,211,0.5)" },
  "fonts": { "display": { "family": "Fraunces", "weight": 500 }, "alt": { "family": "Instrument Serif", "italic": true } },
  "upper": false,
  "grit": 0.55,
  "motion": {
    "verse": { "burst": 5, "enter": "window", "exit": "fade", "layout": "left", "size": 0.85, "highlight": "accent", "case": "as-is" },
    "drop": { "burst": 4, "enter": "window", "exit": "sink", "layout": "center", "size": 1.55, "font": "alt", "highlight": "accent", "case": "as-is" },
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
