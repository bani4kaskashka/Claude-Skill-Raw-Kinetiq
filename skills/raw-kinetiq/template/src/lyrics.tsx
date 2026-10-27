import React from "react";
import { AbsoluteFill, random } from "remotion";
import { H, Line, U, W, Word, X, Y, caps, clamp01, config, easeInOut, easeOutExpo, fit, pulse, theme, timeline } from "./data";
import { hexA } from "./themes";

type P = { line: Line; t: number; display: string; chroma: number };

const SLICE_DUR = 0.2;
const clean = (s: string) => s.replace(/[,.!?;:]+$/g, "").replace(/^[-]+|[-]+$/g, "");

/** RGB split as text-shadow; `amount` in px at 1080p. */
const rgb = (amount: number) =>
  amount < 0.3 ? undefined : `${-amount * U}px 0 ${hexA(theme.accent, 0.85)}, ${amount * U}px 0 ${hexA(theme.accent2, 0.55)}`;

/**
 * The line leaves by being cut in two along a diagonal; the halves slide apart.
 * Before `line.out` the content renders whole.
 */
const SliceExit: React.FC<{ t: number; out: number; children: React.ReactNode; strength?: number; y?: number }> = ({ t, out, children, strength = 1, y = 0 }) => {
  if (t < out) return <>{children}</>;
  const p = easeOutExpo(clamp01((t - out) / SLICE_DUR));
  const fade = 1 - easeOutExpo(clamp01((t - out) / SLICE_DUR));
  // the halves leave up and down, clear of the next line coming in at the same spot
  const dx = 160 * p * strength * U;
  const dy = 120 * p * strength * U;
  const slash = 1 - clamp01((t - out) / 0.12);
  // the cut runs through the text even when it sits above or below the centre
  const c = (y / H) * 100;
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ clipPath: `polygon(0 0, 100% 0, 100% ${40 + c}%, 0 ${60 + c}%)`, transform: `translate(${-dx}px, ${-dy}px)`, opacity: fade }}>
        {children}
      </AbsoluteFill>
      <AbsoluteFill style={{ clipPath: `polygon(0 ${60 + c}%, 100% ${40 + c}%, 100% 100%, 0 100%)`, transform: `translate(${dx}px, ${dy}px)`, opacity: fade }}>
        {children}
      </AbsoluteFill>
      <div
        style={{
          position: "absolute",
          left: -W * 0.1,
          top: H / 2 + y,
          width: W * 1.2,
          height: 4 * U,
          background: theme.text,
          boxShadow: `0 0 ${24 * U}px ${theme.accent}`,
          transform: `rotate(${(-Math.atan2(0.2 * H, W) * 180) / Math.PI}deg)`,
          opacity: slash,
        }}
      />
    </AbsoluteFill>
  );
};

/**
 * Split a line into bursts of at most `max` words. Prefers breaking after punctuation and at
 * pauses in the singing, avoids lone words, and keeps the bursts about the same size.
 */
const tidy = (s: string) => s.replace(/[,.;:]+$/g, "");
const WEAK = new Set("a an the to of in on at for with and but or my your his her its our their i i'm it's is was".split(" "));

export const chunkWords = (words: Word[], max: number): Word[][] => {
  const n = words.length;
  if (n <= max) return [words];
  const avg = n / Math.ceil(n / max);
  const cost = (i: number, j: number) => {
    const size = j - i;
    let c = 0.6 * (size - avg) ** 2 + 0.8 + (size === 1 ? 1.6 : 0);
    if (j < n) {
      // a burst that ends on "the" / "a" / "to" reads like a typo, even at a pause
      if (WEAK.has(tidy(words[j - 1].text).toLowerCase())) c += 3;
      else {
        if (/[,.!?;:]$/.test(words[j - 1].text)) c -= 1.5;
        if (words[j].s - words[j - 1].e > 0.3) c -= 1.2;
      }
    }
    return c;
  };
  const best = new Array(n + 1).fill(Infinity);
  const from = new Array(n + 1).fill(0);
  best[0] = 0;
  for (let j = 1; j <= n; j++)
    for (let i = Math.max(0, j - max); i < j; i++) {
      const c = best[i] + cost(i, j);
      if (c < best[j]) [best[j], from[j]] = [c, i];
    }
  const out: Word[][] = [];
  for (let j = n; j > 0; j = from[j]) out.unshift(words.slice(from[j], j));
  return out;
};

const LEAD = 0.05;

// where verse bursts land in a wide frame, cycling: offset from centre (1920x1080 units), alignment
const VERSE_SPOTS = [
  { x: 0, y: -40, r: -1.5, align: "center" },
  { x: -1, y: -150, r: -3, align: "left" },
  { x: 1, y: 140, r: 2.5, align: "right" },
  { x: 0, y: 60, r: 1.5, align: "center" },
] as const;

/**
 * Verse and drop lines, two or three words at a time: each burst slams in on its first word,
 * the words light up as they are sung, and once it has been sung it is sliced in half just
 * before the next burst lands. One line of type, never wrapped.
 */
const ChunkLine: React.FC<P & { big?: boolean }> = ({ line, t, display, chroma, big }) => {
  const chunks = chunkWords(line.words, Math.max(1, config.chunk ?? 3));
  const wide = W >= H;
  const side = Math.max(140 * X, 56 * U);
  const beat = big ? pulse(timeline.beats, t, 10) : 0;
  return (
    <>
      {chunks.map((words, ci) => {
        const first = words[0].s - LEAD;
        const next = ci + 1 < chunks.length ? chunks[ci + 1][0].s - LEAD : null;
        // slice once the last word is done, but always clear of the next burst
        const out = next === null ? line.out : Math.min(next - 0.06, Math.max(words[words.length - 1].e + 0.1, first + 0.25));
        if (t < first || t > out + SLICE_DUR) return null;
        const text = caps(words.map((w) => tidy(w.text)).join(" "));
        // a little room for the slam overshoot
        const size = fit(big ? 230 : 160, text.length * 1.08, wide ? (big ? 0.86 : 0.72) : 0.86);
        const p = easeOutExpo(clamp01((t - first) / 0.13));
        const spot = big || !wide ? { x: 0, y: 0, r: 0, align: "center" as const } : VERSE_SPOTS[(Math.round(line.start * 10) + ci) % VERSE_SPOTS.length];
        return (
          <SliceExit key={ci} t={t} out={out} strength={big ? 1.4 : 1} y={spot.y * Y}>
            <AbsoluteFill
              style={{
                justifyContent: "center",
                alignItems: spot.align === "left" ? "flex-start" : spot.align === "right" ? "flex-end" : "center",
                padding: `0 ${side}px`,
              }}
            >
              <div
                style={{
                  fontFamily: display,
                  fontSize: size,
                  lineHeight: 1,
                  whiteSpace: "nowrap",
                  letterSpacing: "-0.012em",
                  textShadow: rgb(chroma * (big ? 1.4 : 1)),
                  transform: `translateY(${spot.y * Y}px) rotate(${spot.r}deg) scale(${(1 + (big ? 0.5 : 0.28) * (1 - p)) * (1 + 0.03 * beat)})`,
                  opacity: p,
                  filter: p < 1 ? `blur(${(1 - p) * (big ? 12 : 8) * U}px)` : undefined,
                }}
              >
                {words.map((w, i) => {
                  const sung = t >= w.s - LEAD;
                  const active = sung && t < w.e + 0.06;
                  return (
                    <React.Fragment key={i}>
                      <span style={{ color: active ? theme.accent : theme.text, opacity: sung ? 1 : 0.28 }}>{caps(tidy(w.text))}</span>
                      {i < words.length - 1 ? " " : ""}
                    </React.Fragment>
                  );
                })}
              </div>
            </AbsoluteFill>
          </SliceExit>
        );
      })}
    </>
  );
};

/** Verse: quick bursts that jump around the frame. */
export const VerseLine: React.FC<P> = (p) => <ChunkLine {...p} />;

/** Drop / chorus: centred, enormous bursts that slam in with a blur and pump on the beat. */
export const DropLine: React.FC<P> = (p) => <ChunkLine {...p} big />;

/** Single shouted words (yeah / go / faster): each one replaces the last, dead centre. */
export const ShoutLine: React.FC<P> = ({ line, t, display, chroma }) => {
  let idx = -1;
  line.words.forEach((w, i) => {
    if (t >= w.s - 0.03) idx = i;
  });
  if (idx < 0 || t > line.out + 0.2) return null;
  const w = line.words[idx];
  const text = caps(clean(w.text));
  const p = easeOutExpo(clamp01((t - (w.s - 0.03)) / 0.14));
  const fade = 1 - clamp01((t - line.out) / 0.2);
  const rot = (random(`shout${line.start}${idx}`) - 0.5) * 8;
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", opacity: fade }}>
      <div
        style={{
          fontFamily: display,
          fontSize: fit(300, text.length),
          lineHeight: 1,
          whiteSpace: "nowrap",
          color: idx % 2 ? theme.accent : theme.text,
          textShadow: rgb(chroma * 1.6),
          transform: `rotate(${rot}deg) scale(${1 + 0.6 * (1 - p)})`,
          filter: p < 1 ? `blur(${(1 - p) * 14 * U}px)` : undefined,
          opacity: p,
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
};

// Where each successive chant hit lands, cycling (offsets at 1920x1080, scaled to the frame).
const SPOTS = [
  { x: -380, y: -150, r: -8 },
  { x: 360, y: 120, r: 6 },
  { x: -120, y: 210, r: -3 },
  { x: 300, y: -200, r: 9 },
  { x: 0, y: 0, r: -5 },
  { x: -420, y: 160, r: 4 },
];

/** Chant: every chop is a hit that gets sliced in half and falls apart. */
export const ChantLine: React.FC<P> = ({ line, t, display, chroma }) => {
  const hits = line.words.map((w, i) => ({ w, i, age: t - w.s })).filter(({ age }) => age >= -0.03 && age < 0.55);
  return (
    <AbsoluteFill>
      {hits.map(({ w, i, age }) => {
        const spot = SPOTS[i % SPOTS.length];
        const text = caps(clean(w.text));
        const size = fit(330, text.length, 0.6);
        // keep the whole word (plus slam overshoot) inside the frame
        const halfW = (size * theme.charW * text.length * 1.2) / 2;
        const cx = Math.min(W - halfW - 24 * U, Math.max(halfW + 24 * U, W / 2 + spot.x * X));
        const slam = easeOutExpo(clamp01((age + 0.03) / 0.08));
        const cutAt = 0.09;
        const split = easeOutExpo(clamp01((age - cutAt) / 0.4));
        const fade = 1 - clamp01((age - 0.2) / 0.35);
        const slash = clamp01((age - cutAt + 0.02) / 0.05) * (1 - clamp01((age - cutAt - 0.06) / 0.1));
        const word = (
          <div
            style={{
              fontFamily: display,
              fontSize: size,
              lineHeight: 1,
              whiteSpace: "nowrap",
              color: i % 3 === 2 ? theme.accent : theme.text,
              textShadow: rgb(chroma * 1.5),
            }}
          >
            {text}
          </div>
        );
        const half = (clip: string, dir: number) => (
          <div style={{ position: "absolute", clipPath: clip, transform: `translate(${dir * 60 * split * U}px, ${dir * 34 * split * U}px) rotate(${dir * 4 * split}deg)` }}>
            {word}
          </div>
        );
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: cx,
              top: H / 2 + spot.y * Y * (W >= H ? 1 : 0.55),
              transform: `translate(-50%, -50%) rotate(${spot.r}deg) scale(${1 + 0.35 * (1 - slam)})`,
              opacity: fade * slam,
            }}
          >
            <div style={{ position: "relative" }}>
              <div style={{ visibility: "hidden" }}>{word}</div>
              <div style={{ position: "absolute", inset: 0 }}>
                {half("polygon(0 0, 100% 0, 100% 35%, 0 65%)", -1)}
                {half("polygon(0 65%, 100% 35%, 100% 100%, 0 100%)", 1)}
              </div>
              <div
                style={{
                  position: "absolute",
                  left: "-15%",
                  top: "50%",
                  width: "130%",
                  height: 6 * U,
                  background: theme.text,
                  boxShadow: `0 0 ${20 * U}px ${theme.accent}`,
                  transform: `rotate(-16deg) scaleX(${slash})`,
                  opacity: slash,
                }}
              />
            </div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

/**
 * Tunnel (the song's hook word): a solid word in the middle, with outlined copies of it
 * peeling off and rushing past the camera, so it reads as falling into the word.
 */
export const TunnelLine: React.FC<P> = ({ line, t, display, chroma }) => {
  if (t < line.start - 0.05 || t > line.out + 0.3) return null;
  const text = caps(clean(line.words[0]?.text ?? ""));
  // the zoom gets a shove on every repeat of the word
  const shoves = line.words.reduce((acc, w) => acc + easeInOut(clamp01((t - w.s) / 0.35)), 0);
  const z = (t - line.start) * 0.7 + shoves * 0.6;
  const enter = easeOutExpo(clamp01((t - line.start + 0.05) / 0.2));
  const exit = 1 - clamp01((t - line.out) / 0.3);
  const lastHit = Math.max(...line.words.map((w) => (t >= w.s ? w.s : -99)));
  const slam = easeOutExpo(clamp01((t - lastHit) / 0.18));
  const base = 0.62;
  const word: React.CSSProperties = {
    position: "absolute",
    left: "50%",
    top: "50%",
    fontFamily: display,
    fontSize: fit(340, text.length, 0.86 / base),
    lineHeight: 1,
    letterSpacing: "0.02em",
    whiteSpace: "nowrap",
  };
  const rings = [];
  for (let k = 5; k >= 0; k--) {
    const depth = k + (z % 1); // 0 = just leaving the centre word, larger = nearer the camera
    const scale = base * Math.pow(1.55, depth);
    const op = clamp01(depth / 0.6) * clamp01((5.2 - depth) / 2.2) * 0.85;
    rings.push(
      <div
        key={k}
        style={{
          ...word,
          transform: `translate(-50%, -50%) scale(${scale})`,
          color: "transparent",
          WebkitTextStroke: `${(2.4 * U) / scale}px ${k % 2 ? theme.accent : hexA(theme.text, 0.8)}`,
          opacity: op,
        }}
      >
        {text}
      </div>,
    );
  }
  return (
    <AbsoluteFill style={{ opacity: exit }}>
      {rings}
      <div
        style={{
          ...word,
          transform: `translate(-50%, -50%) scale(${base * (0.6 + 0.4 * enter) * (1 + 0.18 * (1 - slam))})`,
          color: theme.text,
          textShadow: rgb(chroma * 1.2),
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
};

/** Outro: letters drift apart and blur out while the last notes ring. */
export const OutroLine: React.FC<P> = ({ line, t, display }) => {
  if (t < line.start - 0.1 || t > line.out + 1.2) return null;
  const text = caps(line.words.map((w) => w.text).join(" "));
  const local = t - line.start;
  const exit = clamp01((t - line.out) / 1.2);
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <div style={{ fontFamily: display, fontSize: fit(200, text.length * 1.3), whiteSpace: "nowrap", letterSpacing: `${0.02 + local * 0.04}em` }}>
        {text.split("").map((ch, i) => {
          const p = easeOutExpo(clamp01((local - i * 0.03) / 0.5));
          return (
            <span
              key={i}
              style={{
                display: "inline-block",
                opacity: p * (1 - exit),
                filter: `blur(${((1 - p) * 12 + exit * 16) * U}px)`,
                color: ch === "." ? theme.accent : theme.text,
                transform: `translateY(${(1 - p) * 30 * U}px)`,
              }}
            >
              {ch === " " ? " " : ch}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
