import React from "react";
import type { LayerProps } from "../backgrounds";
import type { Effect, LineProps } from "../lyrics";
import type { Moment } from "../moments";

/*
 * This song's own pieces: everything that makes this video look like this song and no other.
 * Write them from the song's own images (references/toolkit.md, "The song's own pieces" and
 * "Moments"). They are kept when the project is updated from the template.
 *
 *   moments  what happens because of what a line says: a drawn thing doing something, timed to
 *            its lyric, with its own camera (work/storyboard.md lists them)
 *   effects  as "enter" / "exit" in a motion part (config.json or a section's "motion")
 *   layers   in "scene" (sections.json) or the motion's "scenes"
 *   modes    in "modes" (sections.json); a mode named chant, shout, tunnel or outro replaces
 *            that built-in look for this song and keeps its rhythm timing
 * Import helpers from "../draw" (lineAt, wordIn, seg, keys, morph, smooth, Stage, Ink, Strip...),
 * "../data", "../fonts", "../themes" and "../lyrics" (checkTag, colorOf).
 * Every visual is drawn here in code (SVG, CSS); nothing is generated.
 *
 * Example effect (a fever song: words arrive shaking in heat haze, then cool and go still):
 *   const fever: Effect = {
 *     word: ({ text, since, sung, ink }) => {
 *       const k = sung ? Math.max(0, 1 - since / 0.5) : 1;
 *       return <span style={{ display: "inline-block", opacity: sung ? 1 : 0.15, filter: `blur(${4 * k}px)`,
 *         transform: `translateY(${Math.sin(since * 40) * 6 * k}px) skewX(${8 * k}deg)`, ...ink }}>{text}</span>;
 *     },
 *     burst: ({ e }) => ({ opacity: 1 - e, blur: 10 * e, transform: ` scaleY(${1 + 0.6 * e})` }),
 *     exitDur: 0.5,
 *   };
 *   export const effects: Record<string, Effect> = { fever };
 */

/** what happens on screen because of what the lines say, in song order */
export const moments: Moment[] = [];

/** this song's own ways for words to arrive and leave, by name */
export const effects: Record<string, Effect> = {};

/** this song's own background layers, by name */
export const layers: Record<string, React.FC<LayerProps>> = {};

/** this song's own line styles, by name */
export const modes: Record<string, React.FC<LineProps>> = {};

/** drawn over everything (but under the grain), every frame */
export const Foreground: React.FC<{ t: number }> | null = null;
