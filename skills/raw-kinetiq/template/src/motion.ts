import { Section, SectionKind, config } from "./data";
import { Role } from "./fonts";

/*
 * How the lyrics move. This is a toolkit, not a menu: every song gets its own mix, designed
 * from what it is about, how it feels, its genre and tempo. Any part can take any enter, exit,
 * layout, font, case and colour; a section can change any of it again ("motion" in
 * sections.json). The recipes at the bottom are only examples of mixes that worked.
 */

/** how a burst appears */
export type Enter =
  | "slam" // whole burst crashes in from big + blurred
  | "rise" // each word rises out of a mask as it is sung
  | "fade" // the burst focuses in softly, words brighten as sung
  | "pop" // each word bounces in with an overshoot as it is sung
  | "type" // letters appear as they are sung
  | "drop" // each word falls in from above and settles
  | "wipe" // the burst is revealed left to right, following the singing
  | "zoom" // the burst flies in from far away
  | "flip" // each word flips up into place as it is sung
  | "scatter" // each word's letters fly in from all over and gather
  | "glitch" // the burst stutters in, sliced and offset
  | "stretch"; // each word grows up from the baseline, springy

/** how a burst leaves */
export type Exit =
  | "slash" // cut in half along a diagonal, halves fly apart
  | "cut" // gone on the frame the next burst arrives
  | "fade" // fades and drifts up
  | "blur" // dissolves into a blur
  | "fall" // letters drop away one by one
  | "push" // shoved out sideways
  | "zoom" // rushes past the camera
  | "sink" // sinks below a mask line
  | "scatter" // letters blow apart
  | "glitch" // stutters and flickers out
  | "wipe"; // wiped away left to right

/** where bursts sit */
export type Layout =
  | "center"
  | "jump" // hops between spots around the frame
  | "left" // left-aligned, like a notebook
  | "right"
  | "drift" // centred, floating slowly
  | "stack" // one word per row, big, left-aligned
  | "scatter" // each burst lands somewhere new, kept inside the frame
  | "low" // lower third, like a subtitle with attitude
  | "high"; // upper third

export type Part = {
  /** most words on screen at once; 0 = the whole line (wraps) */
  burst: number;
  enter: Enter;
  exit: Exit;
  layout: Layout;
  /** type size, 1 = normal verse size */
  size: number;
  /** colour while a word is being sung: "accent", "accent2", "text" (none) or any CSS colour */
  highlight: string;
  /** which font: "display" or "alt" (config.fonts) */
  font?: Role;
  /** "upper", "lower", "as-is" (default: the theme's) */
  case?: "upper" | "lower" | "as-is";
  /** text colour: "text", "accent", "accent2" or any CSS colour */
  color?: string;
  /** outlined letters that fill in as they are sung */
  stroke?: boolean;
  /** letter spacing in em */
  tracking?: number;
  /** italic slant in degrees (fake italic for fonts without one), e.g. -8 */
  skew?: number;
};

/** background family per section kind, or explicit layer lists per kind */
export type Scenes = "hard" | "neon" | "soft" | "minimal" | Partial<Record<SectionKind, string[][]>>;

export type Motion = {
  verse: Part;
  /** choruses, hooks and drops */
  drop: Part;
  /** camera shake, kick punch, RGB split and drop flashes: 0 = still, 1 = normal, 1.4 = violent */
  energy: number;
  /** background scenes */
  scenes: Scenes;
};

const P = (burst: number, enter: Enter, exit: Exit, layout: Layout, size = 1, highlight = "accent"): Part => ({
  burst,
  enter,
  exit,
  layout,
  size,
  highlight,
});

/**
 * Example mixes, not a menu. Start from whatever is closest (or from nothing) and change
 * anything; a song that sits between genres should borrow from several.
 */
export const RECIPES: Record<string, Motion> = {
  // short bursts that crash in and get cut down (made for a phonk track)
  aggressive: { verse: P(3, "slam", "slash", "jump"), drop: P(3, "slam", "slash", "center", 1.45), energy: 1.15, scenes: "hard" },
  // playful, on the beat
  bounce: { verse: P(3, "pop", "push", "center"), drop: P(2, "pop", "cut", "center", 1.4), energy: 0.75, scenes: "neon" },
  // clean and rhythmic, lets the visuals pulse
  pulse: { verse: P(4, "rise", "cut", "center", 0.95), drop: P(3, "slam", "cut", "center", 1.35), energy: 0.95, scenes: "neon" },
  // whole phrases that float and dissolve
  smooth: { verse: P(6, "fade", "blur", "drift", 0.85, "text"), drop: P(4, "fade", "blur", "center", 1.1), energy: 0.25, scenes: "soft" },
  // words written out like a notebook
  story: { verse: P(0, "type", "fade", "left", 1, "text"), drop: P(4, "rise", "fade", "center", 1.15), energy: 0.4, scenes: "minimal" },
  // sturdy lines, choruses land hard and crumble
  anthem: { verse: P(4, "rise", "fall", "center", 0.95), drop: P(3, "drop", "fall", "center", 1.4), energy: 0.9, scenes: "hard" },
};
/** old name */
export const PROFILES = RECIPES;

type PartialMotion = { profile?: string; recipe?: string; verse?: Partial<Part>; drop?: Partial<Part>; energy?: number; scenes?: Scenes };

const merge = (base: Motion, o?: PartialMotion): Motion => {
  if (!o) return base;
  const name = o.recipe ?? o.profile;
  const b = name && RECIPES[name] ? RECIPES[name] : base;
  return {
    verse: { ...b.verse, ...(o.verse ?? {}) },
    drop: { ...b.drop, ...(o.drop ?? {}) },
    energy: o.energy ?? b.energy,
    scenes: o.scenes ?? b.scenes,
  };
};

const cfg = (config as { motion?: string | PartialMotion }).motion;
/** the song's motion, from config.json: a recipe name, or {"recipe"?, "verse", "drop", "energy", "scenes"} */
export const SONG_MOTION: Motion = typeof cfg === "string" ? (RECIPES[cfg] ?? RECIPES.pulse) : merge(RECIPES.pulse, cfg);

/** motion for one section, with that section's own overrides applied */
export const motionFor = (s: Section | undefined): Motion => merge(SONG_MOTION, (s as { motion?: PartialMotion } | undefined)?.motion);
