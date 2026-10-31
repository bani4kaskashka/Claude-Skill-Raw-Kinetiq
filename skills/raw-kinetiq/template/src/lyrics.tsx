import React from "react";
import { AbsoluteFill, random } from "remotion";
import { H, Line, TS, U, W, Word, X, Y, caps, clamp01, easeInOut, easeOutExpo, fit, pulse, sectionAt, theme, timeline } from "./data";
import { family, textWidth } from "./fonts";
import { Exit, Part, motionFor } from "./motion";
import { hexA } from "./themes";
import * as custom from "./custom";

/**
 * A way for words to arrive and/or leave, written for one song (custom/index.tsx, "effects").
 * Use its name as a motion part's "enter" and/or "exit".
 */
export type FxWord = {
  /** the word as shown (case applied) */
  text: string;
  /** its timing: w.s = sung at, w.e = done */
  w: Word;
  t: number;
  /** seconds since it was sung (negative before) */
  since: number;
  sung: boolean;
  /** 0 while the burst is on screen, 0..1 while it leaves */
  e: number;
  /** stable per word, for random() */
  seed: string;
  /** colour right now (the highlight while it is sung) */
  color: string;
  /** colour/outline styling to spread onto the text */
  ink: React.CSSProperties;
};
export type FxBurst = {
  t: number;
  /** 0..1 through the enter (over enterDur) */
  p: number;
  /** 0..1 through the exit (over exitDur) */
  e: number;
  /** the burst's text and font size in px */
  text: string;
  size: number;
  seed: string;
  kind: "verse" | "drop";
  /** when it arrives, when it starts to leave */
  first: number;
  out: number;
};
export type FxStyle = {
  /** appended to the burst's transform, e.g. " scale(1.2)" */
  transform?: string;
  opacity?: number;
  /** px at 1080p */
  blur?: number;
  clip?: string;
  filter?: string;
  /** drawn over the burst's text box (cracks, a strike, frost); position it absolutely */
  over?: React.ReactNode;
};
export type Effect = {
  /** each word: return the word's element (it can split into letters) */
  word?: (f: FxWord) => React.ReactNode;
  /** the whole burst while it arrives and leaves */
  burst?: (f: FxBurst) => FxStyle;
  /** seconds the enter takes (default 0.3) */
  enterDur?: number;
  /** seconds the exit takes (default 0.5) */
  exitDur?: number;
  /** the exit may play on while the next burst arrives (like "drift"); default: it finishes first */
  overlap?: boolean;
};
// read at render time (custom/ may import from this file); older projects have no "effects" export
const fxOf = (name: string): Effect | undefined => ((custom as { effects?: Record<string, Effect> }).effects ?? {})[name];

export type LineProps = { line: Line; t: number; display: string; chroma: number };
type P = LineProps;

const SLICE_DUR = 0.2;
const clean = (s: string) => s.replace(/[,.!?;:]+$/g, "").replace(/^[-]+|[-]+$/g, "");

/** RGB split as text-shadow; `amount` in px at 1080p. */
const rgb = (amount: number) =>
  amount < 0.3 ? undefined : `${-amount * U}px 0 ${hexA(theme.accent, 0.85)}, ${amount * U}px 0 ${hexA(theme.accent2, 0.55)}`;

/** "text" / "accent" / "accent2" from the live palette, or any CSS colour as given. */
export const colorOf = (c: string | undefined, fallback = theme.text) =>
  c === undefined ? fallback : c === "text" ? theme.text : c === "accent" ? theme.accent : c === "accent2" ? theme.accent2 : c;

const applyCase = (s: string, c: Part["case"]) => (c === "upper" ? s.toUpperCase() : c === "lower" ? s.toLowerCase() : c === "as-is" ? s : caps(s));

/** Marks text for the self-check (check.mjs): what it says and whether it has settled in place. */
export const checkTag = (text: string, settled: boolean) => ({ "data-check": "lyric", "data-state": settled ? "settled" : "moving", "data-text": text });

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

/** When the next line's first word is sung (Infinity for the last line). */
const nextStart = (line: Line) => {
  const n = timeline.lines.find((l) => l.start > line.start && l.words.length);
  return n ? n.words[0].s - LEAD : Infinity;
};

// where "jump" bursts land in a wide frame, cycling: offset from centre (1920x1080 units), alignment
const JUMP_SPOTS = [
  { y: -40, r: -1.5, align: "center" },
  { y: -150, r: -3, align: "left" },
  { y: 140, r: 2.5, align: "right" },
  { y: 60, r: 1.5, align: "center" },
] as const;

const EXIT_DUR: Record<Exit, number> = {
  slash: SLICE_DUR,
  cut: 0,
  fade: 0.3,
  blur: 0.35,
  fall: 0.55,
  push: 0.2,
  zoom: 0.3,
  sink: 0.3,
  scatter: 0.45,
  glitch: 0.22,
  wipe: 0.25,
  drift: 1.4,
};
// exits slow enough that they must be done before the next burst lands in the same spot
const SLOW_EXIT = new Set<Exit>(["fade", "blur", "fall", "zoom", "sink", "scatter", "wipe", "drift"]);
// enters that animate the whole burst at once (the rest animate each word as it is sung)
const ENTER_DUR: Partial<Record<Part["enter"], number>> = { slam: 0.13, fade: 0.35, zoom: 0.3, glitch: 0.22, wipe: 0.13 };

const easeOutBack = (p: number) => 1 + 2.7 * Math.pow(p - 1, 3) + 1.7 * Math.pow(p - 1, 2);
const easeOutBounce = (p: number) => {
  const n = 7.5625;
  const d = 2.75;
  if (p < 1 / d) return n * p * p;
  if (p < 2 / d) return n * (p -= 1.5 / d) * p + 0.75;
  if (p < 2.5 / d) return n * (p -= 2.25 / d) * p + 0.9375;
  return n * (p -= 2.625 / d) * p + 0.984375;
};

/** Letters of one word, each moved by `fn(i, seed)` -> CSS. */
const Letters: React.FC<{ text: string; seed: string; fn: (i: number, r1: number, r2: number) => React.CSSProperties; color: string }> = ({ text, seed, fn, color }) => (
  <span style={{ display: "inline-block", color }}>
    {[...text].map((ch, i) => (
      <span key={i} style={{ display: "inline-block", whiteSpace: "pre", ...fn(i, random(`${seed}a${i}`), random(`${seed}b${i}`)) }}>
        {ch}
      </span>
    ))}
  </span>
);

/** One word, animated in by `enter` as it is sung, and broken apart by letter exits ("fall", "scatter"). */
const BurstWord: React.FC<{ w: Word; t: number; part: Part; e: number; seed: string }> = ({ w, t, part, e, seed }) => {
  const text = applyCase(tidy(w.text), part.case);
  const sung = t >= w.s - LEAD;
  const base = colorOf(part.color);
  const singing = sung && t < w.e + 0.06;
  const color = singing ? colorOf(part.highlight, base) : base;
  // outlined words fill in once they are sung
  const ink: React.CSSProperties = part.stroke
    ? { color: sung ? color : "transparent", WebkitTextStroke: `${Math.max(1.5, 2.2 * U)}px ${base}` }
    : { color };
  const since = t - (w.s - LEAD);
  // this song's own effects
  const fxOut = fxOf(part.exit);
  if (e > 0 && fxOut?.word) return <>{fxOut.word({ text, w, t, since, sung, e, seed, color, ink })}</>;
  const fxIn = fxOf(part.enter);
  if (fxIn?.word) return <>{fxIn.word({ text, w, t, since, sung, e: fxIn === fxOut ? e : 0, seed, color, ink })}</>;
  if (e > 0 && part.exit === "fall")
    return (
      <Letters
        text={text}
        seed={seed}
        color={base}
        fn={(i, r1, r2) => {
          const k = clamp01(e * 1.6 - r1 * 0.6);
          return { transform: `translateY(${k * k * 520 * U}px) rotate(${(r2 - 0.5) * 140 * k}deg)`, opacity: 1 - k };
        }}
      />
    );
  if (e > 0 && part.exit === "scatter")
    return (
      <Letters
        text={text}
        seed={seed}
        color={base}
        fn={(i, r1, r2) => {
          const k = easeOutExpo(clamp01(e * 1.3 - r1 * 0.3));
          const a = r2 * Math.PI * 2;
          return { transform: `translate(${Math.cos(a) * 420 * k * U}px, ${Math.sin(a) * 300 * k * U}px) rotate(${(r1 - 0.5) * 300 * k}deg)`, opacity: 1 - k, filter: `blur(${k * 6 * U}px)` };
        }}
      />
    );
  switch (part.enter) {
    case "rise": {
      const q = easeOutExpo(clamp01(since / 0.16));
      return (
        <span style={{ display: "inline-block", overflow: "hidden", verticalAlign: "top", padding: "0.06em 0.02em 0.02em", margin: "-0.06em 0 0" }}>
          <span style={{ display: "inline-block", transform: `translateY(${(1 - q) * 110}%)`, ...ink }}>{text}</span>
        </span>
      );
    }
    case "pop": {
      const q = clamp01(since / 0.22);
      return (
        <span style={{ display: "inline-block", transformOrigin: "50% 80%", transform: `scale(${sung ? easeOutBack(q) : 0})`, opacity: clamp01(q * 3), ...ink }}>
          {text}
        </span>
      );
    }
    case "drop": {
      const q = clamp01(since / 0.32);
      return <span style={{ display: "inline-block", transform: `translateY(${-(1 - easeOutBounce(q)) * 0.9}em)`, opacity: clamp01(q * 4), ...ink }}>{text}</span>;
    }
    case "flip": {
      const q = easeOutBack(clamp01(since / 0.28));
      return (
        <span style={{ display: "inline-block", transformOrigin: "50% 100%", transform: `perspective(600px) rotateX(${sung ? (1 - q) * 95 : 95}deg)`, opacity: sung ? clamp01(since / 0.08) : 0, ...ink }}>
          {text}
        </span>
      );
    }
    case "stretch": {
      const q = clamp01(since / 0.3);
      return (
        <span style={{ display: "inline-block", transformOrigin: "50% 100%", transform: `scaleY(${sung ? easeOutBack(q) : 0}) scaleX(${sung ? 1 + 0.25 * (1 - easeOutExpo(q)) : 1})`, ...ink }}>
          {text}
        </span>
      );
    }
    case "scatter": {
      const q = easeOutExpo(clamp01(since / 0.35));
      return (
        <Letters
          text={text}
          seed={seed}
          color={ink.color as string}
          fn={(i, r1, r2) => {
            const a = r2 * Math.PI * 2;
            const k = sung ? 1 - q : 1;
            return { transform: `translate(${Math.cos(a) * 380 * k * U}px, ${Math.sin(a) * 260 * k * U}px) rotate(${(r1 - 0.5) * 200 * k}deg)`, opacity: sung ? clamp01(q * 2) : 0 };
          }}
        />
      );
    }
    case "breathe": {
      const q = clamp01(since / 0.6);
      const k = 1 - easeOutExpo(q);
      return (
        <span
          style={{
            display: "inline-block",
            opacity: sung ? Math.min(1, q * 2.2) : 0,
            filter: k > 0.02 ? `blur(${k * 9 * U}px)` : undefined,
            letterSpacing: `${0.22 * k}em`,
            transform: `translateY(${k * 0.12}em)`,
            ...ink,
          }}
        >
          {text}
        </span>
      );
    }
    case "type": {
      const span = Math.max(0.08, (w.e - w.s) * 0.8);
      const n = sung ? Math.ceil(text.length * clamp01((since - LEAD) / span + 0.01)) : 0;
      return (
        <span style={ink}>
          {text.slice(0, n)}
          <span style={{ visibility: "hidden" }}>{text.slice(n)}</span>
        </span>
      );
    }
    default:
      // whole-burst enters (slam, fade, zoom, glitch, wipe): words just brighten as they are sung
      return <span style={{ ...ink, opacity: sung || part.stroke ? 1 : part.enter === "fade" ? 0.4 : 0.28 }}>{text}</span>;
  }
};

/**
 * Verse and drop lines, in bursts of `part.burst` words (0 = the whole line). How a burst comes
 * in, leaves, where it sits and how it looks all come from the motion (motion.ts), mixed per song.
 */
const BurstLine: React.FC<P & { kind: "verse" | "drop" }> = ({ line, t, chroma, kind }) => {
  const motion = motionFor(sectionAt(line.start));
  const part = motion[kind];
  const role = part.font ?? "display";
  const font = family(role);
  const tracking = part.tracking ?? -0.012;
  const whole = part.burst <= 0;
  const chunks = whole ? [line.words] : chunkWords(line.words, part.burst);
  const wide = W >= H;
  const side = Math.max(140 * X, 56 * U);
  const maxW = W - 2 * side;
  const beat = kind === "drop" && motion.energy > 0.6 ? pulse(timeline.beats, t, 10) * motion.energy : 0;
  const fxIn = fxOf(part.enter);
  const fxOut = fxOf(part.exit);
  const dur = (EXIT_DUR as Record<string, number>)[part.exit] ?? fxOut?.exitDur ?? 0.5;
  const slowExit = SLOW_EXIT.has(part.exit as Exit) || (!!fxOut && dur > 0);
  // the next line's first word: a slow exit has to be gone before it lands too
  const after = timeline.lines.find((l) => l.start > line.start && (l.mode === "verse" || l.mode === "drop"));
  const nextLine = after?.words[0] ? after.words[0].s - LEAD : Infinity;
  return (
    <>
      {chunks.map((words, ci) => {
        const first = words[0].s - LEAD;
        const lastE = words[words.length - 1].e;
        const next = ci + 1 < chunks.length ? chunks[ci + 1][0].s - LEAD : null;
        // leave once the last word is done, but clear of the next burst ("cut" leaves exactly as it lands)
        // slow exits finish before the next burst lands in the same spot
        const clear = part.exit === "drift" || fxOut?.overlap ? dur * 0.4 : slowExit ? dur * 0.85 : 0.06;
        const out =
          next === null
            ? Math.max(first + 0.12, Math.min(line.out, nextLine - (slowExit ? clear : 0)))
            : part.exit === "cut"
              ? next
              : Math.max(first + 0.12, Math.min(next - clear, Math.max(lastE + 0.1, first + 0.25)));
        if (t < first - 0.02 || t > out + dur) return null;
        const e = dur > 0 ? clamp01((t - out) / dur) : t >= out ? 1 : 0;
        if (e >= 1) return null;
        const seed = `${line.start}-${ci}`;
        const texts = words.map((w) => applyCase(tidy(w.text), part.case));
        const text = texts.join(" ");

        // size, measured with the real font so it always fits
        let size: number;
        let rows = 1;
        if (part.layout === "stack") {
          const longest = texts.reduce((a, b) => (textWidth(b, role, tracking) > textWidth(a, role, tracking) ? b : a), "");
          size = Math.min(150 * U * TS * part.size, (maxW * 0.9) / textWidth(longest, role, tracking), (H * 0.74) / (texts.length * 1.0));
        } else if (whole) {
          const longest = texts.reduce((a, b) => (textWidth(b, role, tracking) > textWidth(a, role, tracking) ? b : a), "");
          size = Math.min(118 * U * TS * part.size, (maxW * 0.95) / textWidth(longest, role, tracking));
          const total = textWidth(text, role, tracking);
          // keep the wrapped block inside ~62% of the height
          size = Math.min(size, Math.sqrt((H * 0.62 * maxW * 0.9) / (total * 1.08)));
          rows = Math.ceil((total * size) / (maxW * 0.9));
        } else {
          const share = part.layout === "scatter" ? 0.56 : part.layout === "jump" && wide ? 0.72 : 0.86;
          const cap = part.layout === "low" || part.layout === "high" ? 0.62 : 1;
          size = fit(160 * part.size * cap, text, share, role, tracking);
        }
        const blockW = part.layout === "stack" ? 0 : Math.min(maxW, textWidth(text, role, tracking) * size);
        const blockH = size * (part.layout === "stack" ? texts.length : rows) * 1.06;

        // where it sits
        let x = 0;
        let y = 0;
        let r = 0;
        let align: "left" | "center" | "right" = "center";
        if (part.layout === "jump" && wide) {
          const s = JUMP_SPOTS[(Math.round(line.start * 10) + ci) % JUMP_SPOTS.length];
          y = s.y * Y;
          r = s.r;
          align = s.align;
        } else if (part.layout === "left" || part.layout === "stack") align = "left";
        else if (part.layout === "right") align = "right";
        else if (part.layout === "high") y = -Math.min(H * 0.27, H / 2 - blockH / 2 - 60 * U);
        else if (part.layout === "low") y = Math.min(H * 0.27, H / 2 - blockH / 2 - 60 * U);
        else if (part.layout === "scatter") {
          const r1 = random(`sx${seed}`);
          const r2 = random(`sy${seed}`);
          const roomX = Math.max(0, (maxW - blockW) / 2);
          const roomY = Math.max(0, (H - blockH) / 2 - 90 * U);
          x = (r1 * 2 - 1) * roomX;
          y = (r2 * 2 - 1) * roomY;
          r = (random(`sr${seed}`) - 0.5) * 8;
        } else if (part.layout === "drift") {
          x = Math.cos(t * 0.45 + ci * 2) * 30 * U;
          y = Math.sin(t * 0.6 + ci * 2) * 24 * U;
          r = Math.sin(t * 0.3 + ci) * 1.2;
        }

        // whole-burst enter
        const ed = (ENTER_DUR as Record<string, number>)[part.enter] ?? fxIn?.enterDur ?? (fxIn ? 0.3 : 0.13);
        const p = easeOutExpo(clamp01((t - first) / ed));
        let enterT = "";
        let enterOp = 1;
        let enterBlur = 0;
        let clip: string | undefined;
        if (part.enter === "slam") {
          enterT = ` scale(${1 + (kind === "drop" ? 0.5 : 0.28) * (1 - p)})`;
          enterOp = p;
          enterBlur = (1 - p) * (kind === "drop" ? 12 : 8);
        } else if (part.enter === "fade") {
          enterOp = p;
          enterBlur = (1 - p) * 10;
        } else if (part.enter === "zoom") {
          enterT = ` scale(${0.25 + 0.75 * p})`;
          enterOp = clamp01(p * 2);
          enterBlur = (1 - p) * 6;
        } else if (part.enter === "glitch" && p < 1) {
          const k = Math.floor(t * 40);
          enterT = ` translateX(${(random(`gx${seed}${k}`) - 0.5) * 60 * U * (1 - p)}px) skewX(${(random(`gs${seed}${k}`) - 0.5) * 30 * (1 - p)}deg)`;
          enterOp = random(`go${seed}${k}`) > 0.25 * (1 - p) ? 1 : 0.2;
        } else if (part.enter === "wipe") {
          // follows the singing across the burst
          const q = clamp01((t - first) / Math.max(0.2, lastE - first));
          clip = `inset(-30% ${(1 - easeOutExpo(q)) * 100}% -30% -5%)`;
        }

        // whole-burst exit
        let exitT = "";
        let exitOp = 1;
        let exitBlur = 0;
        let sink = 0;
        if (e > 0) {
          if (part.exit === "fade") {
            exitT = ` translateY(${-30 * U * e}px)`;
            exitOp = 1 - e;
          } else if (part.exit === "blur") {
            exitT = ` scale(${1 + 0.06 * e})`;
            exitOp = 1 - e;
            exitBlur = 16 * e;
          } else if (part.exit === "push") {
            exitT = ` translateX(${-W * 0.6 * Math.pow(e, 1.5)}px)`;
            exitOp = 1 - clamp01(e * 1.4);
          } else if (part.exit === "zoom") {
            exitT = ` scale(${1 + 2.6 * e * e})`;
            exitOp = 1 - e;
            exitBlur = 10 * e;
          } else if (part.exit === "sink") sink = easeInOut(e);
          else if (part.exit === "glitch") {
            const k = Math.floor(t * 40);
            exitT = ` translateX(${(random(`hx${seed}${k}`) - 0.5) * 90 * U * e}px)`;
            exitOp = random(`ho${seed}${k}`) > e ? 1 - e * 0.5 : 0;
          } else if (part.exit === "wipe") clip = `inset(-30% -5% -30% ${easeInOut(e) * 105}%)`;
          else if (part.exit === "drift") {
            // quick to lift clear of the next burst, then a slow fade as it floats on
            exitT = ` translateY(${-size * 1.7 * (1 - Math.pow(1 - e, 2))}px) scale(${1 + 0.05 * e})`;
            exitOp = Math.pow(1 - e, 2.2);
            exitBlur = 7 * e;
          }
        }
        // this song's own effects on the whole burst
        let over: React.ReactNode = null;
        const applyFx = (fx: Effect, pp: number, ee: number) => {
          const r = fx.burst?.({ t, p: pp, e: ee, text, size, seed, kind, first, out });
          if (!r) return;
          if (r.transform) enterT += r.transform;
          if (r.opacity !== undefined) enterOp *= r.opacity;
          if (r.blur) enterBlur += r.blur;
          if (r.clip) clip = r.clip;
          if (r.filter) fxFilter = `${fxFilter} ${r.filter}`;
          if (r.over) over = r.over;
        };
        let fxFilter = "";
        if (fxIn && fxIn === fxOut) applyFx(fxIn, p, e);
        else {
          if (fxIn) applyFx(fxIn, p, 0);
          if (fxOut && e > 0) applyFx(fxOut, 1, e);
        }
        const blur = enterBlur + exitBlur;
        const settled = p > 0.97 && t < out && (part.enter !== "wipe" || t > lastE);
        const skew = part.skew ? ` skewX(${part.skew}deg)` : "";
        const body =
          part.layout === "stack"
            ? words.map((w, i) => (
                <div key={i}>
                  <BurstWord w={w} t={t} part={part} e={part.exit === "fall" || part.exit === "scatter" || fxOut ? e : 0} seed={`${seed}-${i}`} />
                </div>
              ))
            : words.map((w, i) => (
                <React.Fragment key={i}>
                  <BurstWord w={w} t={t} part={part} e={part.exit === "fall" || part.exit === "scatter" || fxOut ? e : 0} seed={`${seed}-${i}`} />
                  {i < words.length - 1 ? " " : ""}
                </React.Fragment>
              ));
        const textDiv = (
          <div
            {...checkTag(text, settled)}
            style={{
              fontFamily: font,
              fontSize: size,
              color: colorOf(part.color),
              lineHeight: whole || part.layout === "stack" ? 1.04 : 1,
              whiteSpace: whole ? "normal" : "nowrap",
              textAlign: align,
              maxWidth: maxW,
              letterSpacing: part.enter === "fade" ? `${tracking + 0.05 * (1 - p)}em` : part.exit === "drift" && e > 0 ? `${tracking + 0.12 * e}em` : `${tracking}em`,
              textShadow: part.stroke ? undefined : rgb(chroma * (kind === "drop" ? 1.4 : 1)),
              transform: `translate(${x}px, ${(part.exit === "sink" ? 0 : y) + sink * size * 1.1}px) rotate(${r}deg)${skew}${enterT}${exitT} scale(${1 + 0.03 * beat})`,
              opacity: enterOp * exitOp,
              filter: blur > 0.05 || fxFilter ? `${blur > 0.05 ? `blur(${blur * U}px)` : ""}${fxFilter}`.trim() : undefined,
              clipPath: clip,
              position: "relative",
            }}
          >
            {body}
            {over}
          </div>
        );
        const block = (
          <AbsoluteFill
            style={{
              justifyContent: "center",
              alignItems: align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center",
              padding: `0 ${side}px`,
            }}
          >
            {part.exit === "sink" ? (
              // the mask line sits at the bottom of the words, so they sink out of sight
              <div style={{ overflow: "hidden", padding: `${size * 0.2}px ${size * 0.1}px 0`, transform: `translateY(${y}px)` }}>{textDiv}</div>
            ) : (
              textDiv
            )}
          </AbsoluteFill>
        );
        return part.exit === "slash" ? (
          <SliceExit key={ci} t={t} out={out} strength={kind === "drop" ? 1.4 : 1} y={y}>
            {block}
          </SliceExit>
        ) : (
          <React.Fragment key={ci}>{block}</React.Fragment>
        );
      })}
    </>
  );
};

/** Verse lines, moved the way the song's motion says. */
export const VerseLine: React.FC<P> = (p) => <BurstLine {...p} kind="verse" />;

/** Chorus / hook / drop lines: usually bigger and harder than the verse, per the song's motion. */
export const DropLine: React.FC<P> = (p) => <BurstLine {...p} kind="drop" />;

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
        {...checkTag(text, p > 0.97 && fade === 1)}
        style={{
          fontFamily: display,
          fontSize: fit(300, text),
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

/** Chant: every chop is a giant hit; in hard-cutting songs it gets sliced in half and falls apart. */
export const ChantLine: React.FC<P> = ({ line, t, display, chroma }) => {
  // hits only get sliced when the song's motion cuts things down; otherwise they land and fade
  const sliced = motionFor(sectionAt(line.start)).drop.exit === "slash";
  const hits = line.words.map((w, i) => ({ w, i, age: t - w.s })).filter(({ age }) => age >= -0.03 && age < 0.55);
  return (
    <AbsoluteFill>
      {hits.map(({ w, i, age }) => {
        const spot = SPOTS[i % SPOTS.length];
        const text = caps(clean(w.text));
        const size = fit(330, text, 0.6);
        // keep the whole word (plus slam overshoot) inside the frame
        const halfW = (size * textWidth(text) * 1.2) / 2;
        const cx = Math.min(W - halfW - 24 * U, Math.max(halfW + 24 * U, W / 2 + spot.x * X));
        const slam = easeOutExpo(clamp01((age + 0.03) / 0.08));
        const cutAt = 0.09;
        const split = sliced ? easeOutExpo(clamp01((age - cutAt) / 0.4)) : 0;
        const fade = 1 - clamp01((age - 0.2) / 0.35);
        const slash = sliced ? clamp01((age - cutAt + 0.02) / 0.05) * (1 - clamp01((age - cutAt - 0.06) / 0.1)) : 0;
        const color = i % 3 === 2 ? theme.accent : theme.text;
        const word = (
          <div
            style={{
              fontFamily: display,
              fontSize: size,
              lineHeight: 1,
              whiteSpace: "nowrap",
              color,
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
              top: H / 2 + spot.y * Y,
              transform: `translate(-50%, -50%) rotate(${spot.r}deg) scale(${1 + 0.35 * (1 - slam)})`,
              opacity: fade * slam,
            }}
          >
            {/* the halves are copies, so only the whole is reported to the self-check */}
            <div {...checkTag(text, slam > 0.97 && split === 0 && fade === 1)} style={{ position: "relative", color }}>
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
    fontSize: fit(340, text, 0.86 / base),
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
        {...checkTag(text, enter > 0.97 && slam > 0.97 && exit === 1)}
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
  // the letters blur out for up to 1.2 s, but are gone before the next line comes in
  const end = Math.min(line.out + 1.2, nextStart(line) - 0.02);
  const from = Math.min(line.out, end - 0.3);
  if (t < line.start - 0.1 || t > end) return null;
  const text = caps(line.words.map((w) => w.text).join(" "));
  const local = t - line.start;
  const exit = clamp01((t - from) / (end - from));
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <div {...checkTag(text, local > 0.5 + text.length * 0.03 && exit === 0)} style={{ fontFamily: display, color: theme.text, fontSize: fit(200, text, 0.66), whiteSpace: "nowrap", letterSpacing: `${0.02 + local * 0.04}em` }}>
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
