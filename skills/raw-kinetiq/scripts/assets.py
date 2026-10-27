"""Bring the user's images into a project.

Usage: python assets.py <project dir> <image or folder> [...] [--cutout NAME[,NAME...] | --cutout-all] [--person]

Copies every image into video/public/assets/ (upright, at most 2560 px, PNG when it has
transparency, JPEG otherwise), and with --cutout cuts the subject out of the named ones
(NAME is the file name or its stem) into <name>.cut.png, trimmed to the subject. The default
model keeps the most striking object (which can be just a hand held up to the camera); add
--person when the subject is a person, to keep the whole figure. Always look at the result. The first
cutout installs rembg into the shared environment and downloads its model (~180 MB, once).

Prints each asset's path for config.json, size, shape, brightness and main colours (good
starting points for the palette), writes assets/index.json and assets/sheet.png to look at.
"""
import json
import re
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageOps

EXTS = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff", ".gif"}
MAX = 2560

args = sys.argv[1:]
if len(args) < 2:
    sys.exit(__doc__)
proj = Path(args[0])
cut_names, cut_all, person, sources = set(), False, False, []
i = 1
while i < len(args):
    if args[i] == "--cutout":
        cut_names |= {n.strip().lower() for n in args[i + 1].split(",") if n.strip()}
        i += 2
    elif args[i] == "--cutout-all":
        cut_all = True
        i += 1
    elif args[i] == "--person":
        person = True
        i += 1
    else:
        sources.append(Path(args[i]))
        i += 1

out_dir = proj / "video" / "public" / "assets"
out_dir.mkdir(parents=True, exist_ok=True)
files = []
for s in sources:
    if s.is_dir():
        files += sorted(p for p in s.iterdir() if p.suffix.lower() in EXTS)
    elif s.suffix.lower() in EXTS and s.exists():
        files.append(s)
    else:
        print(f"skipped (not an image or not found): {s}")


def slug(p):
    return re.sub(r"[^a-z0-9]+", "-", p.stem.lower()).strip("-") or "image"


def has_alpha(im):
    return im.mode in ("RGBA", "LA") and im.getchannel("A").getextrema()[0] < 250


def opaque(im, side):
    """The visible pixels of a (possibly cut-out) image, as an RGB strip."""
    small = im.convert("RGBA").resize((side, side))
    px = [p[:3] for p in (small.get_flattened_data() if hasattr(small, "get_flattened_data") else small.getdata()) if p[3] > 128]
    strip = Image.new("RGB", (max(1, len(px)), 1))
    strip.putdata(px or [(0, 0, 0)])
    return strip


def colours(im, n=5):
    small = opaque(im, 96)
    q = small.quantize(colors=n, method=Image.Quantize.MEDIANCUT)
    pal = q.getpalette()[: n * 3]
    counts = sorted(q.getcolors(), reverse=True)
    return [("#%02x%02x%02x" % tuple(pal[k * 3 : k * 3 + 3]), c) for c, k in counts]


remover = None


def cutout(im):
    global remover
    if remover is None:
        try:
            import rembg  # noqa: F401
        except ImportError:
            print("installing rembg (once)...")
            subprocess.check_call([sys.executable, "-m", "pip", "install", "-q", "rembg[cpu]"])
        from rembg import new_session, remove

        session = new_session("u2net_human_seg" if person else "isnet-general-use")
        remover = lambda x: remove(x, session=session)  # noqa: E731
    cut = remover(im.convert("RGB"))
    box = cut.getchannel("A").point(lambda a: 255 if a > 24 else 0).getbbox()
    if box:
        pad = int(0.02 * max(cut.size))
        cut = cut.crop((max(0, box[0] - pad), max(0, box[1] - pad), min(cut.width, box[2] + pad), min(cut.height, box[3] + pad)))
    return cut


index = []
for src in files:
    im = ImageOps.exif_transpose(Image.open(src))
    im = im.convert("RGBA") if im.mode in ("RGBA", "LA", "P") else im.convert("RGB")
    if max(im.size) > MAX:
        im.thumbnail((MAX, MAX), Image.LANCZOS)
    name = slug(src)
    alpha = im.mode == "RGBA" and has_alpha(im)
    dest = out_dir / f"{name}.{'png' if alpha else 'jpg'}"
    if alpha:
        im.save(dest)
    else:
        im.convert("RGB").save(dest, quality=92)
    made = [(dest, im, alpha)]
    if cut_all or src.name.lower() in cut_names or src.stem.lower() in cut_names or name in cut_names:
        c = cutout(im)
        cdest = out_dir / f"{name}.cut.png"
        c.save(cdest)
        made.append((cdest, c, True))
    for path, img, a in made:
        g = opaque(img, 64).convert("L")
        lum = sum(g.get_flattened_data() if hasattr(g, "get_flattened_data") else g.getdata()) / (g.width * 255)
        w, h = img.size
        shape = "portrait" if h > w * 1.15 else "landscape" if w > h * 1.15 else "square"
        entry = {
            "file": f"assets/{path.name}",
            "source": str(src),
            "size": [w, h],
            "shape": shape,
            "transparent": a,
            "brightness": round(lum, 2),
            "colors": [c for c, _ in colours(img)],
        }
        index.append(entry)
        print(f"{entry['file']:<40} {w}x{h} {shape:<9} {'cutout ' if a else ''}brightness {lum:.2f}  colours {' '.join(entry['colors'])}")

old = []
idx_path = out_dir / "index.json"
if idx_path.exists():
    old = [e for e in json.loads(idx_path.read_text()) if e["file"] not in {x["file"] for x in index}]
index = old + index
idx_path.write_text(json.dumps(index, indent=2) + "\n")

# a sheet to look at: every asset on a checkerboard (so cutouts show their edges), labelled
tiles = []
for e in index:
    p = proj / "video" / "public" / e["file"]
    if not p.exists():
        continue
    im = Image.open(p).convert("RGBA")
    im.thumbnail((300, 300))
    tile = Image.new("RGBA", (300, 320), (30, 30, 30, 255))
    d = ImageDraw.Draw(tile)
    for y in range(0, 300, 20):
        for x in range(0, 300, 20):
            if (x + y) // 20 % 2:
                d.rectangle([x, y, x + 19, y + 19], fill=(50, 50, 50, 255))
    tile.alpha_composite(im, ((300 - im.width) // 2, (300 - im.height) // 2))
    d.text((4, 304), Path(e["file"]).name[:44], fill=(255, 255, 255, 255))
    tiles.append(tile)
if tiles:
    cols = min(5, len(tiles))
    rows = -(-len(tiles) // cols)
    sheet = Image.new("RGB", (cols * 304, rows * 324), (20, 20, 20))
    for k, t in enumerate(tiles):
        sheet.paste(t.convert("RGB"), ((k % cols) * 304, (k // cols) * 324))
    sheet.save(out_dir / "sheet.png")
    print(f"\nsheet: {out_dir / 'sheet.png'}")
