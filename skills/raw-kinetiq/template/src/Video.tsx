import React from "react";
import { AbsoluteFill, Audio, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { SHAKE, U, caps, clamp01, config, easeOutExpo, energy, energyAt, fit, pulse, sectionAt, theme, timeline } from "./data";
import { Backdrop } from "./backgrounds";
import { DropFlash, Hud, Overlay, shakeOffset } from "./fx";
import { ChantLine, DropLine, OutroLine, ShoutLine, TunnelLine, VerseLine } from "./lyrics";
import { loadMono } from "./themes";

const display = theme.display();
const mono = loadMono();

const RENDERERS = {
  verse: VerseLine,
  drop: DropLine,
  shout: ShoutLine,
  chant: ChantLine,
  tunnel: TunnelLine,
  outro: OutroLine,
};

const EndCard: React.FC<{ t: number }> = ({ t }) => {
  const start = timeline.duration - 3.4;
  if (t < start) return null;
  const p = easeOutExpo(clamp01((t - start) / 0.9));
  const out = clamp01((timeline.duration - t) / 0.8);
  const title = caps(timeline.title);
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", opacity: out }}>
      <div
        style={{
          fontFamily: display,
          fontSize: fit(260, title.length),
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
      <div style={{ fontFamily: mono, fontSize: 26 * U, letterSpacing: "0.4em", color: theme.accent, marginTop: 18 * U, opacity: clamp01((t - start - 0.4) / 0.6) }}>
        {timeline.artist.toUpperCase()}
      </div>
    </AbsoluteFill>
  );
};

export const LyricVideo: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const section = sectionAt(t);
  const hit = SHAKE[section.kind];
  const kick = pulse(timeline.kicks, t, 9);
  const sub = energyAt(energy.sub, t);
  const shake = shakeOffset(t, hit * (kick * 16 + sub * 2.5));
  const chroma = hit * (1.5 + kick * 9);
  const punch = 1 + hit * 0.03 * kick;
  const fadeIn = clamp01(t / 1.2);

  const live = timeline.lines.filter((l) => t >= l.start - 0.25 && t <= l.out + 1.4);

  return (
    <AbsoluteFill style={{ backgroundColor: theme.bg }}>
      <AbsoluteFill style={{ opacity: fadeIn }}>
        <Backdrop t={t} display={display} />
        <AbsoluteFill style={{ transform: `translate(${shake.x}px, ${shake.y}px) rotate(${shake.r}deg) scale(${punch})` }}>
          {live.map((l) => {
            const R = RENDERERS[l.mode] ?? VerseLine;
            return <R key={`${l.start}-${l.mode}`} line={l} t={t} display={display} chroma={chroma} />;
          })}
          {config.endCard !== false && <EndCard t={t} />}
        </AbsoluteFill>
        <DropFlash t={t} />
      </AbsoluteFill>
      <Overlay frame={frame} />
      <Hud t={t} section={section} mono={mono} />
      <Audio src={staticFile(config.audio)} />
    </AbsoluteFill>
  );
};
