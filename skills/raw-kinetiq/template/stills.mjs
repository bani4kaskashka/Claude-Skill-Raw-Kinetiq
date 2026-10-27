// Render stills at given times (seconds): node stills.mjs 0.5 2 15.5 ...
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import { mkdirSync } from "node:fs";
import path from "node:path";

// fonts first (any change to config.json "fonts" is picked up here)
await import("./prep.mjs");

const times = process.argv.slice(2).map(Number);
mkdirSync("stills", { recursive: true });
const serveUrl = await bundle({ entryPoint: path.resolve("src/index.ts") });
const composition = await selectComposition({ serveUrl, id: "LyricVideo" });
for (const t of times) {
  const frame = Math.round(t * composition.fps);
  const output = `stills/t${t.toFixed(2).padStart(6, "0")}.png`;
  await renderStill({ composition, serveUrl, frame, output, scale: 0.5, chromiumOptions: { gl: "angle" } });
  console.log(output);
}
