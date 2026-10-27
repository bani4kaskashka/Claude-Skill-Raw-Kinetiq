import timelineJson from "./data/timeline.json";
import energyJson from "./data/energy.json";
import configJson from "./data/config.json";
import { THEMES, Theme } from "./themes";

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
export type Section = { name: string; kind: SectionKind; start: number; end: number; bars?: number; fast?: boolean };

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
export const energy = energyJson as { sub: number[]; rms: number[]; high: number[]; spec?: number[][] };

export const config = configJson as {
  width: number;
  height: number;
  fps: number;
  audio: string;
  theme: string;
  /** optional colour overrides on top of the theme */
  colors?: Partial<Pick<Theme, "bg" | "text" | "accent" | "accent2" | "dim">>;
  /** corner readouts, all off unless switched on here */
  overlays?: { artist?: boolean; section?: boolean; timer?: boolean; bpm?: boolean };
  /** old switch: hud true turns every overlay on */
  hud?: boolean;
  /** title + artist card over the last seconds (default true) */
  endCard?: boolean;
  /** "auto" (scenes change with the song), "calm" (soft clouds and dust), "classic" (the square tunnel) */
  background?: "auto" | "calm" | "classic";
  /** max words on screen at once in verse/drop lines (default 3) */
  chunk?: number;
};

export const overlays = config.hud === true ? { artist: true, section: true, timer: true, bpm: true } : (config.overlays ?? {});

export const theme: Theme = { ...(THEMES[config.theme] ?? THEMES.phonk), ...(config.colors ?? {}) };

// Layout: everything was designed on 1920x1080. U scales sizes, X/Y scale offsets,
// TS shrinks type a little in portrait where lines are narrower.
export const W = config.width;
export const H = config.height;
export const U = Math.min(W, H) / 1080;
export const X = W / 1920;
export const Y = H / 1080;
export const TS = W >= H ? 1 : 0.8;

/** Font size that keeps `chars` characters of display type inside `share` of the width. */
export const fit = (max: number, chars: number, share = 0.86) => Math.min(max * TS * U, (W * share) / (Math.max(chars, 1) * theme.charW));

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
