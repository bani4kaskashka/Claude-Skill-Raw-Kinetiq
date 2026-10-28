import timelineJson from "./data/timeline.json";
import energyJson from "./data/energy.json";
import configJson from "./data/config.json";
import { Palette, THEMES, Theme, mixColor } from "./themes";
import { Role, fitPx } from "./fonts";

export type Word = { text: string; s: number; e: number };
export type Mode = "verse" | "chant" | "tunnel" | "shout" | "drop" | "outro";
export type Line = {
  start: number;
  end: number;
  out: number; // when the line leaves the screen
  mode: Mode;
  section: string;
  words: Word[];
};
export type SectionKind = "intro" | "verse" | "build" | "drop" | "break" | "outro";
export type Section = {
  name: string;
  kind: SectionKind;
  start: number;
  end: number;
  bars?: number;
  fast?: boolean;
  /** this section's own motion (same shape as config.motion) */
  motion?: object;
  /** this section's own background layers, by name */
  scene?: string[];
  /** this section's own colours, crossfaded in */
  colors?: Partial<Palette>;
};

/** A user image placed in the video (see assets.tsx). */
export type Asset = {
  file: string;
  as: "backdrop" | "cutout" | "poster" | "flash" | "texture";
  /** when: section names, section kinds, or [start, end] seconds; all of them when left out */
  sections?: string[];
  kinds?: SectionKind[];
  at?: [number, number][];
  [k: string]: unknown;
};

export const timeline = timelineJson as {
  duration: number;
  title: string;
  artist: string;
  bpm: number;
  hooks: string[];
  sections: Section[];
  lines: Line[];
  kicks: number[];
  beats: number[];
  downbeats: number[];
  flashes: number[];
};
/**
 * Loudness curves, 60 values a second, 0..1: `sub` (bass), `rms` (whole mix), `high`, `voc` (the
 * vocal stem), and `drive`: what the visuals pulse with, the bass on a beat-driven song or the
 * voice on a soft one (see REACT).
 */
export const energy = energyJson as { sub: number[]; rms: number[]; high: number[]; voc?: number[]; spec?: number[][]; drive: number[] };

export const config = configJson as {
  width: number;
  height: number;
  fps: number;
  audio: string;
  theme: string;
  /** any colours, on top of the theme's */
  colors?: Partial<Palette>;
  /** any Google Font or local file per role (prep.mjs fetches them) */
  fonts?: Partial<Record<Role, unknown>>;
  /** uppercase the lyrics (default: the theme's choice) */
  upper?: boolean;
  /** 0..1 grain, scanlines and vignette (default: the theme's) */
  grit?: number;
  /** the user's images */
  assets?: Asset[];
  /** corner readouts, all off unless switched on here */
  overlays?: { artist?: boolean; section?: boolean; timer?: boolean; bpm?: boolean };
  /** old switch: hud true turns every overlay on */
  hud?: boolean;
  /** title + artist card over the last seconds (default true) */
  endCard?: boolean;
  /** "auto" (scenes change with the song), "calm" (soft clouds and dust), "classic" (the square tunnel) */
  background?: "auto" | "calm" | "classic";
  /** how the lyrics move: a profile name from motion.ts, or {"profile", "verse", "drop", "energy", "scenes"} overrides */
  motion?: string | object;
};

const motionCfg = config.motion;
const songEnergy =
  typeof motionCfg === "string"
    ? (({ smooth: 0.25, story: 0.4 }) as Record<string, number>)[motionCfg] ?? 1
    : ((motionCfg as { energy?: number } | undefined)?.energy ?? 1);
/**
 * What the visuals react to. "beat": kicks and bass (songs with drums that drive). "voice": the
 * singing itself, every sung word is a hit and the vocal stem's loudness is the drive (soft,
 * slow and sparse songs, where kicks barely exist). Set "react" in config.json's motion;
 * by default a song with energy under 0.5 reacts to the voice.
 */
export const REACT: "beat" | "voice" = (motionCfg as { react?: "beat" | "voice" } | undefined)?.react ?? (songEnergy < 0.5 ? "voice" : "beat");

// every sung word, at most one every 0.3 s: the voice's own "kicks"
const wordHits: number[] = [];
for (const s of timeline.lines.flatMap((l) => l.words.map((w) => w.s)).sort((a, b) => a - b))
  if (!wordHits.length || s - wordHits[wordHits.length - 1] >= 0.3) wordHits.push(s);
/** the moments the visuals hit on: kicks, or sung words when the song reacts to the voice */
export const HITS = REACT === "voice" && wordHits.length ? wordHits : timeline.kicks;
energy.drive = REACT === "voice" ? (energy.voc ?? energy.rms) : energy.sub;

export const overlays = config.hud === true ? { artist: true, section: true, timer: true, bpm: true } : (config.overlays ?? {});

const BASE: Theme = {
  ...(THEMES[config.theme] ?? THEMES.phonk),
  ...(config.colors ?? {}),
  ...(config.upper !== undefined ? { upper: config.upper } : {}),
  ...(config.grit !== undefined ? { grit: config.grit } : {}),
};

/** The live palette. Sections can shift it ("colors"), so read it while rendering, never cache it. */
export const theme: Theme = { ...BASE };
const KEYS = ["bg", "text", "accent", "accent2", "dim"] as const;
const PAINT_FADE = 0.9;

/** Set `theme` to the palette at time t, crossfading at section changes. Called once per frame. */
export const paint = (t: number) => {
  const secs = timeline.sections;
  let i = secs.findIndex((s) => t >= s.start && t < s.end);
  if (i < 0) i = secs.length - 1;
  const cur = { ...BASE, ...(secs[i]?.colors ?? {}) };
  const p = i > 0 ? Math.min(1, (t - secs[i].start) / PAINT_FADE) : 1;
  const prev = p < 1 ? { ...BASE, ...(secs[i - 1].colors ?? {}) } : cur;
  for (const k of KEYS) theme[k] = mixColor(prev[k], cur[k], p);
};

// Layout: everything was designed on 1920x1080. U scales sizes, X/Y scale offsets,
// TS shrinks type a little in portrait where lines are narrower.
export const W = config.width;
export const H = config.height;
export const U = Math.min(W, H) / 1080;
export const X = W / 1920;
export const Y = H / 1080;
export const TS = W >= H ? 1 : 0.8;

/** Font size (px) that keeps `text` on one line inside `share` of the frame width; `max` is px at 1080p. */
export const fit = (max: number, text: string, share = 0.86, role: Role = "display", tracking = 0) =>
  fitPx(text, max * TS * U, W * share, role, tracking);

export const caps = (s: string) => (theme.upper ? s.toUpperCase() : s);

/** Index of the last value <= t in a sorted array, or -1. */
export const lastAtOrBefore = (arr: number[], t: number) => {
  let lo = 0;
  let hi = arr.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] <= t) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
};

/** Exponential decay since the most recent event in `arr`; 0 when none yet. */
export const pulse = (arr: number[], t: number, rate = 9) => {
  const i = lastAtOrBefore(arr, t);
  return i < 0 ? 0 : Math.exp(-(t - arr[i]) * rate);
};

export const sectionAt = (t: number): Section =>
  timeline.sections.find((s) => t >= s.start && t < s.end) ?? timeline.sections[timeline.sections.length - 1];

export const energyAt = (curve: number[], t: number) => curve[Math.min(curve.length - 1, Math.max(0, Math.round(t * 60)))] ?? 0;

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
export const easeOutExpo = (p: number) => (p >= 1 ? 1 : 1 - Math.pow(2, -10 * p));
export const easeInOut = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);

// How hard each kind of section hits the camera.
export const SHAKE: Record<SectionKind, number> = {
  intro: 0.35,
  verse: 0.55,
  build: 0.85,
  drop: 1.25,
  break: 1.0,
  outro: 0.15,
};
