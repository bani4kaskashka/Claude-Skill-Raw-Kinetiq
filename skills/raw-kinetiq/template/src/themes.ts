import themesJson from "./themes.json";

/*
 * Colours and type. A theme is only a starting palette: config.json can set any colours
 * ("colors") and any Google Font or local font file ("fonts"), and a section can shift the
 * palette for itself ("colors" in sections.json). Mix freely; nothing here is a house style.
 */

export type Palette = {
  bg: string;
  text: string;
  accent: string;
  /** the second RGB-split / secondary colour */
  accent2: string;
  /** tint of dim labels */
  dim: string;
};

/** A font: a Google Fonts family name ("Playfair Display"), or {family, weight, italic, file}. */
export type FontSpec = string | { family: string; weight?: number | string; italic?: boolean; file?: string };

export type Theme = Palette & {
  /** what it suits, for picking one */
  vibe: string;
  /** display font for the lyrics */
  font: FontSpec;
  /** uppercase the lyrics */
  upper: boolean;
  /** 0..1 how much grain/scanline/vignette */
  grit: number;
};

/** starting palettes + fonts; the source of truth is themes.json (prep.mjs reads it too) */
export const THEMES = themesJson as Record<string, Theme>;

const rgbOf = (c: string): [number, number, number, number] => {
  const m = c.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const [r, g, b, a = "1"] = m[1].split(",").map((x) => x.trim());
    return [Number(r), Number(g), Number(b), Number(a)];
  }
  const h = c.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((x) => x + x).join("") : h.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
};

/** Any colour (hex or rgb/rgba) at alpha `a`. */
export const hexA = (c: string, a: number) => {
  const [r, g, b] = rgbOf(c);
  return `rgba(${r},${g},${b},${a})`;
};

/** Blend two colours, p = 0 gives `a`, 1 gives `b`. */
export const mixColor = (a: string, b: string, p: number) => {
  if (p <= 0) return a;
  if (p >= 1) return b;
  const x = rgbOf(a);
  const y = rgbOf(b);
  const m = (i: number) => x[i] + (y[i] - x[i]) * p;
  return `rgba(${Math.round(m(0))},${Math.round(m(1))},${Math.round(m(2))},${m(3).toFixed(3)})`;
};
