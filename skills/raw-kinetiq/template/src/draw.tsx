import React from "react";
import { random } from "remotion";
import { H, Line, Section, W, Word, clamp01, easeInOut, easeOutExpo, timeline } from "./data";

/*
 * The drawing kit for moments (moments.tsx): finding the lyric a moment hangs on, timing an action
 * inside it, and drawing with SVG. Everything in a video is drawn here in code; nothing is generated.
 */

// ---- the lyrics a moment hangs on --------------------------------------------------------------

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/[^\p{L}\p{N}' ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
const lineText = (l: Line) => norm(l.words.map((w) => w.text).join(" "));

/** The nth sung line (0 = first) containing `text`, punctuation and case ignored. */
export const lineAt = (text: string, nth = 0): Line => {
  const q = norm(text);
  const hits = timeline.lines.filter((l) => lineText(l).includes(q));
  if (!hits[nth]) {
    const close = timeline.lines.map(lineText).filter((s) => q.split(" ").some((w) => w.length > 3 && s.includes(w)));
    throw new Error(`lineAt("${text}", ${nth}): ${hits.length} matching lines. Lines with those words: ${close.slice(0, 6).join(" | ") || "none"}`);
  }
  return hits[nth];
};

/** A word inside a line (its first match), e.g. wordIn(lineAt("out of your mouth"), "mouth").s */
export const wordIn = (line: Line, text: string): Word => {
  const q = norm(text);
  const w = line.words.find((x) => norm(x.text) === q) ?? line.words.find((x) => norm(x.text).includes(q));
  if (!w) throw new Error(`wordIn: no "${text}" in "${line.words.map((x) => x.text).join(" ")}"`);
  return w;
};

/** The nth time `text` (one word) is sung in the whole song. */
export const wordAt = (text: string, nth = 0): Word => {
  const q = norm(text);
  const all = timeline.lines.flatMap((l) => l.words).filter((x) => norm(x.text) === q);
  if (!all[nth]) throw new Error(`wordAt("${text}", ${nth}): sung ${all.length} times`);
  return all[nth];
};

/** A section by name (sections.json), e.g. section("chorus 2").start */
export const section = (name: string): Section => {
  const s = timeline.sections.find((x) => x.name === name);
  if (!s) throw new Error(`section("${name}"): sections are ${timeline.sections.map((x) => x.name).join(", ")}`);
  return s;
};

// ---- timing an action -------------------------------------------------------------------------

export const ease = {
  inOut: easeInOut,
  out: easeOutExpo,
  in: (p: number) => p * p * p,
  /** overshoots a little and settles: things that snap into place */
  back: (p: number) => 1 + 2.7 * Math.pow(p - 1, 3) + 1.7 * Math.pow(p - 1, 2),
  linear: (p: number) => p,
};

export const mix = (a: number, b: number, k: number) => a + (b - a) * k;

/** 0 before a, 1 after b, eased in between: how far an action timed from a to b has got at t. */
export const seg = (t: number, a: number, b: number, e: (p: number) => number = easeInOut) => e(clamp01((t - a) / Math.max(1e-6, b - a)));

/** A value through keyframes [[time, value], ...] (times ascending), eased between each pair. */
export const keys = (t: number, k: [number, number][], e: (p: number) => number = easeInOut) => {
  if (t <= k[0][0]) return k[0][1];
  for (let i = 1; i < k.length; i++) if (t < k[i][0]) return mix(k[i - 1][1], k[i][1], e((t - k[i - 1][0]) / (k[i][0] - k[i - 1][0])));
  return k[k.length - 1][1];
};

/** Seeded 0..1 noise that changes `rate` times a second (for jitter, flicker, boil). */
export const noise = (seed: string, t: number, rate = 12) => random(`${seed}:${Math.floor(t * rate)}`);

// ---- paths ------------------------------------------------------------------------------------

type Pt = [number, number];
const NUM = /-?\d*\.?\d+(?:e-?\d+)?/gi;

/**
 * Between two paths drawn with the same commands (same number of points, in the same order):
 * k = 0 gives a, 1 gives b. Draw a shape twice (lips shut / lips open, fist / open hand) and morph.
 */
export const morph = (a: string, b: string, k: number) => {
  const nb = b.match(NUM) ?? [];
  let i = 0;
  const out = a.replace(NUM, (m) => {
    const v = parseFloat(m);
    const w = i < nb.length ? parseFloat(nb[i]) : v;
    i++;
    return (v + (w - v) * k).toFixed(2);
  });
  if (i !== nb.length) throw new Error(`morph: the paths have ${i} and ${nb.length} numbers; draw both with the same commands`);
  return out;
};

/** A path through keyframes [[time, path], ...], morphing between each pair. */
export const morphKeys = (t: number, k: [number, string][], e: (p: number) => number = easeInOut) => {
  if (t <= k[0][0]) return k[0][1];
  for (let i = 1; i < k.length; i++) if (t < k[i][0]) return morph(k[i - 1][1], k[i][1], e((t - k[i - 1][0]) / (k[i][0] - k[i - 1][0])));
  return k[k.length - 1][1];
};

/** A hand-drawn wobble: every number in the path shakes a little, `rate` new drawings a second. */
export const boil = (d: string, t: number, amount = 2, rate = 8, seed = "b") => {
  let i = 0;
  const f = Math.floor(t * rate);
  return d.replace(NUM, (m) => (parseFloat(m) + (random(`${seed}${f}:${i++}`) - 0.5) * 2 * amount).toFixed(2));
};

/** A smooth curve through points (Catmull-Rom), closed into a loop when asked. Organic shapes from a few points. */
export const smooth = (pts: Pt[], closed = false, tension = 1) => {
  if (pts.length < 2) return "";
  const P = closed ? [pts[pts.length - 1], ...pts, pts[0], pts[1]] : [pts[0], ...pts, pts[pts.length - 1]];
  let d = `M${pts[0][0].toFixed(2)},${pts[0][1].toFixed(2)}`;
  for (let i = 1; i < P.length - 2; i++) {
    const [p0, p1, p2, p3] = [P[i - 1], P[i], P[i + 1], P[i + 2]];
    const c1: Pt = [p1[0] + ((p2[0] - p0[0]) / 6) * tension, p1[1] + ((p2[1] - p0[1]) / 6) * tension];
    const c2: Pt = [p2[0] - ((p3[0] - p1[0]) / 6) * tension, p2[1] - ((p3[1] - p1[1]) / 6) * tension];
    d += ` C${c1[0].toFixed(2)},${c1[1].toFixed(2)} ${c2[0].toFixed(2)},${c2[1].toFixed(2)} ${p2[0].toFixed(2)},${p2[1].toFixed(2)}`;
  }
  return closed ? d + " Z" : d;
};

/** Straight segments through points. */
export const poly = (pts: Pt[], closed = false) => pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(" ") + (closed ? " Z" : "");

/**
 * A jointed chain from (x, y): each [length, angle in degrees] bends from the one before
 * (0 = pointing right, 90 = down). Arms, fingers, cables, a swinging sign: animate the angles.
 */
export const chain = (x: number, y: number, segs: [number, number][]): Pt[] => {
  const pts: Pt[] = [[x, y]];
  let a = 0;
  for (const [len, deg] of segs) {
    a += (deg * Math.PI) / 180;
    const [px, py] = pts[pts.length - 1];
    pts.push([px + Math.cos(a) * len, py + Math.sin(a) * len]);
  }
  return pts;
};

// ---- drawing ----------------------------------------------------------------------------------

/** A full-frame SVG in pixels (0..W, 0..H). Draw moments in it. */
export const Stage: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", inset: 0, overflow: "visible", ...style }}>
    {children}
  </svg>
);

/** A path that draws itself on: draw = 0 nothing, 1 the whole stroke. */
export const Ink: React.FC<React.SVGProps<SVGPathElement> & { d: string; draw?: number }> = ({ d, draw = 1, ...rest }) => (
  <path
    d={d}
    pathLength={1}
    strokeDasharray={draw < 1 ? "1 1" : undefined}
    strokeDashoffset={draw < 1 ? 1 - draw : undefined}
    fill="none"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...rest}
  />
);

/** Filter defs: <Glow id="g" /> then filter="url(#g)". A soft light around strokes and shapes. */
export const Glow: React.FC<{ id: string; size?: number; strength?: number }> = ({ id, size = 10, strength = 1.4 }) => (
  <filter id={id} x="-50%" y="-50%" width="200%" height="200%">
    <feGaussianBlur stdDeviation={size} result="b" />
    <feComponentTransfer in="b" result="bb">
      <feFuncA type="linear" slope={strength} />
    </feComponentTransfer>
    <feMerge>
      <feMergeNode in="bb" />
      <feMergeNode in="SourceGraphic" />
    </feMerge>
  </filter>
);

/** Filter defs: a directional blur for things moving fast (x along, y across). */
export const Streak: React.FC<{ id: string; x?: number; y?: number }> = ({ id, x = 24, y = 0 }) => (
  <filter id={id} x="-30%" y="-30%" width="160%" height="160%">
    <feGaussianBlur stdDeviation={`${x} ${y}`} />
  </filter>
);

/**
 * Copies of something laid out in a row that scrolls forever: item i sits at i * gap - offset,
 * wrapping round, so growing `offset` over time is a scroll (a corridor of doors, a reel of
 * signs, pages flicking past). Coordinates are along the axis from 0; wrap it in a <g transform>.
 * Make n * gap at least the frame's length plus one gap so the row never runs out.
 */
export const Strip: React.FC<{ n: number; gap: number; offset: number; axis?: "x" | "y"; render: (i: number, pos: number) => React.ReactNode }> = ({
  n,
  gap,
  offset,
  axis = "x",
  render,
}) => {
  const span = n * gap;
  return (
    <>
      {Array.from({ length: n }, (_, i) => {
        const m = -Math.floor((i * gap - offset) / span);
        const pos = i * gap - offset + m * span - gap;
        // which copy this is along the endless row, so each one can differ (a new number, a new sign)
        const k = i + m * n - 1;
        return (
          <g key={i} transform={axis === "x" ? `translate(${pos} 0)` : `translate(0 ${pos})`}>
            {render(k, pos)}
          </g>
        );
      })}
    </>
  );
};
