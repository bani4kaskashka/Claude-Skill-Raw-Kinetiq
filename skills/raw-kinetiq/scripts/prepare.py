"""Everything the timeline needs from the audio, cached per step in <workdir>.

Usage: python prepare.py <song> <workdir> [--lyrics FILE] [--model large-v3] [--skip-vocals]

Writes (each step is skipped when its output already exists, so a rerun is cheap):
  analysis.json        tempo, beat grid, kick hits, per-frame (60 fps) energy curves
  vocals.wav           Demucs htdemucs vocal stem
  vocal_onsets.json    onsets in the vocal stem (where chopped chants land)
  vocal_activity.json  vocal loudness per 0.5 s
  whisper_full.json    Whisper word timestamps on the full mix   (+ .txt transcript)
  whisper_vocals.json  Whisper word timestamps on the vocal stem (+ .txt transcript)
  lyrics.txt           copied from --lyrics, else read from the file's own tags (Suno embeds them),
                       else lyrics.draft.txt is written from the transcript for you to clean up
"""
import argparse
import json
import shutil
import subprocess
import sys
import time
from pathlib import Path

import numpy as np

# transcripts can hold emoji; a Windows console would crash printing them
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

FPS = 60


def log(msg):
    print(msg, flush=True)


def analyze(audio, out):
    import librosa
    y, sr = librosa.load(audio, sr=44100, mono=True)
    dur = len(y) / sr
    hop = sr // FPS
    tempo, beats = librosa.beat.beat_track(y=y, sr=sr, hop_length=hop, units="time")
    S = np.abs(librosa.stft(y, n_fft=4096, hop_length=hop))
    freqs = librosa.fft_frequencies(sr=sr, n_fft=4096)

    def band(lo, hi):
        v = S[(freqs >= lo) & (freqs < hi)].mean(axis=0)
        return v / (np.percentile(v, 99) + 1e-9)

    sub, mid, high = band(25, 120), band(300, 3000), band(5000, 16000)
    rms = librosa.feature.rms(y=y, hop_length=hop)[0]
    rms = rms / (np.percentile(rms, 99) + 1e-9)
    flux = np.maximum(0, np.diff(sub, prepend=sub[0]))
    kicks = librosa.util.peak_pick(flux, pre_max=6, post_max=6, pre_avg=12, post_avg=12, delta=0.08, wait=12)
    n = int(np.ceil(dur * FPS))

    def fit(a):
        a = np.clip(a[:n], 0, 1.5)
        return np.pad(a, (0, max(0, n - len(a)))).round(3).tolist()

    sec = [round(float(rms[i * FPS:(i + 1) * FPS].mean()), 2) for i in range(int(dur))]

    # 24-band spectrum per frame for the visualiser backgrounds, each band scaled to its own peak
    mel = librosa.feature.melspectrogram(S=S ** 2, sr=sr, n_mels=24, fmin=30, fmax=14000)
    mel = librosa.power_to_db(mel, ref=np.max)
    lo, hi = np.percentile(mel, 30, axis=1, keepdims=True), np.percentile(mel, 99.5, axis=1, keepdims=True)
    spec = np.clip((mel - lo) / (hi - lo + 1e-9), 0, 1)[:, :n]
    spec = np.pad(spec, ((0, 0), (0, max(0, n - spec.shape[1]))))
    json.dump({
        "duration": round(dur, 3), "fps": FPS, "frames": n,
        "tempo": float(np.atleast_1d(tempo)[0]), "beats": np.round(beats, 3).tolist(),
        "kicks": (kicks / FPS).round(3).tolist(),
        "sub": fit(sub), "mid": fit(mid), "high": fit(high), "rms": fit(rms), "secRms": sec,
        "spec": [[round(float(v), 2) for v in frame] for frame in spec.T],
    }, open(out, "w"))


def separate(audio, work):
    import librosa
    import soundfile as sf
    import torch
    from demucs.apply import apply_model
    from demucs.pretrained import get_model

    model = get_model("htdemucs")
    model.eval()
    y, sr = librosa.load(audio, sr=model.samplerate, mono=False)
    if y.ndim == 1:
        y = np.stack([y, y])
    wav = torch.tensor(y, dtype=torch.float32)
    ref = wav.mean(0)
    wav = (wav - ref.mean()) / ref.std()
    with torch.no_grad():
        src = apply_model(model, wav[None], device="cpu", shifts=1, split=True, overlap=0.25, progress=False)[0]
    src = src * ref.std() + ref.mean()
    vocals = src[model.sources.index("vocals")].numpy()
    sf.write(work / "vocals.wav", vocals.T, model.samplerate)

    mono = vocals.mean(0)
    hop = 512
    env = librosa.onset.onset_strength(y=mono, sr=sr, hop_length=hop)
    rms = librosa.feature.rms(y=mono, hop_length=hop)[0]
    gate = np.percentile(rms, 60) * 0.5
    on = librosa.onset.onset_detect(onset_envelope=env, sr=sr, hop_length=hop, delta=0.12, wait=4)
    on = [round(float(librosa.frames_to_time(f, sr=sr, hop_length=hop)), 3) for f in on if rms[min(f + 2, len(rms) - 1)] > gate]
    json.dump(on, open(work / "vocal_onsets.json", "w"))
    per = int(sr / hop / 2)
    act = [round(float(rms[i:i + per].mean()), 4) for i in range(0, len(rms), per)]
    json.dump({"step": 0.5, "rms": act}, open(work / "vocal_activity.json", "w"))


_model = None


def transcribe(audio_path, out_json, model_name):
    """faster-whisper word timestamps. Audio is decoded with librosa: faster-whisper's own
    PyAV decoder breaks on some PyAV versions."""
    global _model
    import librosa
    from faster_whisper import WhisperModel
    if _model is None:
        _model = WhisperModel(model_name, device="cpu", compute_type="int8")
    pcm, _ = librosa.load(audio_path, sr=16000, mono=True)
    segs, _ = _model.transcribe(pcm, language="en", word_timestamps=True, vad_filter=False,
                                condition_on_previous_text=False, beam_size=5)
    words, lines = [], []
    for s in segs:
        lines.append(f"[{s.start:7.2f} -> {s.end:7.2f}] {s.text.strip()}")
        for w in s.words or []:
            words.append({"w": w.word.strip(), "s": round(w.start, 3), "e": round(w.end, 3), "p": round(w.probability, 3)})
    json.dump(words, open(out_json, "w"), indent=0)
    Path(out_json).with_suffix(".txt").write_text("\n".join(lines), encoding="utf-8")


def tag_lyrics(audio):
    """Lyrics embedded in the file's tags (Suno writes them as lyrics-eng), or None."""
    try:
        r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format_tags", "-of", "json", str(audio)],
                           capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=30)
        tags = json.loads(r.stdout or "{}").get("format", {}).get("tags", {})
    except Exception:
        return None
    for k, v in tags.items():
        if k.lower().startswith(("lyrics", "unsyncedlyrics", "uslt")) and len(v.strip()) > 20:
            return v.strip()
    return None


def tags(audio):
    try:
        r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format_tags=title,artist", "-of", "json", str(audio)],
                           capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=30)
        return json.loads(r.stdout or "{}").get("format", {}).get("tags", {})
    except Exception:
        return {}


def activity_ranges(work, thresh_ratio=0.3, min_gap=0.75):
    act = json.load(open(work / "vocal_activity.json"))
    rms, step = act["rms"], act["step"]
    nz = [v for v in rms if v > 1e-4]
    thr = (np.median(nz) if nz else 0) * thresh_ratio
    ranges, cur = [], None
    for i, v in enumerate(rms):
        t = i * step
        if v > thr:
            if cur and t - cur[1] <= min_gap:
                cur[1] = t + step
            else:
                if cur:
                    ranges.append(cur)
                cur = [t, t + step]
    if cur:
        ranges.append(cur)
    return [r for r in ranges if r[1] - r[0] >= 0.5]


def step(name, out, fn):
    if Path(out).exists():
        log(f"  {name}: cached")
        return
    t0 = time.time()
    log(f"  {name}: running...")
    fn()
    log(f"  {name}: done in {time.time() - t0:.0f}s")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("audio")
    ap.add_argument("work")
    ap.add_argument("--lyrics")
    ap.add_argument("--model", default="large-v3")
    ap.add_argument("--skip-vocals", action="store_true", help="no Demucs pass (faster, worse on chopped vocals)")
    a = ap.parse_args()
    audio, work = Path(a.audio).resolve(), Path(a.work).resolve()
    work.mkdir(parents=True, exist_ok=True)

    log("prepare:")
    step("beat + energy analysis", work / "analysis.json", lambda: analyze(audio, work / "analysis.json"))
    if not a.skip_vocals:
        step("vocal separation (Demucs)", work / "vocal_onsets.json", lambda: separate(audio, work))
    step("Whisper on full mix", work / "whisper_full.json", lambda: transcribe(audio, work / "whisper_full.json", a.model))
    if not a.skip_vocals:
        step("Whisper on vocal stem", work / "whisper_vocals.json",
             lambda: transcribe(work / "vocals.wav", work / "whisper_vocals.json", a.model))

    lyr = work / "lyrics.txt"
    if a.lyrics:
        shutil.copy(a.lyrics, lyr)
        log(f"  lyrics: copied from {a.lyrics}")
    elif lyr.exists():
        log("  lyrics: using existing lyrics.txt")
    elif (t := tag_lyrics(audio)):
        lyr.write_text(t + "\n", encoding="utf-8")
        log("  lyrics: read from the audio file's tags")
    else:
        draft = work / "lyrics.draft.txt"
        draft.write_text((work / "whisper_full.txt").read_text(encoding="utf-8"), encoding="utf-8")
        log("  lyrics: NONE found. Wrote lyrics.draft.txt from the transcript; clean it into lyrics.txt")

    ana = json.load(open(work / "analysis.json"))
    meta = tags(audio)
    json.dump({"title": meta.get("title", ""), "artist": meta.get("artist", "")}, open(work / "meta.json", "w"))
    log(f"\nduration {ana['duration']:.1f}s  tempo {ana['tempo']:.1f} BPM  bar {240 / ana['tempo']:.3f}s")
    log(f"tags: title={meta.get('title', '')!r} artist={meta.get('artist', '')!r}")
    log("energy per second: " + " ".join(f"{i}:{v:.2f}" for i, v in enumerate(ana["secRms"])))
    if (work / "vocal_activity.json").exists():
        log("vocals present: " + ", ".join(f"{s:.1f}-{e:.1f}" for s, e in activity_ranges(work)))
    for name in ("whisper_full.txt", "whisper_vocals.txt"):
        if (work / name).exists():
            log(f"\n--- {name} ---\n" + (work / name).read_text(encoding="utf-8"))


if __name__ == "__main__":
    sys.exit(main())
