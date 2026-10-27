// Fetch the fonts named in src/data/config.json into public/fonts and write src/data/fonts.json.
// Any Google Fonts family works ("Playfair Display", {"family": "Syne", "weight": 800, "italic": true}),
// and so does a local file in public/ ({"family": "Mine", "file": "fonts/mine.otf"}).
// Runs before stills, checks and renders; files already downloaded are reused.
import { getAvailableFonts } from "@remotion/google-fonts";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const read = (p) => JSON.parse(readFileSync(p, "utf8"));
const config = read("src/data/config.json");
const themes = read("src/themes.json");
const theme = themes[config.theme] ?? themes.phonk;
const fonts = config.fonts ?? {};
const roles = {
  display: fonts.display ?? theme.font,
  alt: fonts.alt ?? fonts.display ?? theme.font,
  mono: fonts.mono ?? "Space Mono",
};

const norm = (spec) => (typeof spec === "string" ? { family: spec } : spec);
const key = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const available = getAvailableFonts();
mkdirSync("public/fonts", { recursive: true });

const out = {};
for (const [role, raw] of Object.entries(roles)) {
  const spec = norm(raw);
  if (spec.file) {
    if (!existsSync(path.join("public", spec.file))) throw new Error(`${role} font file not found: public/${spec.file}`);
    out[role] = { family: spec.family ?? role, faces: [{ file: spec.file }] };
    continue;
  }
  const hit = available.find((f) => key(f.fontFamily) === key(spec.family));
  if (!hit) {
    const near = available.filter((f) => key(f.fontFamily).includes(key(spec.family).slice(0, 4))).slice(0, 8);
    throw new Error(`"${spec.family}" is not a Google Font. Close names: ${near.map((f) => f.fontFamily).join(", ") || "none"}`);
  }
  const info = (await hit.load()).getInfo();
  const style = spec.italic && info.fonts.italic ? "italic" : "normal";
  const weights = Object.keys(info.fonts[style]).map(Number);
  const want = Number(spec.weight ?? (weights.includes(400) ? 400 : weights[0]));
  // the closest weight the family has
  const weight = String(weights.reduce((a, b) => (Math.abs(b - want) < Math.abs(a - want) ? b : a)));
  const subsets = info.fonts[style][weight];
  const faces = [];
  for (const subset of ["latin", "latin-ext"]) {
    const url = subsets[subset];
    if (!url) continue;
    const file = `fonts/${hit.importName}-${weight}${style === "italic" ? "i" : ""}-${subset}.woff2`;
    if (!existsSync(path.join("public", file))) {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`download failed for ${spec.family} (${res.status})`);
      writeFileSync(path.join("public", file), Buffer.from(await res.arrayBuffer()));
    }
    faces.push({ file, unicodeRange: info.unicodeRanges[subset] });
  }
  if (!faces.length) throw new Error(`${spec.family} has no latin subset`);
  out[role] = { family: info.fontFamily, weight, style, faces };
}
writeFileSync("src/data/fonts.json", JSON.stringify(out, null, 2) + "\n");
console.log(Object.entries(out).map(([r, f]) => `${r}: ${f.family}${f.weight ? ` ${f.weight}` : ""}${f.style === "italic" ? " italic" : ""}`).join(" | "));
