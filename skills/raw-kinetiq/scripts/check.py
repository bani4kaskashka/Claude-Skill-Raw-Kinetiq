"""Turn a check pass (video/check/dom.jsonl + frames from check.mjs) into a report.

Usage: python check.py <project dir>

Finds, in every sampled frame:
  off-frame   settled text running past the frame edge
  overlap     two pieces of text on top of each other, both settled
  crossing    one line animating in or out over another (must-fix when it lasts)
  over-image  text sitting on a cutout/poster (fine when meant, but check the contrast)
  contrast    text that is hard to read against what is behind it
  tiny        text too small to read on a phone
  gap         someone is singing but no lyric is on screen

Writes check/report.md, check/issues.png (the flagged frames, problems boxed in red) and
check/overview.png (frames across the whole song, to judge the look and the flow).
"""
import json
import math
import re
import sys
from pathlib import Path

from PIL import Image, ImageDraw

proj = Path(sys.argv[1])
vid = proj / "video"
chk = vid / "check"
meta = json.loads((chk / "meta.json").read_text())
timeline = json.loads((vid / "src/data/timeline.json").read_text(encoding="utf-8"))
fps, scale = meta["fps"], meta["scale"]
records = {}
for raw in (chk / "dom.jsonl").read_text(encoding="utf-8").splitlines():
    if raw.strip():
        r = json.loads(raw)
        records[r["frame"]] = r  # the last report for a frame wins
frames = sorted(records)
if not frames:
    sys.exit("no check data: run check.mjs first")
W, H = records[frames[0]]["W"], records[frames[0]]["H"]
U = min(W, H) / 1080


def frame_path(f):
    # check.mjs numbers the images by sample, not by video frame
    idx = (f - meta["first"]) // meta["every"]
    for n in range(1, 7):
        p = chk / "frames" / f"f{idx:0{n}d}.jpeg"
        if p.exists():
            return p
    return None


def stamp(f):
    t = f / fps
    return f"{int(t // 60)}:{t % 60:04.1f}"


def section_at(t):
    for s in timeline["sections"]:
        if s["start"] <= t < s["end"]:
            return s["name"]
    return timeline["sections"][-1]["name"]


def rgb(c):
    m = re.match(r"rgba?\(([^)]+)\)", c or "")
    if m:
        v = [float(x) for x in m.group(1).split(",")]
        return v[:3], (v[3] if len(v) > 3 else 1.0)
    h = (c or "#000").lstrip("#")
    if len(h) == 3:
        h = "".join(x * 2 for x in h)
    return [int(h[i : i + 2], 16) for i in (0, 2, 4)], 1.0


def lum(c):
    def ch(v):
        v /= 255
        return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4

    return 0.2126 * ch(c[0]) + 0.7152 * ch(c[1]) + 0.0722 * ch(c[2])


def ratio(a, b):
    la, lb = sorted((lum(a), lum(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


def inter(a, b):
    w = min(a["x"] + a["w"], b["x"] + b["w"]) - max(a["x"], b["x"])
    h = min(a["y"] + a["h"], b["y"] + b["h"]) - max(a["y"], b["y"])
    return max(0, w) * max(0, h)


def contrast_of(img, it, pal, others=()):
    """Contrast between the text colour and what is around the text: a band just outside its box,
    leaving out accent-coloured pixels and other text (a neighbouring word is not the background).
    Light text is judged against the brightest tenth of that band, dark text against the darkest,
    so a bright patch behind it counts."""
    col, alpha = rgb(it["color"])
    if alpha < 0.5:
        return None, 0
    x0, y0, x1, y1 = (v * scale for v in (it["x"], it["y"], it["x"] + it["w"], it["y"] + it["h"]))
    pad_y, pad_x = 0.35 * (y1 - y0), 0.12 * (y1 - y0)
    outer = (max(0, int(x0 - pad_x)), max(0, int(y0 - pad_y)), min(img.width, int(x1 + pad_x)), min(img.height, int(y1 + pad_y)))
    if outer[2] - outer[0] < 8 or outer[3] - outer[1] < 8:
        return None, 0
    # accent-coloured pixels around text are mostly its own RGB-split shadow
    near = [rgb(pal.get(k, "#000"))[0] for k in ("accent", "accent2")]
    px = img.load()
    stride = max(1, int((outer[2] - outer[0]) * (outer[3] - outer[1]) / 4000) ** 0.5 // 1 or 1)
    skip = [tuple(v * scale for v in (o["x"], o["y"], o["x"] + o["w"], o["y"] + o["h"])) for o in others]
    bg = []
    for y in range(outer[1], outer[3], int(stride)):
        for x in range(outer[0], outer[2], int(stride)):
            if x0 <= x < x1 and y0 <= y < y1:
                continue
            if any(a <= x < c and b <= y < d for a, b, c, d in skip):
                continue
            p = px[x, y]
            if all(sum((p[i] - n[i]) ** 2 for i in range(3)) > 90**2 for n in near):
                bg.append(lum(p))
    if len(bg) < 30:
        return None, 0
    bg.sort()
    lt = lum(col)
    worst = bg[int(len(bg) * 0.9)] if lt > bg[len(bg) // 2] else bg[int(len(bg) * 0.1)]
    spread = bg[int(len(bg) * 0.9)] - bg[int(len(bg) * 0.1)]
    hi, lo = max(lt, worst), min(lt, worst)
    return (hi + 0.05) / (lo + 0.05), spread


issues = []  # (kind, frame, text, boxes, detail)
gaps = []
lines = timeline["lines"]
for f in frames:
    r = records[f]
    t = f / fps
    pal = r.get("palette", {})
    # text almost fully behind a mask (a sliver of a sinking word) is not really on screen
    items = [i for i in r["items"] if i["op"] > 0.35 and i["w"] > 0 and i["h"] > (0.25 * i["size"] if i["kind"] == "lyric" else 0)]
    lyr = [i for i in items if i["kind"] == "lyric"]
    settled = [i for i in lyr if i["state"] == "settled"]
    imgs = [i for i in items if i["kind"] == "asset"]
    for i in settled:
        out_x = max(0, -i["x"], i["x"] + i["w"] - W)
        out_y = max(0, -i["y"], i["y"] + i["h"] - H)
        if out_x > 0.01 * W or out_y > 0.01 * H:
            issues.append(("off-frame", f, i["text"], [i], f"{max(out_x, out_y)}px outside"))
        if i["size"] and i["size"] < 34 * U:
            issues.append(("tiny", f, i["text"], [i], f"{i['size']}px type"))
    for a in range(len(lyr)):
        for b in range(a + 1, len(lyr)):
            A, B = lyr[a], lyr[b]
            both_settled = A["state"] == "settled" and B["state"] == "settled"
            # mid-animation counts too when both are clearly visible (a slow exit under a new line)
            both_visible = A["op"] > 0.5 and B["op"] > 0.5 and A["text"] != B["text"]
            if not (both_settled or both_visible):
                continue
            o = inter(A, B)
            if o > 0.1 * min(A["w"] * A["h"], B["w"] * B["h"]):
                kind = "overlap" if both_settled else "crossing"
                issues.append((kind, f, f"{A['text']} / {B['text']}", [A, B], f"{100 * o / min(A['w'] * A['h'], B['w'] * B['h']):.0f}% covered"))
    for i in settled:
        for m in imgs:
            o = inter(i, m)
            if o > 0.25 * i["w"] * i["h"]:
                issues.append(("over-image", f, i["text"], [i, m], f"on {Path(m['text']).name}"))
    # someone is singing but nothing is on screen
    # chants and shouts are single hits by design, so only verse and drop lines count
    singing = any(l["mode"] in ("verse", "drop") and l["start"] + 0.15 <= t <= min(l["end"], l["out"]) - 0.05 for l in lines)
    if singing and not [i for i in lyr if i["op"] > 0.3]:
        gaps.append(f)

# contrast needs the pixels
img_cache = {}
for f in frames:
    r = records[f]
    pal = r.get("palette", {})
    for i in r["items"]:
        if i["kind"] != "lyric" or i["state"] != "settled" or i["op"] < 0.6:
            continue
        p = frame_path(f)
        if not p:
            continue
        if f not in img_cache:
            img_cache = {f: Image.open(p).convert("RGB")}
        img = img_cache[f]
        others = [o for o in r["items"] if o is not i and o["kind"] == "lyric" and o["op"] > 0.08 and o["w"] > 0]
        c, spread = contrast_of(img, i, pal, others)
        if c is not None and c < 3:
            issues.append(("contrast", f, i["text"], [i], f"contrast {c:.1f}:1" + (", busy background" if spread > 0.3 else "")))

# group repeats of the same problem on the same text into one finding with a time range
step = meta["every"]
groups = []
for kind, f, text, boxes, detail in sorted(issues, key=lambda x: (x[0], x[2], x[1])):
    g = groups[-1] if groups else None
    if g and g["kind"] == kind and g["text"] == text and f - g["last"] <= step * 2:
        g["last"] = f
        g["n"] += 1
    else:
        groups.append({"kind": kind, "text": text, "first": f, "last": f, "n": 1, "boxes": boxes, "detail": detail})
runs = []
for f in gaps:
    if runs and f - runs[-1][1] <= step * 1.5:
        runs[-1][1] = f
    else:
        runs.append([f, f])
gap_runs = [r for r in runs if r[1] - r[0] >= step]  # at least two samples in a row

ORDER = {"off-frame": 0, "overlap": 1, "crossing": 2, "gap": 3, "contrast": 4, "tiny": 5, "over-image": 6}
findings = groups
for a, b in gap_runs:
    findings.append({"kind": "gap", "text": "", "first": a, "last": b, "n": (b - a) // step + 1, "boxes": [], "detail": f"{(b - a) / fps:.1f}s with no lyric on screen"})
findings.sort(key=lambda x: (ORDER[x["kind"]], x["first"]))
# a crossing is one line animating over another; a split second of it is a transition, longer is a pile-up
serious = [x for x in findings if x["kind"] in ("off-frame", "overlap", "gap") or (x["kind"] == "crossing" and x["last"] > x["first"]) or (x["kind"] == "contrast" and float(x["detail"].split()[1].split(":")[0]) < 2)]

out = [f"# Check: {timeline.get('title') or proj.name}", ""]
out.append(f"{len(frames)} frames checked ({len(frames) / max(1, (frames[-1] - frames[0]) / fps):.1f}/s). "
           f"{len(serious)} must-fix, {len(findings) - len(serious)} to look at.")
out.append("")
for x in findings:
    when = stamp(x["first"]) if x["first"] == x["last"] else f"{stamp(x['first'])}-{stamp(x['last'])}"
    mark = "FIX " if x in serious else "look"
    out.append(f"- [{mark}] {x['kind']:<10} {when:<15} {section_at(x['first'] / fps):<14} {x['text'][:60]!r} {x['detail']}")
if not findings:
    out.append("No problems found.")
(chk / "report.md").write_text("\n".join(out) + "\n", encoding="utf-8")


def thumb(f, w=480, boxes=(), label=""):
    p = frame_path(f)
    im = Image.open(p).convert("RGB") if p else Image.new("RGB", (int(W * scale), int(H * scale)))
    d = ImageDraw.Draw(im)
    for b in boxes:
        d.rectangle([b["x"] * scale, b["y"] * scale, (b["x"] + b["w"]) * scale, (b["y"] + b["h"]) * scale], outline=(255, 40, 40), width=3)
    im = im.resize((w, round(w * im.height / im.width)))
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, w, 18], fill=(0, 0, 0))
    d.text((4, 3), label, fill=(255, 255, 255))
    return im


def sheet(tiles, cols, path):
    if not tiles:
        return
    w, h = tiles[0].size
    rows = math.ceil(len(tiles) / cols)
    s = Image.new("RGB", (cols * w + (cols - 1) * 4, rows * h + (rows - 1) * 4), (40, 40, 40))
    for k, im in enumerate(tiles):
        s.paste(im, ((k % cols) * (w + 4), (k // cols) * (h + 4)))
    s.save(path)


issue_tiles = []
for x in findings[:24]:
    f = (x["first"] + x["last"]) // 2 // step * step
    f = min(records, key=lambda g: abs(g - f))
    issue_tiles.append(thumb(f, boxes=x["boxes"], label=f"{x['kind']} {stamp(f)} {x['text'][:40]}"))
sheet(issue_tiles, 4, chk / "issues.png")

n = 30
pick = [frames[round(k * (len(frames) - 1) / (n - 1))] for k in range(n)]
sheet([thumb(f, w=384, label=f"{stamp(f)} {section_at(f / fps)}") for f in pick], 6, chk / "overview.png")

print("\n".join(out))
print(f"\nsheets: {chk / 'overview.png'}" + (f"  {chk / 'issues.png'}" if issue_tiles else ""))
