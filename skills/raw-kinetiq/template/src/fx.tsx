import React from "react";
import { AbsoluteFill, random } from "remotion";
import { H, HITS, Section, U, W, clamp01, easeInOut, energy, energyAt, lastAtOrBefore, overlays, pulse, theme, timeline } from "./data";
import { hexA } from "./themes";
import { cameraFor } from "./motion";

const TUNNEL_SPEED: Record<Section["kind"], number> = {
  intro: 0.08,
  verse: 0.16,
  build: 0.32,
  drop: 0.42,
  break: 0.38,
  outro: 0.06,
};

/** Concentric squares rushing at the camera, with a sub-bass glow behind them. */
export const Tunnel: React.FC<{ t: number; section: Section; travel: number; bare?: boolean }> = ({ t, section, travel, bare }) => {
  const sub = energyAt(energy.drive, t);
  const kick = pulse(HITS, t, 7);
  const N = 16;
  const reach = Math.hypot(W, H) * 2;
  const squares = [];
  for (let k = 0; k < N; k++) {
    const z = (k / N + travel) % 1; // 0 = far, 1 = at the camera
    const size = (60 * U) / Math.pow(1.0001 - z, 1.35);
    if (size > reach) continue;
    const fadeIn = clamp01(z * 4);
    const fadeOut = clamp01((1 - z) * 3);
    const hot = k % 3 === 0;
    squares.push(
      <div
        key={k}
        style={{
          position: "absolute",
          left: W / 2 - size / 2,
          top: H / 2 - size / 2,
          width: size,
          height: size,
          border: `${Math.max(1, size / 260)}px solid ${hot ? theme.accent : theme.text}`,
          opacity: fadeIn * fadeOut * (hot ? 0.55 : 0.16) * (0.6 + 0.6 * sub),
          transform: `rotate(${k * 9 + t * 6 + (section.kind === "drop" ? kick * 4 : 0)}deg)`,
          boxShadow: hot ? `0 0 ${(18 + 30 * kick) * U}px ${hexA(theme.accent, 0.35)}` : undefined,
        }}
      />,
    );
  }
  // bare: just the squares, for layering inside a background scene
  if (bare) return <AbsoluteFill style={{ overflow: "hidden" }}>{squares}</AbsoluteFill>;
  return (
    <AbsoluteFill style={{ backgroundColor: theme.bg, overflow: "hidden" }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at 50% 52%, ${hexA(theme.accent, 0.1 + 0.32 * sub)} 0%, ${hexA(theme.accent, 0.06 + 0.1 * sub)} 32%, ${hexA(theme.bg, 0)} 70%)`,
        }}
      />
      {squares}
    </AbsoluteFill>
  );
};

/** Integral of the tunnel speed up to t, so speed changes never make the tunnel jump. */
export const tunnelTravel = (t: number, sections: Section[]) => {
  let travel = 0;
  for (const s of sections) {
    if (t <= s.start) break;
    const until = Math.min(t, s.end);
    travel += (until - s.start) * TUNNEL_SPEED[s.kind];
  }
  return travel;
};

/** Grain, scanlines and a vignette, scaled by the theme's grit. */
export const Overlay: React.FC<{ frame: number }> = ({ frame }) => (
  <AbsoluteFill style={{ pointerEvents: "none" }}>
    <svg width={W} height={H} style={{ position: "absolute", inset: 0, opacity: 0.13 * theme.grit, mixBlendMode: "overlay" }}>
      <filter id="grain">
        <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed={frame % 12} stitchTiles="stitch" />
        <feColorMatrix type="saturate" values="0" />
      </filter>
      <rect width="100%" height="100%" filter="url(#grain)" />
    </svg>
    <AbsoluteFill
      style={{
        background: "repeating-linear-gradient(to bottom, rgba(0,0,0,0) 0px, rgba(0,0,0,0) 2px, rgba(0,0,0,0.22) 3px)",
        opacity: 0.55 * theme.grit,
      }}
    />
    <AbsoluteFill style={{ background: `radial-gradient(ellipse at center, rgba(0,0,0,0) 45%, rgba(0,0,0,${0.78 * theme.grit}) 100%)` }} />
  </AbsoluteFill>
);

const pad = (n: number, w = 2) => String(Math.floor(n)).padStart(w, "0");

/** Optional tape-deck readouts in the corners; each one is switched on in config.overlays. */
export const Hud: React.FC<{ t: number; section: Section; mono: string }> = ({ t, section, mono }) => {
  const o = overlays;
  if (!o.artist && !o.section && !o.timer && !o.bpm) return null;
  const bi = lastAtOrBefore(timeline.downbeats, t);
  const barStart = bi < 0 ? 0 : timeline.downbeats[bi];
  const beatLen = 60 / timeline.bpm;
  const beatInBar = Math.min(3, Math.max(0, Math.floor((t - barStart) / beatLen)));
  const beatFlash = pulse(timeline.beats, t, 10);
  const edge = 64 * U;
  const label: React.CSSProperties = {
    position: "absolute",
    fontFamily: mono,
    fontSize: 20 * U,
    letterSpacing: "0.14em",
    color: theme.dim,
    textTransform: "uppercase",
    whiteSpace: "nowrap",
  };
  const barsIn = section.bars ? Math.floor((t - section.start) / (beatLen * 4)) + 1 : 0;
  const fadeIn = clamp01((t - 0.4) / 0.8);
  const fadeOut = clamp01((timeline.duration - t - 0.3) / 1.2);
  return (
    <AbsoluteFill style={{ opacity: fadeIn * fadeOut }}>
      {o.artist && (
        <div style={{ ...label, left: edge, top: edge * 0.8 }}>
          <span style={{ color: theme.accent }}>●</span> REC&nbsp;&nbsp;{timeline.artist}
        </div>
      )}
      {o.timer && (
        <div style={{ ...label, right: edge, top: edge * 0.8 }}>
          {pad(t / 60)}:{pad(t % 60)}.{pad((t % 1) * 100)}
        </div>
      )}
      {o.section && (
      <div style={{ ...label, left: edge, bottom: edge * 0.9, color: theme.text }}>
        <span style={{ color: theme.accent }}>▌</span>
        {section.name}
        {barsIn > 0 && (
          <span style={{ color: theme.dim }}>
            &nbsp;&nbsp;bar {pad(Math.min(section.bars!, barsIn))}/{section.bars}
          </span>
        )}
      </div>
      )}
      {o.bpm && (
      <div style={{ ...label, right: edge, bottom: edge * 0.9, display: "flex", alignItems: "center", gap: 14 * U }}>
        {Math.round(timeline.bpm)} BPM
        <span style={{ display: "flex", gap: 8 * U }}>
          {[0, 1, 2, 3].map((b) => (
            <span
              key={b}
              style={{
                width: 10 * U,
                height: 10 * U,
                background: b === beatInBar ? theme.accent : hexA(theme.text, 0.25),
                opacity: b === beatInBar ? 0.5 + 0.5 * beatFlash : 1,
              }}
            />
          ))}
        </span>
      </div>
      )}
      {o.timer && (
        <div style={{ position: "absolute", left: 0, bottom: 0, height: 3 * U, width: `${(t / timeline.duration) * 100}%`, background: theme.accent, opacity: 0.8 }} />
      )}
    </AbsoluteFill>
  );
};

/** Short flash at the top of each drop. Accent-tinted and capped, never a full-white strobe. */
export const DropFlash: React.FC<{ t: number; strength?: number }> = ({ t, strength = 1 }) => {
  const p = pulse(timeline.flashes, t, 5) * strength;
  if (p < 0.01) return null;
  return <AbsoluteFill style={{ background: hexA(theme.accent, 0.45 * p), mixBlendMode: "screen" }} />;
};

/** Instrumental sections: rows of outlined hook words scrolling in opposite directions. */
export const Marquee: React.FC<{ t: number; section: Section; display: string }> = ({ t, section, display }) => {
  const local = t - section.start;
  const len = section.end - section.start;
  // slow half-time groove, then full speed after the halfway point; "fast" sections run flat out
  const half = section.fast ? 0 : len / 2;
  const dist = (local < half ? local * 260 : half * 260 + (local - half) * 820) * U;
  const enter = clamp01(local / 0.5);
  const exit = clamp01((section.end - t) / 0.4);
  const beatI = lastAtOrBefore(timeline.beats, t);
  const beatP = pulse(timeline.beats, t, 8);
  const size = 210 * U;
  const rows = Math.ceil(H / (size * 0.9)) + 1;
  const unit = timeline.hooks.map((h) => `${h} ✕ `).join("");
  // long enough that no row ever runs out, so there is never a wrap-around jump
  const phrase = unit.repeat(Math.ceil(800 / Math.max(unit.length, 1)));
  // rightward rows start shifted left by a deliberate underestimate of the text width
  // (0.3 em per character), so their right end is always past the frame edge
  const startRight = -phrase.length * size * 0.3 + W;
  return (
    <AbsoluteFill style={{ opacity: enter * exit, overflow: "hidden" }}>
      {Array.from({ length: rows }, (_, r) => {
        const dir = r % 2 === 0 ? -1 : 1;
        const lit = local >= half && beatI >= 0 && beatI % rows === r;
        const off = dist * (0.8 + 0.15 * (r % 6));
        return (
          <div
            key={r}
            style={{
              position: "absolute",
              top: -size * 0.2 + r * size * 0.9,
              left: dir < 0 ? -off : startRight + off,
              whiteSpace: "nowrap",
              fontFamily: display,
              fontSize: size,
              lineHeight: 1,
              letterSpacing: "-0.01em",
              color: lit ? hexA(theme.accent, 0.35 + 0.65 * beatP) : "transparent",
              WebkitTextStroke: `${2 * U}px ${r % 3 === 1 ? theme.accent : hexA(theme.text, 0.45)}`,
            }}
          >
            {phrase}
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

/** Deterministic jitter for camera shake. */
export const shakeOffset = (t: number, amount: number) => {
  const step = Math.floor(t * 30);
  return {
    x: (random(`sx${step}`) - 0.5) * 2 * amount * U,
    y: (random(`sy${step}`) - 0.5) * 2 * amount * U,
    r: (random(`sr${step}`) - 0.5) * 2 * amount * 0.04,
  };
};

export type Cam = { x: number; y: number; z: number; r: number };
const STILL: Cam = { x: 0, y: 0, z: 1, r: 0 };

/** The voice's loudness over the last 0.4 s, so moves that follow it swell instead of twitch. */
const voiceSmooth = (t: number) => {
  const curve = energy.voc ?? energy.rms;
  let sum = 0;
  for (let k = 0; k < 8; k++) sum += energyAt(curve, t - k * 0.05);
  return sum / 8;
};

/** Where the camera is in one section at time t (`cameraFor` says which move). */
const shot = (s: Section, t: number): Cam => {
  const { move, amount: a } = cameraFor(s);
  if (move === "still") return STILL;
  const e = easeInOut(clamp01((t - s.start) / Math.max(1, s.end - s.start)));
  // a slow wander under every move, so the frame is never frozen
  const c: Cam = {
    x: (Math.sin(t * 0.23 + 1.3) + 0.5 * Math.sin(t * 0.51)) * 0.008 * W * a,
    y: (Math.sin(t * 0.19) + 0.5 * Math.sin(t * 0.43 + 2)) * 0.008 * H * a,
    z: 1,
    r: Math.sin(t * 0.13 + 0.7) * 0.4 * a,
  };
  if (move === "float") {
    c.x *= 1.6;
    c.y *= 1.6;
    c.r *= 1.5;
    c.z = 1.02 + 0.015 * Math.sin(t * 0.17);
  } else if (move === "push") c.z = 1 + 0.14 * a * e;
  else if (move === "pull") c.z = 1 + 0.14 * a * (1 - e);
  else if (move === "pan") c.x += (0.5 - e) * 0.07 * a * W;
  else if (move === "rise") c.y += (e - 0.5) * 0.07 * a * H;
  else if (move === "orbit") {
    c.r += (e - 0.5) * 5 * a;
    c.z = 1.03;
  } else if (move === "breathe") c.z = 1 + 0.06 * a * voiceSmooth(t);
  return c;
};

const CAM_BLEND = 1.6;

/** The camera at time t: this section's move, blended out of the last section's over 1.6 s. */
export const cameraAt = (t: number): Cam => {
  const secs = timeline.sections;
  const i = Math.max(0, secs.findIndex((s) => t >= s.start && t < s.end));
  const cur = shot(secs[i] ?? secs[secs.length - 1], t);
  const k = i > 0 ? easeInOut(clamp01((t - secs[i].start) / CAM_BLEND)) : 1;
  if (k >= 1) return cur;
  const prev = shot(secs[i - 1], t);
  return { x: prev.x + (cur.x - prev.x) * k, y: prev.y + (cur.y - prev.y) * k, z: prev.z + (cur.z - prev.z) * k, r: prev.r + (cur.r - prev.r) * k };
};

/** CSS for the background (the full move, scaled up just enough to keep the frame covered). */
export const camBack = (c: Cam) => {
  const rad = (Math.abs(c.r) * Math.PI) / 180;
  const cover = Math.cos(rad) + (Math.max(W, H) / Math.min(W, H)) * Math.sin(rad) + 2 * Math.max(Math.abs(c.x) / W, Math.abs(c.y) / H);
  return `translate(${c.x}px, ${c.y}px) rotate(${c.r}deg) scale(${Math.max(1, cover) * c.z})`;
};

/** CSS for the lyrics: about a third of the move, so they float in front of the scene. */
export const camFront = (c: Cam) => `translate(${0.35 * c.x}px, ${0.35 * c.y}px) rotate(${0.35 * c.r}deg) scale(${1 + 0.35 * (c.z - 1)})`;
