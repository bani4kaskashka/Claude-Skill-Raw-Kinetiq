import React from "react";
import { AbsoluteFill } from "remotion";
import { H, W, clamp01, easeInOut, theme } from "./data";
import * as custom from "./custom";

/*
 * Moments: things that happen in the video because of what a line says. A line about a mouth gets
 * a mouth, drawn, opening as the word lands, and the camera goes in; a line about exits gets a
 * corridor of exit signs rushing past. Each moment is drawn in code for this song (custom/,
 * "moments"), timed to its lyric, and can move the camera and the lyrics while it is on.
 */

export type MomentProps = {
  /** song time, seconds */
  t: number;
  /** seconds since the moment began (negative while it fades in) */
  local: number;
  /** 0..1 through the moment */
  p: number;
  /** its length in seconds */
  dur: number;
  /** 0..1, how present it is (its fade in and out) */
  on: number;
  /** the display font's family */
  display: string;
};

/** Where the camera looks: x, y the point at the centre of the frame (0..1 of it), z zoom, r degrees. */
export type Cam = { x: number; y: number; z: number; r: number };
/** A camera keyframe at song time `at` (seconds); values left out carry on from the key before. */
export type CamKey = { at: number; x?: number; y?: number; z?: number; r?: number; ease?: (p: number) => number };

/**
 * Where the lyrics go while the moment is on: x, y where their centre sits (0..1 of the frame),
 * a scale, a turn, an opacity, and ride: true to move with the moment's camera (words painted on
 * the thing the camera is looking at).
 */
export type LyricPlace = { x?: number; y?: number; scale?: number; rotate?: number; opacity?: number; ride?: boolean };

export type Moment = {
  /** shows in the check report and the moments sheet */
  name: string;
  /** song seconds; take them from the lyric (lineAt, wordIn, wordAt in ../draw) */
  from: number;
  to: number;
  draw: React.FC<MomentProps>;
  /** behind the lyrics (default) or in front of them */
  layer?: "back" | "front";
  /** the drawing fills the frame: the scene stops showing behind it (bg: its backing colour, default the theme's) */
  cover?: boolean;
  bg?: string;
  /** seconds to fade in before `from` and out after `to` (default 0.25; 0 is a hard cut) */
  fadeIn?: number;
  fadeOut?: number;
  /** the moment's own camera; it holds its last key while fading out */
  cam?: CamKey[];
  /** how much of that camera the scene behind gets, 0..1 (default 1, or 0 with cover) */
  world?: number;
  /** where the lyrics go meanwhile, fixed or as a function of the moment */
  lyrics?: LyricPlace | ((m: MomentProps) => LyricPlace);
};

// read at render time: custom/ imports from the kit, and older projects have no "moments"
const all = (): Moment[] => (custom as { moments?: Moment[] }).moments ?? [];
const FADE = 0.25;

const presenceOf = (m: Moment, t: number) => {
  const fi = m.fadeIn ?? FADE;
  const fo = m.fadeOut ?? FADE;
  if (t < m.from - fi || t > m.to + fo) return 0;
  if (t < m.from) return fi > 0 ? easeInOut(clamp01((t - m.from + fi) / fi)) : 1;
  if (t > m.to) return fo > 0 ? 1 - easeInOut(clamp01((t - m.to) / fo)) : 0;
  return 1;
};

const propsOf = (m: Moment, t: number, display: string): MomentProps => ({
  t,
  local: t - m.from,
  p: clamp01((t - m.from) / Math.max(1e-6, m.to - m.from)),
  dur: m.to - m.from,
  on: presenceOf(m, t),
  display,
});

const STILL: Cam = { x: 0.5, y: 0.5, z: 1, r: 0 };

const camOf = (m: Moment, t: number): Cam => {
  const k = m.cam;
  if (!k?.length) return STILL;
  const at = (i: number): Cam => {
    const c = { ...STILL };
    for (let j = 0; j <= i; j++) Object.assign(c, Object.fromEntries(Object.entries(k[j]).filter(([n, v]) => n in c && v !== undefined)));
    return c;
  };
  const tt = Math.min(t, m.to);
  if (tt <= k[0].at) return at(0);
  for (let i = 1; i < k.length; i++) {
    if (tt < k[i].at) {
      const a = at(i - 1);
      const b = at(i);
      const e = (k[i].ease ?? easeInOut)(clamp01((tt - k[i - 1].at) / (k[i].at - k[i - 1].at)));
      // zoom moves in ratios, so a dive keeps the same speed all the way in
      return { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e, z: a.z * Math.pow(b.z / a.z, e), r: a.r + (b.r - a.r) * e };
    }
  }
  return at(k.length - 1);
};

/** The camera part way: w = 0 still, 1 all of it. */
const toward = (c: Cam, w: number): Cam => ({ x: 0.5 + (c.x - 0.5) * w, y: 0.5 + (c.y - 0.5) * w, z: Math.pow(c.z, w), r: c.r * w });

/** CSS that puts the point (x, y) at the centre of the frame, zoomed by z. */
const camCss = (c: Cam) =>
  c.x === 0.5 && c.y === 0.5 && c.z === 1 && c.r === 0 ? "" : `scale(${c.z}) rotate(${c.r}deg) translate(${(0.5 - c.x) * W}px, ${(0.5 - c.y) * H}px)`;

/** The moments showing at t, with their presence. */
export const momentsAt = (t: number) =>
  all()
    .map((m) => ({ m, on: presenceOf(m, t) }))
    .filter((x) => x.on > 0);

/** The scene's share of the moments' cameras. */
export const worldCam = (t: number) =>
  momentsAt(t)
    .map(({ m, on }) => camCss(toward(camOf(m, t), on * (m.world ?? (m.cover ? 0 : 1)))))
    .join(" ");

/** 1 when a covering moment fills the frame (the scene can be skipped). */
export const covered = (t: number) => momentsAt(t).some(({ m, on }) => m.cover && on >= 1);

/** Where the lyrics go while moments are on (the latest moment that says). */
export const lyricPlace = (t: number, display: string): React.CSSProperties => {
  const live = momentsAt(t).filter(({ m }) => m.lyrics);
  const cur = live[live.length - 1];
  if (!cur) return {};
  const { m, on } = cur;
  const pl = typeof m.lyrics === "function" ? m.lyrics(propsOf(m, t, display)) : (m.lyrics as LyricPlace);
  const x = ((pl.x ?? 0.5) - 0.5) * W * on;
  const y = ((pl.y ?? 0.5) - 0.5) * H * on;
  const s = 1 + ((pl.scale ?? 1) - 1) * on;
  const ride = pl.ride ? camCss(toward(camOf(m, t), on)) : "";
  return {
    transform: `${ride} translate(${x}px, ${y}px) rotate(${(pl.rotate ?? 0) * on}deg) scale(${s})`,
    opacity: 1 + ((pl.opacity ?? 1) - 1) * on,
  };
};

/** Draws this layer's moments, each under its own camera. */
export const MomentLayer: React.FC<{ t: number; layer: "back" | "front"; display: string }> = ({ t, layer, display }) => (
  <>
    {momentsAt(t)
      .filter(({ m }) => (m.layer ?? "back") === layer)
      .map(({ m, on }) => {
        const D = m.draw;
        return (
          <AbsoluteFill key={m.name} style={{ opacity: on, backgroundColor: m.cover ? (m.bg ?? theme.bg) : undefined }}>
            <AbsoluteFill style={{ transform: camCss(camOf(m, t)) || undefined }}>
              <D {...propsOf(m, t, display)} />
            </AbsoluteFill>
          </AbsoluteFill>
        );
      })}
  </>
);

/** For the check report: which moments are on, how far through, and whether the camera is diving (a transition). */
export const momentReport = (t: number) =>
  momentsAt(t).map(({ m }) => {
    const c = camOf(m, t);
    const r2 = (v: number) => Math.round(v * 100) / 100;
    return { name: m.name, p: r2(clamp01((t - m.from) / Math.max(1e-6, m.to - m.from))), dive: diving(m, t), z: r2(c.z), x: r2(c.x), y: r2(c.y), r: r2(c.r) };
  });

// zoomed far in, or zooming in fast
const diving = (m: Moment, t: number) => {
  const z = camOf(m, t).z;
  return z >= 2.5 || camOf(m, t + 0.1).z / z > 1.12;
};
