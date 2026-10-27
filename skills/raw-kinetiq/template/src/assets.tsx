import React from "react";
import { AbsoluteFill, Img, random, staticFile } from "remotion";
import { Asset, H, U, W, clamp01, config, easeOutExpo, energy, energyAt, lastAtOrBefore, pulse, theme, timeline } from "./data";
import { hexA } from "./themes";

/*
 * The user's own images (config.json "assets"), placed where the song needs them. Files live in
 * public/ (scripts/assets.py copies them in and cuts out subjects). Every asset can be limited to
 * sections ("sections": ["Chorus 1"]), kinds ("kinds": ["drop"]) or times ("at": [[12, 30]]).
 *
 *   backdrop  full-frame photo behind everything; "dim" 0..1, "blur" px, "zoom" in|out|none,
 *             "mono" true (black and white), "tint" a colour washed over it, "react" bass|none
 *   cutout    transparent PNG (a person, an object); "place" left|right|center|bottom, "size" 0..1
 *             of the frame height, "react" kick|float|none, "glow" true, "front" true (over the lyrics)
 *   poster    framed picture (cover art, a photo) that floats; "place", "size", "tilt" degrees
 *   flash     cut in full-frame for a split second on "on": downbeats|kicks|sections, "every" n,
 *             "hold" seconds
 *   texture   full-frame overlay; "blend" (overlay, screen, multiply, ...), "opacity"
 */

const ASSETS: Asset[] = config.assets ?? [];

type Opt = Record<string, unknown>;
const num = (a: Opt, k: string, d: number) => (typeof a[k] === "number" ? (a[k] as number) : d);
const str = (a: Opt, k: string, d: string) => (typeof a[k] === "string" ? (a[k] as string) : d);
const color = (c: string) => (c === "accent" ? theme.accent : c === "accent2" ? theme.accent2 : c === "text" ? theme.text : c === "bg" ? theme.bg : c);

/** The time windows an asset is on screen. */
const windows = (a: Asset): [number, number][] => {
  const out: [number, number][] = [];
  for (const s of timeline.sections) if (a.sections?.includes(s.name) || a.kinds?.includes(s.kind)) out.push([s.start, s.end]);
  for (const w of a.at ?? []) out.push(w);
  return out.length || a.sections || a.kinds || a.at ? out : [[0, timeline.duration]];
};
const WINDOWS = ASSETS.map(windows);

/** 0..1 presence with soft edges, or -1 when off screen. */
const presence = (i: number, t: number, fade: number) => {
  let best = -1;
  for (const [s, e] of WINDOWS[i]) {
    if (t < s - 0.01 || t > e + fade) continue;
    best = Math.max(best, clamp01((t - s) / fade) * (1 - clamp01((t - e) / fade)));
  }
  return best;
};

const placeStyle = (place: string, h: number, w: number): React.CSSProperties => {
  const pad = 60 * U;
  switch (place) {
    case "left":
      return { left: pad, bottom: 0, height: h, width: w };
    case "right":
      return { right: pad, bottom: 0, height: h, width: w };
    case "bottom":
      return { left: (W - w) / 2, bottom: 0, height: h, width: w };
    default:
      return { left: (W - w) / 2, top: (H - h) / 2, height: h, width: w };
  }
};

const Backdrop: React.FC<{ a: Asset; t: number; on: number }> = ({ a, t, on }) => {
  const sub = energyAt(energy.sub, t);
  const zoom = str(a, "zoom", "in");
  const [s, e] = WINDOWS[ASSETS.indexOf(a)].find(([s0, e0]) => t >= s0 - 0.01 && t <= e0 + 1) ?? [0, timeline.duration];
  const k = clamp01((t - s) / Math.max(1, e - s));
  const ken = zoom === "in" ? 1.04 + 0.12 * k : zoom === "out" ? 1.16 - 0.12 * k : 1.04;
  const breathe = str(a, "react", "bass") === "bass" ? 1 + 0.025 * sub : 1;
  const drift = random(`pan${a.file}`) > 0.5 ? 1 : -1;
  const filters = [a.mono ? "grayscale(1)" : "", num(a, "blur", 0) ? `blur(${num(a, "blur", 0) * U}px)` : "", str(a, "filter", "")].filter(Boolean).join(" ");
  return (
    <AbsoluteFill style={{ opacity: on * num(a, "opacity", 1), overflow: "hidden" }}>
      <Img
        src={staticFile(a.file)}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform: `scale(${ken * breathe}) translateX(${drift * (k - 0.5) * 2.5}%)`,
          filter: filters || undefined,
        }}
      />
      {typeof a.tint === "string" && <AbsoluteFill style={{ background: color(a.tint), mixBlendMode: "color", opacity: 0.85 }} />}
      <AbsoluteFill style={{ background: hexA(theme.bg, num(a, "dim", 0.55)) }} />
    </AbsoluteFill>
  );
};

const Cutout: React.FC<{ a: Asset; t: number; on: number; framed?: boolean }> = ({ a, t, on, framed }) => {
  const react = str(a, "react", framed ? "float" : "kick");
  const kick = react === "kick" ? pulse(timeline.kicks, t, 8) : 0;
  const float = react === "float" || framed ? Math.sin(t * 0.8 + random(a.file) * 6) * 12 * U : 0;
  const h = H * num(a, "size", framed ? 0.55 : 0.82);
  const w = framed ? h * num(a, "aspect", 1) : W * 0.6;
  const place = str(a, "place", framed ? "center" : "right");
  const enter = easeOutExpo(on);
  const tilt = num(a, "tilt", framed ? -3 : 0) + (framed ? Math.sin(t * 0.5) * 1.2 : 0);
  const glow = a.glow ? `drop-shadow(0 0 ${30 * U}px ${hexA(theme.accent, 0.7)})` : `drop-shadow(0 ${20 * U}px ${40 * U}px rgba(0,0,0,0.55))`;
  return (
    <div
      style={{
        position: "absolute",
        ...placeStyle(place, h, w),
        display: "flex",
        justifyContent: place === "left" ? "flex-start" : place === "right" ? "flex-end" : "center",
        alignItems: framed ? "center" : "flex-end",
        transformOrigin: "50% 100%",
        transform: `translateY(${(1 - enter) * 80 * U + float}px) rotate(${tilt}deg) scale(${1 + 0.05 * kick})`,
        opacity: on * num(a, "opacity", 1),
      }}
    >
      <Img
        data-check="asset"
        data-text={a.file}
        src={staticFile(a.file)}
        style={{
          // as tall as asked, unless that would be too wide
          height: "100%",
          width: "auto",
          maxWidth: "100%",
          objectFit: "contain",
          filter: [a.mono ? "grayscale(1)" : "", glow].filter(Boolean).join(" "),
          ...(framed ? { border: `${10 * U}px solid ${theme.text}`, boxShadow: `0 ${24 * U}px ${60 * U}px rgba(0,0,0,0.6)` } : {}),
        }}
      />
    </div>
  );
};

const Flash: React.FC<{ a: Asset; t: number; i: number }> = ({ a, t, i }) => {
  if (presence(i, t, 0.01) < 0) return null;
  const on = str(a, "on", "downbeats");
  const hits = on === "kicks" ? timeline.kicks : on === "sections" ? timeline.sections.map((s) => s.start) : timeline.downbeats;
  const j = lastAtOrBefore(hits, t);
  if (j < 0 || j % Math.max(1, num(a, "every", 4)) !== 0) return null;
  const age = t - hits[j];
  const hold = num(a, "hold", 0.12);
  if (age > hold + 0.08 || presence(i, hits[j], 0.01) < 0) return null;
  return (
    <AbsoluteFill style={{ opacity: (1 - clamp01((age - hold) / 0.08)) * num(a, "opacity", 0.9), mixBlendMode: str(a, "blend", "normal") as React.CSSProperties["mixBlendMode"] }}>
      <Img src={staticFile(a.file)} style={{ width: "100%", height: "100%", objectFit: "cover", filter: a.mono ? "grayscale(1) contrast(1.4)" : "contrast(1.2)" }} />
    </AbsoluteFill>
  );
};

const Texture: React.FC<{ a: Asset; t: number; on: number }> = ({ a, t, on }) => (
  <AbsoluteFill style={{ opacity: on * num(a, "opacity", 0.25), mixBlendMode: str(a, "blend", "overlay") as React.CSSProperties["mixBlendMode"], overflow: "hidden" }}>
    <Img src={staticFile(a.file)} style={{ width: "110%", height: "110%", objectFit: "cover", transform: `translate(${-((t * 7) % 5)}%, ${-((t * 3) % 5)}%)` }} />
  </AbsoluteFill>
);

/**
 * One layer of the user's assets: "backdrop" (behind the scenes), "back" (cutouts, posters,
 * flashes behind the lyrics), "front" (anything marked "front": true, and textures).
 */
export const AssetLayer: React.FC<{ t: number; layer: "backdrop" | "back" | "front" }> = ({ t, layer }) => (
  <>
    {ASSETS.map((a, i) => {
      const front = a.front === true || a.as === "texture";
      if (layer === "backdrop" ? a.as !== "backdrop" : a.as === "backdrop" || front !== (layer === "front")) return null;
      if (a.as === "flash") return <Flash key={i} a={a} t={t} i={i} />;
      const on = presence(i, t, num(a, "fade", 0.6));
      if (on <= 0) return null;
      if (a.as === "backdrop") return <Backdrop key={i} a={a} t={t} on={on} />;
      if (a.as === "texture") return <Texture key={i} a={a} t={t} on={on} />;
      return <Cutout key={i} a={a} t={t} on={on} framed={a.as === "poster"} />;
    })}
  </>
);
