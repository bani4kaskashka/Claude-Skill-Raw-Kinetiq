"""Lyrics + Whisper words + vocal onsets + beat analysis -> <video>/src/data/timeline.json + energy.json

Usage: python build_timeline.py <workdir> <video_dir> [--title T] [--artist A] [--reset-sections]

Our lyric text is the authority on WHAT is sung, Whisper on WHEN. Chopped chants Whisper
can't hear are placed on the vocal stem's onsets.

Section map: <workdir>/sections.json. The first run proposes one automatically (from the lyric
tags, the alignment and the vocal activity) and saves it; edit it and rerun to fix timing.
Per section you can set:
  start, end        seconds (the section's span on screen)
  kind              intro | verse | build | drop | break | outro   (drives energy of the visuals)
  lyrics            which lyric section (its id in lyrics.txt order, e.g. "Chorus 2") fills it
  lines             {"<line idx>": [from, to]} pin a line inside a window (chants: snapped to onsets)
  all               [line idx...] chant lines that get one hit per chop actually sung
  modes             {"<line idx>": "verse|drop|chant|tunnel|shout|outro|<custom>"} force a line's style
                    (custom = a line style written in video/src/custom)
  colors            this section's own palette {"bg", "text", "accent", "accent2", "dim"}
  motion            this section's own motion, same shape as config.json "motion" (src/motion.ts)
  scene             this section's own background layers by name, e.g. ["bokeh", "beams"]
  preferVocals      true: trust the vocal-stem transcript over the full-mix one here
  bars, fast, flashAt   break extras: bar counter in the HUD, full-speed marquee, extra flashes
Top level keys "tunnel" / "chant": words to force into those styles.
"""
import argparse
import json
import re
from difflib import SequenceMatcher
from pathlib import Path

ap = argparse.ArgumentParser()
ap.add_argument("work")
ap.add_argument("video")
ap.add_argument("--title")
ap.add_argument("--artist")
ap.add_argument("--reset-sections", action="store_true", help="re-propose sections.json from scratch")
args = ap.parse_args()

W = Path(args.work)
OUT = Path(args.video) / "src" / "data"
OUT.mkdir(parents=True, exist_ok=True)
# a rebuild keeps the title and artist given last time
PREV = json.load(open(OUT / "timeline.json", encoding="utf-8")) if (OUT / "timeline.json").exists() else {}

ana = json.load(open(W / "analysis.json"))
load = lambda name, default: json.load(open(W / name)) if (W / name).exists() else default
words_full = load("whisper_full.json", [])
words_voc = load("whisper_vocals.json", [])
vocal_onsets = load("vocal_onsets.json", [])
activity = load("vocal_activity.json", None)
meta = load("meta.json", {})

DUR = ana["duration"]
BPM = ana["tempo"]
BEAT = 60 / BPM
norm = lambda s: re.sub(r"[^a-z0-9]", "", s.lower().replace("'", ""))

KIND_WORDS = [
    ("intro", "intro"), ("pre-chorus", "build"), ("prechorus", "build"), ("post-chorus", "drop"),
    ("chorus", "drop"), ("hook", "drop"), ("refrain", "drop"), ("drop", "drop"),
    ("build", "build"), ("bridge", "build"), ("breakdown", "build"), ("beat switch", "build"),
    ("instrumental", "break"), ("interlude", "break"), ("solo", "break"), ("break", "break"),
    ("verse", "verse"), ("rap", "verse"), ("spoken", "verse"), ("outro", "outro"), ("end", "outro"),
]


def kind_of(name):
    low = name.lower()
    for key, kind in KIND_WORDS:
        if key in low:
            return kind
    return None


# ---------------------------------------------------------------- lyrics

def parse_lyrics():
    """-> list of sections {id, kind, lines:[{text, tokens, mode}]} in song order."""
    sections, seen = [], {}
    cur = None
    for raw in (W / "lyrics.txt").read_text(encoding="utf-8").splitlines():
        raw = raw.strip()
        if not raw:
            continue
        m = re.fullmatch(r"\[(.+?)\]", raw)
        if m:
            name = m.group(1).split("|")[0].strip()
            # production notes like [Next 8 bars: kick builds into a drop] are not sections
            kind = None if ":" in name or len(name.split()) > 4 else kind_of(name)
            if kind is None:
                continue
            seen[name] = seen.get(name, 0) + 1
            sid = name if seen[name] == 1 else f"{name} {seen[name]}"
            cur = {"id": sid, "kind": kind, "lines": []}
            sections.append(cur)
            continue
        if cur is None:
            cur = {"id": "Verse", "kind": "verse", "lines": []}
            sections.append(cur)
        cur["lines"].append({"text": raw})
    return sections


def repeated_word(text):
    toks = [norm(t) for t in re.split(r"[-,\s]+", text) if norm(t)]
    return (toks[0], len(toks)) if toks and len(set(toks)) == 1 else (None, 0)


def assign_modes(sections, overrides):
    # hook words: a word that makes up whole lines on its own, again and again
    counts = {}
    for s in sections:
        for l in s["lines"]:
            w, n = repeated_word(l["text"])
            if w:
                counts.setdefault(w, []).append((n, "-" in l["text"]))
    tunnel = set(overrides.get("tunnel", []))
    chant = set(overrides.get("chant", []))
    for w, uses in counts.items():
        if w in tunnel or w in chant:
            continue
        hyphen = any(h for _, h in uses)
        if hyphen or max(n for n, _ in uses) >= 4:
            chant.add(w)
        elif len(w) >= 5 and len(uses) >= 2:
            tunnel.add(w)
    for s in sections:
        for l in s["lines"]:
            w, n = repeated_word(l["text"])
            if s["kind"] == "outro" and n < 4:
                mode = "outro"  # the last words fade out, whatever they are
            elif w in chant:
                mode = "chant"
            elif w in tunnel:
                mode = "tunnel"
            elif w and n >= 2:
                mode = "shout"
            elif s["kind"] == "drop":
                mode = "drop"
            else:
                mode = "verse"
            l["mode"] = mode
            if mode in ("chant", "shout", "tunnel"):
                l["tokens"] = [t.rstrip(".") for t in re.split(r"[-,\s]+", l["text"]) if t.strip(".")]
            else:
                l["tokens"] = l["text"].split()
    return sorted(tunnel), sorted(chant)


# ---------------------------------------------------------------- alignment

def align_tokens(tokens, whisper, lo=-1.0, hi=1e9):
    """tokens: list of normalized words. -> {index: (s, e)} where Whisper heard them."""
    wv = [w for w in whisper if lo <= w["s"] < hi]
    b = [norm(w["w"]) for w in wv]
    sm = SequenceMatcher(None, tokens, b, autojunk=False)
    times = {}
    for op, i1, i2, j1, j2 in sm.get_opcodes():
        if op == "equal" or (op == "replace" and i2 - i1 == j2 - j1):
            for k in range(i2 - i1):
                # a replace only counts when the misheard word still looks like ours
                if op == "replace" and SequenceMatcher(None, tokens[i1 + k], b[j1 + k]).ratio() < 0.6:
                    continue
                times[i1 + k] = (wv[j1 + k]["s"], wv[j1 + k]["e"])
    return times


def monotonic(times):
    """Drop stray matches: keep the longest run of indices whose times only go forward."""
    idx = sorted(times)
    best, prev = [], {}
    tails = []  # (time, index) of the smallest tail for each length
    for i in idx:
        t = times[i][0]
        lo, hi = 0, len(tails)
        while lo < hi:
            mid = (lo + hi) // 2
            if times[tails[mid]][0] <= t:
                lo = mid + 1
            else:
                hi = mid
        prev[i] = tails[lo - 1] if lo else None
        if lo == len(tails):
            tails.append(i)
        else:
            tails[lo] = i
    k = tails[-1] if tails else None
    while k is not None:
        best.append(k)
        k = prev[k]
    return {i: times[i] for i in best}


def vocal_ranges(thresh_ratio=0.3, min_gap=0.75):
    if not activity:
        return [[0, DUR]]
    rms, step = activity["rms"], activity["step"]
    nz = sorted(v for v in rms if v > 1e-4)
    thr = (nz[len(nz) // 2] if nz else 0) * thresh_ratio
    out, cur = [], None
    for i, v in enumerate(rms):
        t = i * step
        if v > thr:
            if cur and t - cur[1] <= min_gap:
                cur[1] = t + step
            else:
                if cur:
                    out.append(cur)
                cur = [t, t + step]
    if cur:
        out.append(cur)
    return [r for r in out if r[1] - r[0] >= 0.5]


RHYTHMIC = ("chant", "shout", "tunnel")


def choose_per_line(lines_tokens, lo=-1.0, hi=1e9, prefer_vocals=False):
    """Align lines against both transcripts and, line by line, keep whichever heard more of it
    (mixing the two word by word scrambles lines). -> {(line, token): (s, e)}"""
    flat = [(k, ti, norm(t)) for k, toks in enumerate(lines_tokens) for ti, t in enumerate(toks)]
    toks = [f[2] for f in flat]
    a = align_tokens(toks, words_full, lo, hi)
    b = align_tokens(toks, words_voc, lo, hi)
    first, second = (b, a) if prefer_vocals else (a, b)
    out = {}
    for k in range(len(lines_tokens)):
        idx = [i for i, f in enumerate(flat) if f[0] == k]
        src = first if sum(i in first for i in idx) >= sum(i in second for i in idx) else second
        for i in idx:
            if i in src:
                out[i] = src[i]
    out = monotonic(out)
    return {(flat[i][0], flat[i][1]): v for i, v in out.items()}


def singing_segments(a, b, vr):
    segs = [(max(a, r[0]), min(b, r[1])) for r in vr if r[1] > a and r[0] < b]
    return [s for s in segs if s[1] - s[0] > 0.05] or [(a, b)]


def natural_length(line):
    """Roughly how long a line takes to sing: a repeated-word line is about a bar."""
    if line["mode"] in RHYTHMIC:
        return 4 * BEAT
    return len(line["tokens"]) * (0.45 if line["mode"] in ("drop", "outro") else 0.32)


def spread_over_singing(a, b, needs, vr, anchor_end=False):
    """Lay lines of natural lengths `needs` into (a, b), counting only time where someone is
    singing, so a run of unheard lines never lands inside an instrumental. If there is more
    singing time than they need, they keep their natural pace and sit at the start of the gap
    (they follow the previous line) or, with anchor_end, at its end (they lead into what follows)."""
    segs = singing_segments(a, b, vr)
    total = sum(e - s for s, e in segs)
    need = sum(needs)
    use = min(total, need * 1.15)
    offset = total - use if anchor_end else 0.0

    def at(p):  # p seconds of singing after a -> wall-clock time
        for s, e in segs:
            if p <= e - s:
                return s + p
            p -= e - s
        return segs[-1][1]

    out, acc = [], offset
    for n in needs:
        nxt = acc + use * n / need
        out.append([at(acc), at(nxt)])
        acc = nxt
    return out


def propose_sections(sections):
    """First guess at each lyric section's span and windows for the lines Whisper missed,
    plus breaks where nobody sings for a while."""
    lines = [(si, li, l) for si, s in enumerate(sections) for li, l in enumerate(s["lines"])]
    vr = vocal_ranges()
    first_voc = vr[0][0] if vr else 0
    last_voc = vr[-1][1] if vr else DUR

    # Anchor on distinctive lines only: a chant word like "cut" matches anywhere.
    anchor_ids = [k for k, (_, _, l) in enumerate(lines) if l["mode"] not in RHYTHMIC]
    heard = choose_per_line([lines[k][2]["tokens"] for k in anchor_ids])
    span = [None] * len(lines)
    for j, k in enumerate(anchor_ids):
        n = len(lines[k][2]["tokens"])
        ks = [v for (lj, _), v in heard.items() if lj == j]
        if ks and len(ks) >= max(1, n * 0.5):
            span[k] = [min(x[0] for x in ks), max(x[1] for x in ks)]

    # runs of lines nobody heard share the singing time between their heard neighbours
    guessed = set()
    k = 0
    while k < len(lines):
        if span[k]:
            k += 1
            continue
        j = k
        while j < len(lines) and not span[j]:
            j += 1
        a = span[k - 1][1] if k > 0 else first_voc
        b = span[j][0] if j < len(lines) else last_voc
        needs = [natural_length(lines[x][2]) for x in range(k, j)]
        # the intro leads into the first heard line; an outro trails off at the end of the vocals
        edge = k == 0 or j == len(lines)
        for x, sp in zip(range(k, j), spread_over_singing(a, b, needs, vr, anchor_end=edge)):
            span[x] = sp
            guessed.add(x)
        k = j

    spans = []
    for si, s in enumerate(sections):
        ks = [span[k] for k, (lsi, _, _) in enumerate(lines) if lsi == si]
        spans.append([min(x[0] for x in ks), max(x[1] for x in ks)] if ks else None)

    def silent_gap(a, b):
        """Longest stretch inside (a, b) with no vocals."""
        cuts = [a] + [x for r in vr for x in r if a < x < b] + [b]
        best = (a, a)
        pts = sorted(cuts)
        for x, y in zip(pts, pts[1:]):
            mid = (x + y) / 2
            singing = any(r[0] <= mid < r[1] for r in vr)
            if not singing and y - x > best[1] - best[0]:
                best = (x, y)
        return best

    out = []
    for si, s in enumerate(sections):
        if s["lines"]:
            entry = {"name": s["id"], "kind": s["kind"], "start": spans[si][0], "end": spans[si][1], "lyrics": s["id"]}
            wins, every = {}, []
            for k, (lsi, li, l) in enumerate(lines):
                if lsi == si and k in guessed:
                    wins[str(li)] = [round(span[k][0], 2), round(span[k][1], 2)]
                    if l["mode"] == "chant":
                        every.append(li)  # one hit per chop actually sung
            if wins:
                entry["lines"] = wins
            if every:
                entry["all"] = every
            out.append(entry)
        else:  # instrumental: the longest silence between its neighbours
            a = out[-1]["end"] if out else 0
            nb = next((spans[k][0] for k in range(si + 1, len(sections)) if spans[k]), DUR)
            g = silent_gap(a, nb)
            out.append({"name": s["id"], "kind": "break", "start": g[0], "end": g[1]})

    # long silences nobody claimed become instrumental breaks
    final = []
    for k, s in enumerate(out):
        final.append(s)
        nxt = out[k + 1]["start"] if k + 1 < len(out) else last_voc
        if s["kind"] != "break" and (k + 1 == len(out) or out[k + 1]["kind"] != "break"):
            g = silent_gap(s["end"], nxt)
            if g[1] - g[0] >= 8:
                final.append({"name": "Instrumental", "kind": "break", "start": g[0], "end": g[1]})

    # tie the spans together: every section runs until the next one starts
    final.sort(key=lambda s: s["start"])
    for k, s in enumerate(final):
        s["start"] = 0.0 if k == 0 else round(max(final[k - 1]["start"] + 0.5, s["start"] - 0.15), 2)
    for k, s in enumerate(final):
        s["end"] = round(final[k + 1]["start"] if k + 1 < len(final) else DUR, 2)
    # a long instrumental tail after the last vocal
    last = final[-1]
    if last["kind"] != "break" and DUR - last_voc > 10:
        cut = round(last_voc + 1.5, 2)
        last["end"] = cut
        final.append({"name": "Instrumental", "kind": "break", "start": cut, "end": round(DUR - 4, 2), "fast": True})
        final.append({"name": "End", "kind": "outro", "start": round(DUR - 4, 2), "end": round(DUR, 2)})
    # break extras: bar counter when it is a whole number of bars, full speed when the energy is high
    sec = ana["secRms"]
    loud = sorted(sec)[int(len(sec) * 0.8)] if sec else 1
    for s in final:
        if s["kind"] == "break":
            bars = (s["end"] - s["start"]) / (4 * BEAT)
            if abs(bars - round(bars)) < 0.25 and round(bars) >= 4:
                s["bars"] = int(round(bars))
            e = sec[int(s["start"]):int(s["end"]) + 1]
            if e and sum(e) / len(e) >= loud * 0.9:
                s["fast"] = True
    return final


# ---------------------------------------------------------------- per section

def pick_onsets(ons, n):
    if len(ons) > n:
        targets = [ons[0] + (ons[-1] - ons[0]) * k / max(1, n - 1) for k in range(n)] if n > 1 else [ons[0]]
        return [min(ons, key=lambda o: abs(o - g)) for g in targets]
    return ons if len(ons) == n else None


def build():
    sections = parse_lyrics()
    sec_path = W / "sections.json"
    cfg = json.load(open(sec_path)) if sec_path.exists() and not args.reset_sections else {}
    tunnel, chant = assign_modes(sections, cfg)
    if "sections" not in cfg:
        cfg = {"tunnel": tunnel, "chant": chant, "sections": propose_sections(sections)}
        json.dump(cfg, open(sec_path, "w"), indent=1)
        print(f"proposed {sec_path.name} (review it, edit, rerun)")
    SECTIONS = cfg["sections"]
    lyr = {s["id"]: s for s in sections}

    out_lines, notes = [], []
    for sec in SECTIONS:
        src = lyr.get(sec.get("lyrics", ""))
        if not src or not src["lines"]:
            continue
        sec_lines = src["lines"]
        for li, m in (sec.get("modes") or {}).items():
            sec_lines[int(li)]["mode"] = m
        lo, hi = sec["start"], sec["end"]
        times = choose_per_line([l["tokens"] for l in sec_lines], lo - 0.3, hi + 0.3, sec.get("preferVocals", False))
        windows = sec.get("lines", {})
        onsets = [o for o in vocal_onsets if lo - 0.05 <= o < hi]

        for li, l in enumerate(sec_lines):
            n = len(l["tokens"])
            tw = [times.get((li, ti)) for ti in range(n)]
            win = windows.get(str(li))
            at = (sec.get("at") or {}).get(str(li))
            if at:
                # word start times given by hand (by ear); a rhythmic line gets one hit per time
                if len(at) != n and l["mode"] in RHYTHMIC:
                    l["tokens"] = [l["tokens"][0]] * len(at)
                    n = len(at)
                at = (at + [at[-1] + 0.3 * k for k in range(1, n - len(at) + 1)])[:n]
                tw = [(a, min(at[q + 1] - 0.02, a + 0.45) if q + 1 < n else a + 0.5) for q, a in enumerate(at)]
            elif win and l["mode"] in ("chant", "shout", "tunnel", "outro"):
                ons = [o for o in onsets if win[0] - 0.05 <= o < win[1]]
                if li in sec.get("all", []) and ons:
                    # one hit per chop actually sung, at most one per 8th note
                    picks = []
                    for o in ons:
                        if not picks or o - picks[-1] >= BEAT / 2 * 0.7:
                            picks.append(o)
                    l["tokens"] = [l["tokens"][0]] * len(picks)
                    n = len(picks)
                else:
                    picks = pick_onsets(ons, n) or [win[0] + (win[1] - win[0]) * k / n for k in range(n)]
                tw = [(p, p + 0.15) for p in picks]
            elif win:
                tw = [x if x and win[0] - 0.2 <= x[0] <= win[1] else None for x in tw]
                if sum(x is None for x in tw) > n / 2:
                    tw = [(win[0] + (win[1] - win[0]) * k / n, win[0] + (win[1] - win[0]) * (k + 1) / n) for k in range(n)]
            l["times"] = tw
            l["guessed"] = sum(x is None for x in tw) / max(1, n)

        # holes: rhythmic lines go on vocal onsets in the gap, the rest are spread evenly
        order = [(li, ti) for li, l in enumerate(sec_lines) for ti in range(len(l["tokens"]))]
        k = 0
        while k < len(order):
            li, ti = order[k]
            if sec_lines[li]["times"][ti]:
                k += 1
                continue
            j = k
            while j < len(order) and not sec_lines[order[j][0]]["times"][order[j][1]]:
                j += 1
            a_t = sec_lines[order[k - 1][0]]["times"][order[k - 1][1]][1] if k > 0 else lo
            b_t = sec_lines[order[j][0]]["times"][order[j][1]][0] if j < len(order) else hi
            run = order[k:j]
            rhythmic = all(sec_lines[x[0]]["mode"] in ("chant", "shout", "tunnel") for x in run)
            picks = pick_onsets([o for o in onsets if a_t + 0.05 <= o < b_t - 0.05], len(run)) if rhythmic else None
            for r, (rli, rti) in enumerate(run):
                s = picks[r] if picks else a_t + (b_t - a_t) * (r + 1) / (len(run) + 1)
                sec_lines[rli]["times"][rti] = (s, s + 0.18)
            k = j

        for l in sec_lines:
            words = []
            for tok, (s, e) in zip(l["tokens"], l["times"]):
                e = min(max(e, s + 0.08), s + 1.2)
                words.append({"text": tok, "s": round(s, 3), "e": round(e, 3)})
            for q in range(1, len(words)):
                if words[q]["s"] < words[q - 1]["s"]:
                    words[q]["s"] = round(words[q - 1]["s"] + 0.02, 3)
            # words crammed closer than a 64th note apart: the line was squeezed into a gap
            squeezed = len(words) >= 3 and (words[-1]["s"] - words[0]["s"]) / (len(words) - 1) < BEAT / 16
            # or one word dragged seconds away from the rest: a stray match
            stray = l["mode"] not in RHYTHMIC and any(b["s"] - a["s"] > 3.0 for a, b in zip(words, words[1:]))
            out_lines.append({"section": sec["name"], "mode": l["mode"], "words": words,
                              "start": words[0]["s"], "end": max(w["e"] for w in words),
                              "guessed": 1.0 if squeezed or stray else l["guessed"]})

    out_lines.sort(key=lambda l: l["start"])
    hold = {"verse": 0.6, "drop": 1.1, "shout": 0.45, "chant": 0.5, "tunnel": 0.6, "outro": 1.5}
    for i, l in enumerate(out_lines):
        nxt = out_lines[i + 1]["start"] if i + 1 < len(out_lines) else DUR
        sec_end = next(s["end"] for s in SECTIONS if s["name"] == l["section"])
        gap = 0.6 if l["mode"] == "outro" else 0.02  # outro lines fade slowly; don't overlap the next
        l["out"] = round(min(nxt - gap, l["end"] + hold.get(l["mode"], 0.8), sec_end + 0.5), 3)
        if l["mode"] == "chant":
            l["out"] = round(l["end"] + 0.5, 3)
        l["start"], l["end"] = round(l["start"], 3), round(l["end"], 3)

    beats = ana["beats"]
    anchor = next((s["start"] for s in SECTIONS if s["kind"] == "verse"), out_lines[0]["start"] if out_lines else 0)
    a_i = min(range(len(beats)), key=lambda i: abs(beats[i] - anchor)) if beats else 0
    downbeats = [b for i, b in enumerate(beats) if (i - a_i) % 4 == 0]
    hooks = cfg.get("tunnel", []) + cfg.get("chant", [])

    timeline = {
        "duration": DUR,
        "title": args.title or meta.get("title") or PREV.get("title") or "UNTITLED",
        "artist": args.artist or meta.get("artist") or PREV.get("artist") or "",
        "bpm": round(BPM, 2),
        "hooks": [h.upper() for h in hooks] or [(args.title or "LYRICS").upper()],
        "sections": [{k: s[k] for k in ("name", "kind", "start", "end", "bars", "fast", "motion", "scene", "colors") if k in s} for s in SECTIONS],
        "lines": out_lines, "kicks": ana["kicks"], "beats": beats, "downbeats": downbeats,
        "flashes": sorted([s["start"] for s in SECTIONS if s["kind"] == "drop"] + [f for s in SECTIONS for f in s.get("flashAt", [])]),
    }
    json.dump(timeline, open(OUT / "timeline.json", "w"), indent=1)
    json.dump({"sub": ana["sub"], "rms": ana["rms"], "high": ana["high"], "spec": ana.get("spec", [])},
              open(OUT / "energy.json", "w"), separators=(",", ":"))

    print("\nsections:")
    for s in SECTIONS:
        print(f"  {s['start']:7.2f}-{s['end']:7.2f} {s['kind']:6s} {s['name']}")
    print("\nlines (CHECK = mostly guessed, not heard by Whisper):")
    for l in out_lines:
        flag = "CHECK " if l["guessed"] > 0.5 else "      "
        print(f"{flag}{l['start']:7.2f}-{l['out']:7.2f} {l['mode']:6s} {l['section'][:12]:12s} "
              + " ".join(f"{w['text']}@{w['s']:.2f}" for w in l["words"]))
    print(f"\ntunnel words: {cfg.get('tunnel')}  chant words: {cfg.get('chant')}")


build()
