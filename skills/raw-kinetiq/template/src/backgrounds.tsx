import React from "react";
import { AbsoluteFill, random } from "remotion";
import { H, HITS, Section, SectionKind, U, W, clamp01, config, energy, energyAt, lastAtOrBefore, pulse, theme, timeline } from "./data";
import { Marquee, Tunnel, tunnelTravel } from "./fx";
import { motionFor } from "./motion";
import { hexA } from "./themes";
import { AssetLayer } from "./assets";
import { layers as customLayers } from "./custom";

/*
 * Backgrounds change with the song: each kind of section gets its own scene, a repeated
 * section (verse 2, the final drop) gets a different variant than the first one, and
 * scenes crossfade at section changes. Everything reacts to the audio.
 */

export type LayerProps = { t: number; s: Section; progress: number; display: string };

// cumulative loudness, so audio-driven motion speeds up and slows down without ever jumping
const CUM: number[] = (() => {
  const out = new Array(energy.rms.length + 1).fill(0);
  for (let i = 0; i < energy.rms.length; i++) out[i + 1] = out[i] + energy.rms[i] / 60;
  return out;
})();
const loudTravel = (t: number) => CUM[Math.min(CUM.length - 1, Math.max(0, Math.round(t * 60)))];

const SEEDS = Array.from({ length: 220 }, (_, i) => ({ a: random(`a${i}`), b: random(`b${i}`), c: random(`c${i}`) }));

const specAt = (t: number): number[] => {
  const spec = (energy as { spec?: number[][] }).spec;
  if (!spec || !spec.length) return new Array(24).fill(energyAt(energy.rms, t));
  const i = Math.min(spec.length - 1, Math.max(0, Math.round(t * 60)));
  const prev = spec[Math.max(0, i - 2)];
  // a little memory so the bars fall instead of flickering
  return spec[i].map((v, k) => Math.max(v, prev[k] * 0.85));
};

/** Slow drifting colour clouds that swell with the loudness. */
const Aurora: React.FC<LayerProps> = ({ t }) => {
  const rms = energyAt(energy.rms, t);
  const R = Math.max(W, H);
  const blobs = [
    { c: theme.accent, a: 0.34, fx: 0.031, fy: 0.023, ph: 0, r: 0.55 },
    { c: theme.accent2, a: 0.2, fx: 0.019, fy: 0.037, ph: 2.1, r: 0.5 },
    { c: theme.accent, a: 0.16, fx: 0.043, fy: 0.017, ph: 4.2, r: 0.42 },
    { c: theme.text, a: 0.05, fx: 0.013, fy: 0.029, ph: 1.3, r: 0.6 },
  ];
  return (
    <AbsoluteFill>
      {blobs.map((b, i) => {
        const cx = W * (0.5 + 0.34 * Math.sin(t * b.fx * Math.PI * 2 + b.ph));
        const cy = H * (0.5 + 0.3 * Math.cos(t * b.fy * Math.PI * 2 + b.ph * 1.7));
        const r = R * b.r * (1 + 0.18 * rms);
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: cx - r,
              top: cy - r,
              width: 2 * r,
              height: 2 * r,
              background: `radial-gradient(circle, ${hexA(b.c, b.a * (0.55 + 0.7 * rms))} 0%, ${hexA(b.c, 0)} 68%)`,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

/** Dust drifting up and sideways; `rise` pulls it upward faster as a build goes on. */
const Drift: React.FC<LayerProps & { rise?: boolean }> = ({ t, progress, rise }) => {
  const travel = t * 0.6 + loudTravel(t) * 2.2 + (rise ? progress * progress * 14 : 0);
  return (
    <AbsoluteFill>
      {SEEDS.slice(0, 90).map((p, i) => {
        const speed = 0.4 + p.c;
        const x = (((p.a * W + Math.sin(t * 0.3 + i) * 40 * U) % W) + W) % W;
        const y = ((((p.b * H - travel * speed * 60 * U) % H) + H) % H);
        const size = (1.5 + p.c * 3.5) * U;
        const tw = 0.35 + 0.65 * Math.abs(Math.sin(t * (0.8 + p.c) + i));
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x,
              top: y,
              width: size,
              height: size * (rise ? 1 + progress * 6 : 1),
              borderRadius: size,
              background: i % 4 === 0 ? theme.accent : theme.text,
              opacity: tw * (i % 4 === 0 ? 0.7 : 0.35),
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

/** Warp speed: streaks flying out of the centre, faster when the track is loud. */
const Warp: React.FC<LayerProps> = ({ t }) => {
  const travel = t * 0.12 + loudTravel(t) * 0.55;
  const maxR = Math.hypot(W, H) / 2;
  const kick = pulse(HITS, t, 6);
  return (
    <AbsoluteFill>
      {SEEDS.slice(0, 150).map((p, i) => {
        const z = (p.b + travel * (0.6 + p.c * 0.8)) % 1;
        const ang = p.a * Math.PI * 2;
        const r = Math.pow(z, 2.2) * maxR * 1.1;
        const len = (6 + 140 * z * z * (1 + kick)) * U;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: W / 2 + Math.cos(ang) * r,
              top: H / 2 + Math.sin(ang) * r,
              width: len,
              height: (1 + 2.5 * z) * U,
              background: `linear-gradient(90deg, ${hexA(i % 5 === 0 ? theme.accent : theme.text, 0)}, ${i % 5 === 0 ? theme.accent : theme.text})`,
              transformOrigin: "0 50%",
              transform: `rotate(${ang}rad) translateX(${-len}px)`,
              opacity: clamp01(z * 3) * 0.75,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

/** A low, quiet strip of frequency bars along the bottom; a texture, not the main event. */
const Spectrum: React.FC<LayerProps> = ({ t }) => {
  const bands = specAt(t);
  const bars = [...[...bands].reverse(), ...bands];
  const gap = 6 * U;
  const bw = (W - gap * (bars.length + 1)) / bars.length;
  return (
    <AbsoluteFill style={{ opacity: 0.22 }}>
      {bars.map((v, i) => {
        const h = Math.pow(v, 2.4) * H * 0.1 + 2 * U;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: gap + i * (bw + gap),
              width: bw,
              height: h,
              top: H - h,
              background: `linear-gradient(0deg, ${hexA(theme.text, 0.9)}, ${hexA(theme.accent, 0)})`,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

/** Synthwave floor (and ceiling) grid racing at the camera. */
const Grid: React.FC<LayerProps & { fast?: boolean; ceiling?: boolean }> = ({ t, fast, ceiling }) => {
  const cell = 130 * U;
  const travel = (t * (fast ? 2.2 : 0.7) + loudTravel(t) * (fast ? 6 : 2)) * cell;
  const sub = energyAt(energy.drive, t);
  const plane = (flip: boolean) => (
    <div
      style={{
        position: "absolute",
        left: 0,
        width: W,
        top: flip ? 0 : H / 2,
        height: H / 2,
        overflow: "hidden",
        perspective: 380 * U,
        perspectiveOrigin: "50% 0",
        transform: flip ? "scaleY(-1)" : undefined,
        WebkitMaskImage: "linear-gradient(180deg, transparent 0%, black 45%)",
        maskImage: "linear-gradient(180deg, transparent 0%, black 45%)",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: -W,
          width: W * 3,
          bottom: 0,
          height: H * 4,
          // hinged at the near edge, tipped away from the camera so it lies flat to the horizon
          transformOrigin: "50% 100%",
          transform: "rotateX(76deg)",
          backgroundImage: `linear-gradient(${hexA(theme.accent, 0.75)} ${2.5 * U}px, transparent ${2.5 * U}px), linear-gradient(90deg, ${hexA(theme.accent, 0.55)} ${2 * U}px, transparent ${2 * U}px)`,
          backgroundSize: `${cell}px ${cell}px`,
          backgroundPosition: `${W * 1.5}px ${travel}px`,
        }}
      />
    </div>
  );
  return (
    <AbsoluteFill>
      {plane(false)}
      {ceiling && plane(true)}
      <div
        style={{
          position: "absolute",
          left: 0,
          width: W,
          top: H / 2 - 2 * U,
          height: 4 * U,
          background: theme.accent,
          boxShadow: `0 0 ${(40 + 80 * sub) * U}px ${(10 + 20 * sub) * U}px ${hexA(theme.accent, 0.5)}`,
          opacity: 0.8,
        }}
      />
    </AbsoluteFill>
  );
};

/** A shockwave out of the centre on every kick. */
const Rings: React.FC<LayerProps & { diamond?: boolean }> = ({ t, diamond }) => {
  const i = lastAtOrBefore(HITS, t);
  const maxR = Math.hypot(W, H) * 0.6;
  const rings = [];
  for (let k = i; k >= 0 && k > i - 4; k--) {
    const age = t - HITS[k];
    if (age > 0.9) break;
    const p = 1 - Math.pow(1 - age / 0.9, 3);
    const r = (0.06 + 0.94 * p) * maxR;
    rings.push(
      <div
        key={k}
        style={{
          position: "absolute",
          left: W / 2 - r,
          top: H / 2 - r,
          width: 2 * r,
          height: 2 * r,
          borderRadius: diamond ? 0 : "50%",
          transform: diamond ? "rotate(45deg)" : undefined,
          border: `${(10 * (1 - age / 0.9) + 1) * U}px solid ${k % 2 ? theme.accent : theme.text}`,
          opacity: (1 - age / 0.9) * 0.55,
          boxShadow: `0 0 ${30 * U}px ${hexA(theme.accent, 0.4)}`,
        }}
      />,
    );
  }
  return <AbsoluteFill>{rings}</AbsoluteFill>;
};

/** Torn horizontal bands on some beats, for the heaviest moments. */
const Glitch: React.FC<LayerProps> = ({ t }) => {
  const bi = lastAtOrBefore(timeline.beats, t);
  if (bi < 0) return null;
  const age = t - timeline.beats[bi];
  if (age > 0.11 || random(`g${bi}`) > 0.45) return null;
  const n = 3 + Math.floor(random(`gn${bi}`) * 4);
  return (
    <AbsoluteFill style={{ mixBlendMode: "screen" }}>
      {Array.from({ length: n }, (_, k) => (
        <div
          key={k}
          style={{
            position: "absolute",
            left: (random(`gx${bi}${k}`) - 0.5) * 200 * U,
            width: W * 1.2,
            top: random(`gy${bi}${k}`) * H,
            height: (4 + random(`gh${bi}${k}`) * 46) * U,
            background: k % 2 ? theme.accent2 : theme.accent,
            opacity: 0.35 * (1 - age / 0.11),
          }}
        />
      ))}
    </AbsoluteFill>
  );
};

const TunnelLayer: React.FC<LayerProps> = ({ t, s }) => <Tunnel t={t} section={s} travel={tunnelTravel(t, timeline.sections)} bare />;
/** Halftone dot grid; dots swell with the bass and ripple out from the centre. */
const Halftone: React.FC<LayerProps> = ({ t }) => {
  const sub = energyAt(energy.drive, t);
  const step = 46 * U;
  const cols = Math.ceil(W / step) + 1;
  const rows = Math.ceil(H / step) + 1;
  const dots = [];
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      const d = Math.hypot(x * step - W / 2, y * step - H / 2) / Math.max(W, H);
      const v = 0.5 + 0.5 * Math.sin(d * 18 - t * 2.2);
      const r = step * 0.42 * (0.15 + 0.85 * v * (0.35 + 0.65 * sub)) * (1 - d * 0.9);
      if (r > 0.6) dots.push(<circle key={`${x}-${y}`} cx={x * step} cy={y * step} r={r} />);
    }
  return (
    <svg width={W} height={H} style={{ position: "absolute", inset: 0, opacity: 0.16 }}>
      <g fill={theme.accent}>{dots}</g>
    </svg>
  );
};

/** Soft light beams from above, slowly sweeping, brighter when the song is loud. */
const Beams: React.FC<LayerProps> = ({ t }) => {
  const rms = energyAt(energy.rms, t);
  return (
    <AbsoluteFill style={{ mixBlendMode: "screen" }}>
      {[0, 1, 2, 3].map((i) => {
        const a = Math.sin(t * (0.13 + i * 0.04) + i * 1.7) * 22 + (i - 1.5) * 14;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: W * (0.2 + i * 0.2) - W * 0.06,
              top: -H * 0.2,
              width: W * 0.12,
              height: H * 1.6,
              transformOrigin: "50% 0",
              transform: `rotate(${a}deg)`,
              background: `linear-gradient(180deg, ${hexA(i % 2 ? theme.accent : theme.text, 0.1 + 0.18 * rms)} 0%, ${hexA(theme.bg, 0)} 80%)`,
              filter: `blur(${24 * U}px)`,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

/** Big out-of-focus circles of light, drifting. */
const Bokeh: React.FC<LayerProps> = ({ t }) => {
  const rms = energyAt(energy.rms, t);
  return (
    <AbsoluteFill>
      {SEEDS.slice(0, 16).map((p, i) => {
        const r = (60 + p.c * 160) * U;
        const x = (((p.a * W + t * (8 + p.b * 14) * U) % (W + 2 * r)) + W + 2 * r) % (W + 2 * r) - r;
        const y = p.b * H + Math.sin(t * 0.2 + i) * 40 * U;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x - r,
              top: y - r,
              width: 2 * r,
              height: 2 * r,
              borderRadius: "50%",
              background: `radial-gradient(circle, ${hexA(i % 3 ? theme.accent : theme.accent2, 0.16 + 0.14 * rms)} 0%, ${hexA(theme.bg, 0)} 70%)`,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

/** Diagonal stripes sliding by, faster when it is loud: a racing, graphic feel. */
const Stripes: React.FC<LayerProps> = ({ t }) => {
  const shift = (t * 40 + loudTravel(t) * 160) * U;
  const w = 90 * U;
  return (
    <AbsoluteFill
      style={{
        opacity: 0.07,
        background: `repeating-linear-gradient(-30deg, ${theme.text} 0px, ${theme.text} ${w * 0.35}px, transparent ${w * 0.35}px, transparent ${w}px)`,
        backgroundPosition: `${shift}px 0`,
      }}
    />
  );
};

const MarqueeLayer: React.FC<LayerProps> = ({ t, s, display }) => <Marquee t={t} section={s} display={display} />;

type Layer = React.FC<LayerProps>;
const L = {
  aurora: Aurora,
  drift: Drift,
  rise: ((p) => <Drift {...p} rise />) as Layer,
  warp: Warp,
  bars: Spectrum,
  grid: Grid,
  gridFast: ((p) => <Grid {...p} fast />) as Layer,
  gridBoth: ((p) => <Grid {...p} fast ceiling />) as Layer,
  rings: Rings,
  diamonds: ((p) => <Rings {...p} diamond />) as Layer,
  glitch: Glitch,
  tunnel: TunnelLayer,
  marquee: MarqueeLayer,
  halftone: Halftone,
  beams: Beams,
  bokeh: Bokeh,
  stripes: Stripes,
  // the song's own layers, written for it in src/custom
  ...customLayers,
};

// Scene families: the song's motion picks one ("scenes" in motion.ts), so a ballad gets soft
// light while a drill track gets shockwaves. Within a family, the n-th section of a kind uses
// variant n (wrapping). One main idea per scene plus at most one quiet layer: the words are the show.
type Table = Record<SectionKind, Layer[][]>;
const HARD: Table = {
  intro: [[L.aurora, L.drift]],
  verse: [[L.aurora, L.bars], [L.grid], [L.aurora, L.drift]],
  build: [[L.tunnel, L.rise]],
  drop: [[L.warp, L.rings], [L.gridBoth, L.diamonds], [L.tunnel, L.rings]],
  break: [[L.marquee], [L.marquee, L.gridFast], [L.warp, L.rings]],
  outro: [[L.aurora, L.drift]],
};
const NEON: Table = {
  intro: [[L.aurora, L.drift]],
  verse: [[L.grid], [L.aurora, L.bars], [L.grid, L.drift]],
  build: [[L.warp]],
  drop: [[L.gridBoth, L.rings], [L.warp, L.diamonds]],
  break: [[L.gridFast, L.marquee], [L.warp, L.bars]],
  outro: [[L.aurora]],
};
const SOFT: Table = {
  intro: [[L.aurora, L.drift]],
  verse: [[L.aurora, L.drift], [L.aurora]],
  build: [[L.aurora, L.rise]],
  drop: [[L.aurora, L.drift]],
  break: [[L.aurora, L.drift]],
  outro: [[L.aurora, L.drift]],
};
const MINIMAL: Table = {
  intro: [[L.drift]],
  verse: [[]],
  build: [[L.rise]],
  drop: [[L.rings]],
  break: [[L.drift]],
  outro: [[]],
};
const CALM: Table = {
  intro: [[L.aurora, L.drift]],
  verse: [[L.aurora, L.drift]],
  build: [[L.aurora, L.rise]],
  drop: [[L.aurora, L.rings]],
  break: [[L.aurora, L.marquee]],
  outro: [[L.aurora, L.drift]],
};
const CLASSIC: Table = {
  intro: [[L.tunnel]],
  verse: [[L.tunnel]],
  build: [[L.tunnel]],
  drop: [[L.tunnel]],
  break: [[L.tunnel, L.marquee]],
  outro: [[L.tunnel]],
};
const FAMILIES = { hard: HARD, neon: NEON, soft: SOFT, minimal: MINIMAL };

const layersFor = (idx: number): Layer[] => {
  const s = timeline.sections[idx];
  // a section can name its own layers in sections.json: "scene": ["aurora", "rings"]
  const byName = (names: string[]) => names.map((n) => (L as Record<string, Layer>)[n]).filter(Boolean);
  if (s.scene) return byName(s.scene);
  const bg = config.background ?? "auto";
  const scenes = motionFor(s).scenes;
  const n = timeline.sections.slice(0, idx).filter((x) => x.kind === s.kind).length;
  // the motion can list its own layers per section kind: {"verse": [["bokeh"], ["beams"]], ...}
  if (typeof scenes === "object" && bg === "auto") {
    const variants = scenes[s.kind];
    return variants?.length ? byName(variants[n % variants.length]) : [];
  }
  const table = bg === "calm" ? CALM : bg === "classic" ? CLASSIC : (FAMILIES[scenes as keyof typeof FAMILIES] ?? HARD);
  const variants = table[s.kind];
  return variants[n % variants.length];
};

const SceneSet: React.FC<{ idx: number; t: number; opacity: number; display: string }> = ({ idx, t, opacity, display }) => {
  const s = timeline.sections[idx];
  const progress = clamp01((t - s.start) / Math.max(0.1, s.end - s.start));
  return (
    <AbsoluteFill style={{ opacity }}>
      {layersFor(idx).map((Comp, i) => (
        <Comp key={i} t={t} s={s} progress={progress} display={display} />
      ))}
    </AbsoluteFill>
  );
};

const FADE = 0.7;

/** Base colour + sub-bass glow, then the current section's scene, crossfading from the last one. */
export const Backdrop: React.FC<{ t: number; display: string }> = ({ t, display }) => {
  const secs = timeline.sections;
  let idx = secs.findIndex((s) => t >= s.start && t < s.end);
  if (idx < 0) idx = secs.length - 1;
  const mix = idx > 0 ? clamp01((t - secs[idx].start) / FADE) : 1;
  const sub = energyAt(energy.drive, t);
  return (
    <AbsoluteFill style={{ backgroundColor: theme.bg, overflow: "hidden" }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at 50% 52%, ${hexA(theme.accent, 0.08 + 0.22 * sub)} 0%, ${hexA(theme.accent, 0.03 + 0.06 * sub)} 35%, ${hexA(theme.bg, 0)} 70%)`,
        }}
      />
      <AssetLayer t={t} layer="backdrop" />
      {mix < 1 && <SceneSet idx={idx - 1} t={t} opacity={1 - mix} display={display} />}
      <SceneSet idx={idx} t={t} opacity={mix} display={display} />
    </AbsoluteFill>
  );
};
