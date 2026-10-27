import { loadFont as anton } from "@remotion/google-fonts/Anton";
import { loadFont as bebas } from "@remotion/google-fonts/BebasNeue";
import { loadFont as archivo } from "@remotion/google-fonts/ArchivoBlack";
import { loadFont as rubikMono } from "@remotion/google-fonts/RubikMonoOne";
import { loadFont as syne } from "@remotion/google-fonts/Syne";
import { loadFont as unbounded } from "@remotion/google-fonts/Unbounded";
import { loadFont as spaceMono } from "@remotion/google-fonts/SpaceMono";

export type Theme = {
  /** what it suits, for picking one */
  vibe: string;
  bg: string;
  text: string;
  accent: string;
  /** the second RGB-split colour */
  accent2: string;
  /** tint of the dim HUD labels */
  dim: string;
  display: () => string;
  /** uppercase the lyrics */
  upper: boolean;
  /** 0..1 how much grain/scanline/vignette */
  grit: number;
  /** average uppercase glyph width in em, for fitting words to the frame */
  charW: number;
};

// Each loader is only called for the theme in use, so only that font is fetched.
const F = {
  anton: () => anton("normal", { weights: ["400"], subsets: ["latin"] }).fontFamily,
  bebas: () => bebas("normal", { weights: ["400"], subsets: ["latin"] }).fontFamily,
  archivo: () => archivo("normal", { weights: ["400"], subsets: ["latin"] }).fontFamily,
  rubikMono: () => rubikMono("normal", { weights: ["400"], subsets: ["latin"] }).fontFamily,
  syne: () => syne("normal", { weights: ["800"], subsets: ["latin"] }).fontFamily,
  unbounded: () => unbounded("normal", { weights: ["800"], subsets: ["latin"] }).fontFamily,
};
export const loadMono = () => spaceMono("normal", { weights: ["400"], subsets: ["latin"] }).fontFamily;

export const THEMES: Record<string, Theme> = {
  phonk: {
    vibe: "phonk, trap, drill, dark hip-hop: black, blood red, tape grit",
    bg: "#07060a", text: "#f4f1ea", accent: "#ff1f3d", accent2: "#00ebff", dim: "rgba(244,241,234,0.55)",
    display: F.anton, upper: true, grit: 1, charW: 0.45,
  },
  neon: {
    vibe: "synthwave, EDM, house, hyperpop-lite: deep purple night, magenta and cyan",
    bg: "#08041a", text: "#f6f0ff", accent: "#ff2bd6", accent2: "#00e5ff", dim: "rgba(246,240,255,0.55)",
    display: F.unbounded, upper: true, grit: 0.6, charW: 0.86,
  },
  toxic: {
    vibe: "rage, hyperpop, punk, metalcore: acid green on black, loud",
    bg: "#050605", text: "#f2ffe6", accent: "#b6ff00", accent2: "#ff2a6d", dim: "rgba(242,255,230,0.5)",
    display: F.rubikMono, upper: true, grit: 1, charW: 0.86,
  },
  gold: {
    vibe: "luxury rap, boom bap, soul samples: warm black and gold",
    bg: "#0b0806", text: "#fbf3e2", accent: "#f2b631", accent2: "#ff6a2a", dim: "rgba(251,243,226,0.5)",
    display: F.bebas, upper: true, grit: 0.7, charW: 0.4,
  },
  ice: {
    vibe: "R&B, ambient, sad/dreamy, lo-fi: cold blue night, soft",
    bg: "#05080d", text: "#eaf6ff", accent: "#7fd3ff", accent2: "#b388ff", dim: "rgba(234,246,255,0.5)",
    display: F.syne, upper: false, grit: 0.5, charW: 0.66,
  },
  paper: {
    vibe: "pop, indie, acoustic, upbeat: light paper background, ink and red",
    bg: "#efe9dd", text: "#141210", accent: "#ff3b1f", accent2: "#1f6bff", dim: "rgba(20,18,16,0.55)",
    display: F.archivo, upper: true, grit: 0.45, charW: 0.66,
  },
};

export const hexA = (hex: string, a: number) => {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};
