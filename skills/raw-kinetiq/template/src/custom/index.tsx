import React from "react";
import type { LayerProps } from "../backgrounds";
import type { LineProps } from "../lyrics";

/*
 * This song's own pieces. Anything the toolkit doesn't have, write here: a background layer
 * made for this song, a line style for one special moment, something that sits over the whole
 * video. They are kept when the project is updated from the template.
 *
 * Use them by name: a layer in "scene" (sections.json) or in the motion's "scenes"; a line
 * style in "modes" (sections.json). Import helpers from "../data", "../fonts" and "../themes".
 *
 * Example layer:
 *   import { AbsoluteFill } from "remotion";
 *   import { theme, energy, energyAt } from "../data";
 *   const Heartbeat: React.FC<LayerProps> = ({ t }) => (
 *     <AbsoluteFill style={{ background: theme.accent, opacity: 0.15 * energyAt(energy.sub, t) }} />
 *   );
 *   export const layers = { heartbeat: Heartbeat };
 */

/** extra background layers, by name */
export const layers: Record<string, React.FC<LayerProps>> = {};

/** extra line styles, by name */
export const modes: Record<string, React.FC<LineProps>> = {};

/** drawn over everything (but under the grain), every frame */
export const Foreground: React.FC<{ t: number }> | null = null;
