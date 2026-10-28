import React, { useEffect, useLayoutEffect, useState } from "react";
import { AbsoluteFill, Audio, continueRender, delayRender, getInputProps, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { H, HITS, SHAKE, U, W, caps, clamp01, config, easeOutExpo, energy, energyAt, fit, paint, pulse, sectionAt, theme, timeline } from "./data";
import { Backdrop } from "./backgrounds";
import { AssetLayer } from "./assets";
import { DropFlash, Hud, Overlay, camBack, camFront, cameraAt, shakeOffset } from "./fx";
import { family, loadFonts } from "./fonts";
import { motionFor } from "./motion";
import { ChantLine, DropLine, LineProps, OutroLine, ShoutLine, TunnelLine, VerseLine, checkTag } from "./lyrics";
import { Foreground, modes as customModes } from "./custom";

const RENDERERS: Record<string, React.FC<LineProps>> = {
  verse: VerseLine,
  drop: DropLine,
  shout: ShoutLine,
  chant: ChantLine,
  tunnel: TunnelLine,
  outro: OutroLine,
  ...customModes,
};

const CHECK = getInputProps().check === true;

const EndCard: React.FC<{ t: number; display: string }> = ({ t, display }) => {
  const start = timeline.duration - 3.4;
  if (t < start) return null;
  const p = easeOutExpo(clamp01((t - start) / 0.9));
  const out = clamp01((timeline.duration - t) / 0.8);
  const title = caps(timeline.title);
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", opacity: out }}>
      <div
        {...checkTag(title, p > 0.97 && out === 1)}
        style={{
          fontFamily: display,
          fontSize: fit(260, title, 0.86, "display", 0.02),
          lineHeight: 1,
          whiteSpace: "nowrap",
          color: theme.text,
          letterSpacing: `${0.3 - 0.28 * p}em`,
          opacity: p,
          filter: `blur(${(1 - p) * 10 * U}px)`,
        }}
      >
        {title}
      </div>
      <div style={{ fontFamily: family("mono"), fontSize: 26 * U, letterSpacing: "0.4em", color: theme.accent, marginTop: 18 * U, opacity: clamp01((t - start - 0.4) / 0.6) }}>
        {timeline.artist.toUpperCase()}
      </div>
    </AbsoluteFill>
  );
};

type Box = { left: number; top: number; right: number; bottom: number };

/** How visible `el` is (its opacity times every ancestor's) and the box its masks leave open. */
const seen = (el: Element, box: Box, stop: Element | null = null) => {
  // copy the sides one by one: a DOMRect keeps them on its prototype, so spreading it gives {}
  const r = { left: box.left, top: box.top, right: box.right, bottom: box.bottom };
  let op = 1;
  for (let n: Element | null = el; n; n = n.parentElement) {
    const cs = getComputedStyle(n);
    op *= Number(cs.opacity);
    if (cs.visibility === "hidden" || cs.display === "none") op = 0;
    // a mask (overflow hidden) hides whatever sticks out of it
    if (n !== el && n !== stop && cs.overflow !== "visible") {
      const m = n.getBoundingClientRect();
      r.left = Math.max(r.left, m.left);
      r.top = Math.max(r.top, m.top);
      r.right = Math.min(r.right, m.right);
      r.bottom = Math.min(r.bottom, m.bottom);
    }
  }
  return { r, op: r.right > r.left && r.bottom > r.top ? op : 0 };
};

/**
 * Check mode (check.mjs renders with {check: true}): after every frame, report where each
 * piece of tagged text and each image really is, how visible it is and its colour and size,
 * as one console line the check script collects. Text is measured letter group by letter
 * group, so words still hidden (behind a mask, scaled to nothing, not yet typed) don't count.
 */
const Checker: React.FC<{ frame: number }> = ({ frame }) => {
  useLayoutEffect(() => {
    const items = [...document.querySelectorAll<HTMLElement>("[data-check]")].map((el) => {
      let box: Box | null = null;
      let op = 0;
      if (el.tagName === "IMG") {
        const v = seen(el, el.getBoundingClientRect());
        box = v.r;
        op = v.op;
      } else {
        const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        const range = document.createRange();
        for (let n = walk.nextNode(); n; n = walk.nextNode()) {
          if (!n.textContent?.trim() || !n.parentElement) continue;
          range.selectNodeContents(n);
          const v = seen(n.parentElement, range.getBoundingClientRect());
          // the part's own opacity is reported once, below; here only "is this bit showing"
          if (v.op < 0.08) continue;
          op = Math.max(op, v.op);
          box = box
            ? { left: Math.min(box.left, v.r.left), top: Math.min(box.top, v.r.top), right: Math.max(box.right, v.r.right), bottom: Math.max(box.bottom, v.r.bottom) }
            : v.r;
        }
      }
      const r = box ?? { left: 0, top: 0, right: 0, bottom: 0 };
      const cs = getComputedStyle(el);
      return {
        kind: el.dataset.check,
        state: el.dataset.state ?? "settled",
        text: el.dataset.text ?? "",
        x: Math.round(r.left),
        y: Math.round(r.top),
        w: Math.max(0, Math.round(r.right - r.left)),
        h: Math.max(0, Math.round(r.bottom - r.top)),
        op: Math.round(op * 100) / 100,
        color: cs.color,
        // the biggest type inside it (a wrapper can hold the real text deeper down)
        size: Math.round(Math.max(parseFloat(cs.fontSize), ...[...el.querySelectorAll("*")].map((c) => parseFloat(getComputedStyle(c).fontSize)))),
      };
    });
    const palette = { bg: theme.bg, text: theme.text, accent: theme.accent, accent2: theme.accent2 };
    console.log(`RKCHECK ${JSON.stringify({ frame, W, H, palette, items })}`);
  });
  return null;
};

export const LyricVideo: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  // nothing is drawn (or measured) until the fonts are in
  const [ready, setReady] = useState(false);
  const [handle] = useState(() => delayRender("fonts"));
  useEffect(() => {
    loadFonts()
      .then(() => setReady(true))
      .catch((e) => console.error("font load failed", e))
      .finally(() => continueRender(handle));
  }, [handle]);
  if (!ready) return null;

  const t = frame / fps;
  paint(t);
  const display = family("display");
  const section = sectionAt(t);
  // how hard the camera hits depends on the section and on the song: a ballad barely moves
  const motion = motionFor(section);
  const hit = SHAKE[section.kind] * motion.energy;
  const kick = pulse(HITS, t, 9);
  const sub = energyAt(energy.drive, t);
  const shake = shakeOffset(t, hit * (kick * 16 + sub * 2.5));
  const chroma = hit * (1.5 + kick * 9);
  const punch = 1 + hit * 0.03 * kick;
  const fadeIn = clamp01(t / 1.2);
  const cam = cameraAt(t);

  const live = timeline.lines.filter((l) => t >= l.start - 0.25 && t <= l.out + 1.4);

  return (
    <AbsoluteFill style={{ backgroundColor: theme.bg, width: W, height: H }}>
      <AbsoluteFill style={{ opacity: fadeIn }}>
        <AbsoluteFill style={{ transform: camBack(cam) }}>
          <Backdrop t={t} display={display} />
          <AssetLayer t={t} layer="back" />
        </AbsoluteFill>
        <AbsoluteFill style={{ transform: `${camFront(cam)} translate(${shake.x}px, ${shake.y}px) rotate(${shake.r}deg) scale(${punch})` }}>
          {live.map((l) => {
            const R = RENDERERS[l.mode] ?? VerseLine;
            return <R key={`${l.start}-${l.mode}`} line={l} t={t} display={display} chroma={chroma} />;
          })}
          {config.endCard !== false && <EndCard t={t} display={display} />}
        </AbsoluteFill>
        <AssetLayer t={t} layer="front" />
        {Foreground && <Foreground t={t} />}
        <DropFlash t={t} strength={Math.min(1, motion.energy)} />
      </AbsoluteFill>
      <Overlay frame={frame} />
      <Hud t={t} section={section} mono={family("mono")} />
      {!CHECK && <Audio src={staticFile(config.audio)} />}
      {CHECK && <Checker frame={frame} />}
    </AbsoluteFill>
  );
};
