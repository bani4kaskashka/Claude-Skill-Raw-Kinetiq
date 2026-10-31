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
And across the song (with the lyrics masked out):
  same-look   most sections look alike (must-fix), or a chorus looks just like its verse
  still       a section where the picture barely moves
  one-shot    one framing keeps coming back across the song, only re-tinted (must-fix past half the song)
And whether it is made for this song:
  no-design     work/design.md is missing (must-fix)
  no-signature  the choruses only use built-in moves, nothing written for this song (must-fix)
  borrowed      built-in moves and line styles made for earlier songs (slam, slash, cut, glitch, chant...)
  stock-world   every background is a built-in layer
And whether anything happens because of what the lines say (custom "moments"):
  no-storyboard work/storyboard.md is missing (must-fix)
  no-moments    no moments at all (must-fix)
  few-moments   fewer than one moment per 20 s of singing (must-fix under one per 40 s)
  bare          a long stretch of singing where nothing is drawn for the words
  timid-camera  most moments barely move the camera, or none dives or makes a big move (must-fix)

Writes check/report.md, check/issues.png (the flagged frames, problems boxed in red) and
check/overview.png (frames across the whole song, to judge the look and the flow) and
check/moments.png (every moment at its start, middle and end, to judge the drawings).
"""
import json
import math
import re
import sys
from pathlib import Path

from PIL import Image, ImageDraw

# transcripts can hold emoji; a Windows console would crash printing them
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

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
    # a moment's camera diving through the frame carries the words off with it: a transition
    if any(m.get("dive") for m in r.get("moments") or []):
        settled = []
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

# ---- the look across the song: section by section, with the lyrics masked out
GW, GH = 32, 18


def look_of(f):
    """32x18 thumbnail of a frame, and a mask of the cells that are not lyrics."""
    p = frame_path(f)
    if not p:
        return None
    im = Image.open(p).convert("RGB")
    m = Image.new("L", im.size, 255)
    d = ImageDraw.Draw(m)
    for i in records[f]["items"]:
        if i["kind"] == "lyric" and i["op"] > 0.05 and i["w"] > 0:
            pad = 0.15 * i["h"]
            d.rectangle([(i["x"] - pad) * scale, (i["y"] - pad) * scale, (i["x"] + i["w"] + pad) * scale, (i["y"] + i["h"] + pad) * scale], fill=0)
    a, mk = im.resize((GW, GH), Image.BOX), m.resize((GW, GH), Image.BOX)
    return [(a.getpixel((x, y)), mk.getpixel((x, y)) > 128) for y in range(GH) for x in range(GW)]


SW, SH = 64, 36


def shape_of(f):
    """Where the edges are (lines, horizons, shapes) at 64x36, lyrics masked: the framing of a shot,
    whatever its colours. Smooth light (vignettes, glows) has no edges, so dark shots don't all match."""
    p = frame_path(f)
    if not p:
        return None
    im = Image.open(p).convert("L").resize((SW + 1, SH + 1), Image.BOX)
    m = Image.new("L", Image.open(p).size, 255)
    d = ImageDraw.Draw(m)
    for i in records[f]["items"]:
        if i["kind"] == "lyric" and i["op"] > 0.05 and i["w"] > 0:
            pad = 0.15 * i["h"]
            d.rectangle([(i["x"] - pad) * scale, (i["y"] - pad) * scale, (i["x"] + i["w"] + pad) * scale, (i["y"] + i["h"] + pad) * scale], fill=0)
    mk = m.resize((SW, SH), Image.BOX)
    px = im.load()
    return [(abs(px[x + 1, y] - px[x, y]) + abs(px[x, y + 1] - px[x, y]), mk.getpixel((x, y)) > 200) for y in range(SH) for x in range(SW)]


def shape_mean(shapes):
    n = len(shapes)
    return [(sum(sh[k][0] for sh in shapes) / n, all(sh[k][1] for sh in shapes)) for k in range(len(shapes[0]))]


def shape_corr(A, B):
    xs, ys = zip(*[(a, b) for (a, ma), (b, mb) in zip(A, B) if ma and mb] or [(0, 0)])
    mx, my = sum(xs) / len(xs), sum(ys) / len(ys)
    sx = sum((x - mx) ** 2 for x in xs) ** 0.5
    sy = sum((y - my) ** 2 for y in ys) ** 0.5
    return sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / max(1e-6, sx * sy)


def look_dist(A, B):
    d = [sum(abs(pa[c] - pb[c]) for c in range(3)) / 3 for (pa, ma), (pb, mb) in zip(A, B) if ma and mb]
    return sum(d) / max(1, len(d)) / 255


def look_corr(A, B):
    """How alike the layout of light and dark is (1 = the same picture), whatever the brightness."""
    xs, ys = zip(*[(sum(pa) / 3, sum(pb) / 3) for (pa, ma), (pb, mb) in zip(A, B) if ma and mb] or [(0, 0)])
    mx, my = sum(xs) / len(xs), sum(ys) / len(ys)
    sx = sum((x - mx) ** 2 for x in xs) ** 0.5
    sy = sum((y - my) ** 2 for y in ys) ** 0.5
    return sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / max(1e-6, sx * sy)


def look_mean(looks):
    out = []
    for cells in zip(*looks):
        ok = [p for p, m in cells if m]
        out.append((tuple(sum(p[c] for p in ok) / len(ok) for c in range(3)), True) if ok else ((0, 0, 0), False))
    return out


sec_looks = []
for s in timeline["sections"]:
    fs = [f for f in frames if s["start"] <= f / fps < s["end"]][::2]
    looks = [x for x in (look_of(f) for f in fs) if x]
    if len(looks) < 3:
        continue
    move = sum(look_dist(a, b) for a, b in zip(looks, looks[1:])) / (len(looks) - 1)
    shapes = [x for x in (shape_of(f) for f in fs) if x]
    sec_looks.append({"s": s, "look": look_mean(looks), "shape": shape_mean(shapes), "move": move, "first": fs[0], "last": fs[-1]})
SHOT_CORR, SHOT_SHARE = 0.85, 0.4  # one-shot: same framing, and how much of the song it may fill
alike = lambda a, b: look_corr(a["look"], b["look"]) > 0.9 and look_dist(a["look"], b["look"]) < 0.04
song_look = []  # findings about the whole song, added to the report below
pairs = [(a, b) for i, a in enumerate(sec_looks) for b in sec_looks[i + 1:]]
if len(sec_looks) >= 4 and sum(alike(a, b) for a, b in pairs) >= 0.5 * len(pairs):
    song_look.append({"kind": "same-look", "text": "", "first": frames[0], "last": frames[-1], "n": 1, "boxes": [], "fix": True,
                      "detail": f"{100 * sum(alike(a, b) for a, b in pairs) / len(pairs):.0f}% of section pairs look alike: give sections their own scenes, camera and framing"})
else:
    for a, b in zip(sec_looks, sec_looks[1:]):
        if b["s"]["kind"] == "drop" and a["s"]["kind"] != "drop" and alike(a, b):
            song_look.append({"kind": "same-look", "text": f"{a['s']['name']} / {b['s']['name']}", "first": b["first"], "last": b["last"], "n": 1, "boxes": [],
                              "detail": "the chorus looks just like what comes before it"})
# one shot that keeps coming back: sections with the same framing (whatever their tint), wherever they are
root = list(range(len(sec_looks)))


def find(i):
    while root[i] != i:
        i = root[i]
    return i


for i, a in enumerate(sec_looks):
    for j in range(i + 1, len(sec_looks)):
        b = sec_looks[j]
        if shape_corr(a["shape"], b["shape"]) > SHOT_CORR:
            root[find(j)] = find(i)
clusters = {}
for i, x in enumerate(sec_looks):
    clusters.setdefault(find(i), []).append(x)
song_len = sum(x["s"]["end"] - x["s"]["start"] for x in sec_looks) or 1
big = max(clusters.values(), key=lambda c: sum(x["s"]["end"] - x["s"]["start"] for x in c), default=[])
share = sum(x["s"]["end"] - x["s"]["start"] for x in big) / song_len
if len(big) >= 3 and share > SHOT_SHARE and not any(x["kind"] == "same-look" and not x["text"] for x in song_look):
    song_look.append({"kind": "one-shot", "text": ", ".join(x["s"]["name"] for x in big), "first": big[0]["first"], "last": big[-1]["last"],
                      "n": 1, "boxes": [], "song": True, "fix": share > 0.5,
                      "detail": f"{100 * share:.0f}% of the song is one framing: give these sections their own shot "
                                "(scale, angle, what is in the frame), not just a new tint"})
for x in sec_looks:
    if x["move"] < 0.0025 and x["s"]["end"] - x["s"]["start"] > 6:
        song_look.append({"kind": "still", "text": x["s"]["name"], "first": x["first"], "last": x["last"], "n": 1, "boxes": [],
                          "detail": "the picture barely moves"})

# Is it made for this song? The built-in moves and line styles were made for earlier songs;
# reusing them by default is what makes videos look alike.
RECIPE_PARTS = {"aggressive": (("slam", "slash"), ("slam", "slash")), "bounce": (("pop", "push"), ("pop", "cut")),
                "pulse": (("rise", "cut"), ("slam", "cut")), "smooth": (("fade", "blur"), ("fade", "blur")),
                "story": (("type", "fade"), ("rise", "fade")), "anthem": (("rise", "fall"), ("drop", "fall"))}
BORROWED = {"slam", "slash", "cut", "glitch"}
BUILTIN_MODES = {"chant", "shout", "tunnel", "outro"}
cfg = json.loads((vid / "src/data/config.json").read_text(encoding="utf-8"))
own = records[frames[0]].get("custom") or {}
own_fx, own_layers, own_modes = (set(own.get(k, [])) for k in ("effects", "layers", "modes"))


def part_of(motion, mode, base):
    # (enter, exit) of a motion part after a recipe/override, like motion.ts merge()
    if isinstance(motion, str):
        b = RECIPE_PARTS.get(motion, RECIPE_PARTS["pulse"])
        return b[0 if mode == "verse" else 1]
    if not isinstance(motion, dict):
        return base
    name = motion.get("recipe") or motion.get("profile")
    b = RECIPE_PARTS[name][0 if mode == "verse" else 1] if name in RECIPE_PARTS else base
    o = motion.get(mode) or {}
    return (o.get("enter", b[0]), o.get("exit", b[1]))


song_parts = {m: part_of(cfg.get("motion"), m, RECIPE_PARTS["pulse"][0 if m == "verse" else 1]) for m in ("verse", "drop")}
secs = {s["name"]: s for s in timeline["sections"]}
uses = []  # (mode, enter, exit, own?) per sung line
for ln in timeline["lines"]:
    m = ln.get("mode")
    if m in ("verse", "drop"):
        en, ex = part_of(secs.get(ln.get("section"), {}).get("motion"), m, song_parts[m])
        uses.append((m, en, ex, en in own_fx or ex in own_fx))
    elif m:
        uses.append((m, None, None, m in own_modes))
borrowed = {}
for m, en, ex, mine in uses:
    for k in (en, ex):
        if k in BORROWED:
            borrowed[k] = borrowed.get(k, 0) + 1
    if m in BUILTIN_MODES and m not in own_modes:
        borrowed[f"{m} (built-in)"] = borrowed.get(f"{m} (built-in)", 0) + 1
peak = [u for u in uses if u[0] != "verse"] or uses
whole = {"first": frames[0], "last": frames[-1], "n": 1, "boxes": [], "song": True}
if not (proj / "work" / "design.md").exists():
    song_look.append({"kind": "no-design", "text": "", **whole, "fix": True,
                      "detail": "work/design.md is missing: write the song's concept, signature moves and shot list first (SKILL.md 2b)"})
if uses and not any(u[3] for u in peak):
    song_look.append({"kind": "no-signature", "text": "", **whole, "fix": True,
                      "detail": "the choruses only use built-in moves: write this song's own enter/exit in video/src/custom "
                                "(effects) from its central image and use it where the song peaks"})
if borrowed:
    song_look.append({"kind": "borrowed", "text": ", ".join(f"{k} x{v}" for k, v in sorted(borrowed.items(), key=lambda kv: -kv[1])), **whole,
                      "detail": "built-in moves made for earlier songs: keep one only if design.md says why this song needs it"})
named = set()
mot = cfg.get("motion")
if isinstance(mot, dict) and isinstance(mot.get("scenes"), dict):
    named |= {x for variants in mot["scenes"].values() for v in variants for x in v}
for s in timeline["sections"]:
    named |= set(s.get("scene") or [])
if not named & own_layers:
    song_look.append({"kind": "stock-world", "text": "", **whole,
                      "detail": "every background is a built-in layer: build the song's own world in video/src/custom (layers)"})

# Moments: things drawn and happening because of what a line says (custom "moments")
mom = {}  # name -> [(frame, p)]
cams = {}  # name -> [camera reports]
for f in frames:
    for m in records[f].get("moments") or []:
        mom.setdefault(m["name"], []).append((f, m["p"]))
        cams.setdefault(m["name"], []).append(m)
sung_at = lambda t: any(l.get("mode") and l["start"] <= t <= l["end"] for l in lines)
sung_time = sum(l["end"] - l["start"] for l in lines if l.get("mode"))
if not (proj / "work" / "storyboard.md").exists():
    song_look.append({"kind": "no-storyboard", "text": "", **whole, "fix": True,
                      "detail": "work/storyboard.md is missing: go through the lyrics line by line for what each one shows (SKILL.md 4b)"})
if not mom:
    song_look.append({"kind": "no-moments", "text": "", **whole, "fix": True,
                      "detail": "nothing happens because of what the lines say: draw the storyboard's moments in video/src/custom (moments)"})
elif len(mom) < sung_time / 20:
    song_look.append({"kind": "few-moments", "text": f"{len(mom)} for {sung_time:.0f}s of singing", **whole, "fix": len(mom) < sung_time / 40,
                      "detail": "aim for one every 10-20 s of singing, each chorus with its own"})
# How hard each moment moves its camera: zoom range, travel, a dive. A 1.1x push reads as a still.
def cam_move(v):
    zs = [c.get("z", 1) for c in v]
    xy = [(c.get("x", 0.5), c.get("y", 0.5)) for c in v]
    travel = max(math.dist(a, b) for a in xy for b in xy) if len(xy) > 1 else 0
    turn = max(c.get("r", 0) for c in v) - min(c.get("r", 0) for c in v)
    return {"zoom": max(zs) / max(1e-6, min(zs)), "travel": travel, "turn": turn, "dive": any(c.get("dive") for c in v)}


moves = {n: cam_move(v) for n, v in cams.items()}
timid = [n for n, c in moves.items() if not c["dive"] and c["zoom"] < 1.3 and c["travel"] < 0.12 and c["turn"] < 8]
big = [n for n, c in moves.items() if c["dive"] or c["zoom"] >= 1.8 or c["travel"] >= 0.3]
if moves and (len(timid) > len(moves) / 2 or not big):
    song_look.append({"kind": "timid-camera", "text": ", ".join(timid), **whole, "fix": True,
                      "detail": f"{len(timid)} of {len(moves)} moments barely move the camera"
                                + ("" if big else ", and none dives or makes a big move")
                                + ": go into the subject (a dive), push hard, whip, or pull back to reveal (a scroll that races past is fine)"})

if mom:
    # the longest stretch with singing in it and no moment on screen
    on = {f for v in mom.values() for f, _ in v}
    run, best = [], []
    for f in frames:
        if f in on:
            run = []
            continue
        run.append(f)
        sung = sum(1 for g in run if sung_at(g / fps)) * meta["every"] / fps
        if sung > 30 and len(run) > len(best):
            best = list(run)
    if best:
        detail = f"{(best[-1] - best[0]) / fps:.0f}s of singing with nothing drawn for the words"
        song_look.append({"kind": "bare", "text": "", "first": best[0], "last": best[-1], "n": 1, "boxes": [], "detail": detail})

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

ORDER = {"no-design": -3, "no-storyboard": -2.5, "no-moments": -2.2, "no-signature": -2, "off-frame": 0, "overlap": 1, "crossing": 2, "gap": 3, "contrast": 4, "tiny": 5, "over-image": 6,
         "same-look": 7, "one-shot": 7.5, "few-moments": 7.6, "bare": 7.7, "timid-camera": 7.8, "still": 8, "borrowed": 9, "stock-world": 10}
findings = groups + song_look
for a, b in gap_runs:
    findings.append({"kind": "gap", "text": "", "first": a, "last": b, "n": (b - a) // step + 1, "boxes": [], "detail": f"{(b - a) / fps:.1f}s with no lyric on screen"})
findings.sort(key=lambda x: (ORDER[x["kind"]], x["first"]))
# a crossing is one line animating over another; a split second of it is a transition, longer is a pile-up
serious = [x for x in findings if x.get("fix") or x["kind"] in ("off-frame", "overlap", "gap") or (x["kind"] == "crossing" and x["last"] > x["first"]) or (x["kind"] == "contrast" and float(x["detail"].split()[1].split(":")[0]) < 2)]

out = [f"# Check: {timeline.get('title') or proj.name}", ""]
out.append(f"{len(frames)} frames checked ({len(frames) / max(1, (frames[-1] - frames[0]) / fps):.1f}/s). "
           f"{len(serious)} must-fix, {len(findings) - len(serious)} to look at.")
out.append("")
for x in findings:
    when = stamp(x["first"]) if x["first"] == x["last"] else f"{stamp(x['first'])}-{stamp(x['last'])}"
    mark = "FIX " if x in serious else "look"
    if x.get("song"):
        out.append(f"- [{mark}] {x['kind']:<10} whole song      {x['detail']}" + (f": {x['text']}" if x["text"] else ""))
        continue
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
for x in [x for x in findings if not x.get("song")][:24]:
    f = (x["first"] + x["last"]) // 2 // step * step
    f = min(records, key=lambda g: abs(g - f))
    issue_tiles.append(thumb(f, boxes=x["boxes"], label=f"{x['kind']} {stamp(f)} {x['text'][:40]}"))
sheet(issue_tiles, 4, chk / "issues.png")

n = 30
pick = [frames[round(k * (len(frames) - 1) / (n - 1))] for k in range(n)]
sheet([thumb(f, w=384, label=f"{stamp(f)} {section_at(f / fps)}") for f in pick], 6, chk / "overview.png")

mtiles = []
for name, v in mom.items():
    for want in (0.1, 0.5, 0.9):
        f, p = min(v, key=lambda x: abs(x[1] - want))
        mtiles.append(thumb(f, w=384, label=f"{name} {stamp(f)} p={p:.1f}"))
sheet(mtiles, 3, chk / "moments.png")

print("\n".join(out))
print(f"\nsheets: {chk / 'overview.png'}" + (f"  {chk / 'issues.png'}" if issue_tiles else "") + (f"  {chk / 'moments.png'}" if mtiles else ""))
