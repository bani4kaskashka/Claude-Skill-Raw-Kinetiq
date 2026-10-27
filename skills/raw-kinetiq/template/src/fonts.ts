import { staticFile } from "remotion";
import fontsJson from "./data/fonts.json";

/*
 * Fonts come from prep.mjs (public/fonts + data/fonts.json). Each role gets its own alias
 * family, so CSS never has to know the real name, weight or style. Text sizes are measured
 * on a canvas with the real font instead of guessed, so nothing runs off the frame.
 */

export type Role = "display" | "alt" | "mono";
type Face = { file: string; unicodeRange?: string };
const FONTS = fontsJson as Partial<Record<Role, { family: string; faces: Face[] }>>;

const FALLBACK: Record<Role, string> = { display: "Impact, sans-serif", alt: "Georgia, serif", mono: "Consolas, monospace" };
export const family = (role: Role) => (FONTS[role] ? `rk-${role}, ${FALLBACK[role]}` : FALLBACK[role]);

let loaded: Promise<void> | null = null;
/** Load every role's faces once; resolves when the text can be measured. */
export const loadFonts = () =>
  (loaded ??= Promise.all(
    (Object.keys(FONTS) as Role[]).flatMap((role) =>
      FONTS[role]!.faces.map(async (f) => {
        const face = new FontFace(`rk-${role}`, `url(${staticFile(f.file)})`, f.unicodeRange ? { unicodeRange: f.unicodeRange } : {});
        document.fonts.add(await face.load());
      }),
    ),
  ).then(() => undefined));

const cache = new Map<string, number>();
let ctx: CanvasRenderingContext2D | null = null;

/** Width of `text` in em (at font-size 1px it is this many px wide). */
export const textWidth = (text: string, role: Role = "display", tracking = 0) => {
  const k = `${role}|${tracking}|${text}`;
  let w = cache.get(k);
  if (w === undefined) {
    ctx ??= document.createElement("canvas").getContext("2d")!;
    ctx.font = `100px ${family(role)}`;
    w = ctx.measureText(text).width / 100 + tracking * Math.max(0, [...text].length - 1);
    cache.set(k, w);
  }
  return w;
};

/** Font size (px) that fits `text` on one line inside `width` px, never above `max` px. */
export const fitPx = (text: string, max: number, width: number, role: Role = "display", tracking = 0) =>
  Math.min(max, width / Math.max(textWidth(text, role, tracking), 0.3));
