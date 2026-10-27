// Self-check pass: render frames across the song in check mode and record where every piece of
// text and every image really lands (see Checker in src/Video.tsx).
// Usage: node check.mjs [per-second=4] [from-s] [to-s]
// Writes check/frames/*.jpeg and check/dom.jsonl; scripts/check.py turns them into a report.
import { bundle } from "@remotion/bundler";
import { renderFrames, selectComposition } from "@remotion/renderer";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

// fonts first (any change to config.json "fonts" is picked up here)
await import("./prep.mjs");

const perSecond = Number(process.argv[2] ?? 4);
const from = Number(process.argv[3] ?? 0);
const to = process.argv[4] === undefined ? Infinity : Number(process.argv[4]);

rmSync("check/frames", { recursive: true, force: true });
mkdirSync("check/frames", { recursive: true });
const inputProps = { check: true };
const serveUrl = await bundle({ entryPoint: path.resolve("src/index.ts") });
const composition = await selectComposition({ serveUrl, id: "LyricVideo", inputProps });
const fps = composition.fps;
const every = Math.max(1, Math.round(fps / perSecond));
const first = Math.min(composition.durationInFrames - 1, Math.round(from * fps));
const last = Math.min(composition.durationInFrames - 1, Number.isFinite(to) ? Math.round(to * fps) : composition.durationInFrames - 1);

const lines = [];
const start = Date.now();
await renderFrames({
  composition,
  serveUrl,
  inputProps,
  outputDir: "check/frames",
  imageFormat: "jpeg",
  imageSequencePattern: "f[frame].[ext]",
  jpegQuality: 70,
  scale: 0.5,
  frameRange: [first, last],
  everyNthFrame: every,
  concurrency: "75%",
  chromiumOptions: { gl: "angle" },
  onStart: ({ frameCount }) => console.log(`checking ${frameCount} frames (${perSecond}/s)`),
  onFrameUpdate: () => {},
  onBrowserLog: (log) => {
    const i = log.text.indexOf("RKCHECK ");
    if (i >= 0) lines.push(log.text.slice(i + 8));
    else if (log.type === "error") console.error("browser:", log.text);
  },
});
writeFileSync("check/dom.jsonl", lines.join("\n") + "\n");
writeFileSync("check/meta.json", JSON.stringify({ fps, every, first, last, scale: 0.5, width: composition.width, height: composition.height }));
console.log(`rendered and measured in ${((Date.now() - start) / 1000).toFixed(0)} s: check/`);
