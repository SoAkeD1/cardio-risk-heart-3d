"""Narration in the presenter's own (cloned) voice, generated locally with F5-TTS. Nothing is uploaded.

    video/.tts-venv/Scripts/python video/pipeline/clone_voice.py [--scenes s00_cold,s01_problem] [--ref path]

Reference: video/voice/clone/my_voice.(wav|m4a|mp3|...) reading REF_TEXT word for word.
Timing: every sentence is generated at exactly the length the AI narration used for it (F5-TTS fix_duration)
and placed at the same moment, so the captured app actions still land on their cue words.
Output: video/voice/record_here/<scene>.wav  ->  then `python video/make_video.py --own-voice --skip-capture`.

Model: F5-TTS v1 Base (code MIT; pretrained weights CC BY-NC 4.0: non-commercial use only).
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import time
from pathlib import Path

import numpy as np
import soundfile as sf

sys.path.insert(0, str(Path(__file__).parent))
from script import VIDEO, parse  # noqa: E402

REF_TEXT = ("Hi, I'm from Team HAVOC, and this is CardioLens. It shows where coronary risk is likely to be, "
            "artery by artery, on an interactive 3D heart.")
CLONE = VIDEO / "voice" / "clone"
OUT = VIDEO / "voice" / "record_here"
SR = 24000


def prep_reference(src: Path) -> Path:
    """mono 24 kHz, high-pass, leading/trailing silence trimmed, at most 12 s (F5-TTS works best with <= 12 s)."""
    dst = CLONE / "ref_24k.wav"
    af = ("highpass=f=70,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.1,"
          "areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.25,areverse,"
          "loudnorm=I=-20:TP=-2")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(src), "-af", af, "-ac", "1", "-ar", str(SR), "-t", "12", str(dst)], check=True)
    return dst


def sentences(text: str, words: list) -> list[tuple[str, float, float]]:
    """Split the scene text into sentences with their start/end time in the AI narration."""
    parts = [p.strip() for p in re.split(r"(?<=[.?!])\s+", text) if p.strip()]
    out, wi = [], 0
    for p in parts:
        n = len(p.split())
        ws = words[wi:wi + n] or words[-1:]
        out.append((p, ws[0][0], ws[-1][1]))
        wi += n
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--scenes", default="", help="comma-separated scene ids (default: all)")
    ap.add_argument("--ref", default="", help="reference recording (default: video/voice/clone/my_voice.*)")
    ap.add_argument("--nfe", type=int, default=32, help="flow steps: 32 = default quality, 16 = faster")
    ap.add_argument("--out", default=str(OUT), help="output folder (default: video/voice/record_here)")
    a = ap.parse_args()
    src = Path(a.ref) if a.ref else next((p for p in sorted(CLONE.glob("my_voice.*"))), None)
    if not src or not src.exists():
        sys.exit(f"Put your recording at {CLONE / 'my_voice.wav'} (any audio format), reading:\n  {REF_TEXT}")
    ref = prep_reference(src)
    ref_dur = sf.info(str(ref)).duration
    print(f"reference: {src.name} -> {ref_dur:.1f} s")

    import torch
    import torchaudio

    # torchaudio >= 2.9 decodes through torchcodec, which needs FFmpeg *shared* DLLs. The reference is already a
    # clean 24 kHz WAV, so read it with soundfile instead (same (channels, frames) tensor + sample rate).
    def _load(path, *args, **kwargs):
        data, sr = sf.read(str(path), dtype="float32", always_2d=True)
        return torch.from_numpy(data.T.copy()), sr

    torchaudio.load = _load
    from f5_tts.api import F5TTS  # imported late: loads torch + downloads weights on first run

    tts = F5TTS(model="F5TTS_v1_Base", device="cpu")
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    want = {s for s in a.scenes.split(",") if s}
    t_all = time.time()
    for sc in parse():
        if want and sc.id not in want:
            continue
        ai = json.loads((VIDEO / "voice" / "ai" / f"{sc.id}.json").read_text(encoding="utf-8"))
        total = ai["duration"]
        track = np.zeros(int(total * SR) + SR, dtype=np.float32)
        t0 = time.time()
        for text, s, e in sentences(sc.text, ai["words"]):
            dur = max(0.6, e - s + 0.15)
            wav, sr, _ = tts.infer(ref_file=str(ref), ref_text=REF_TEXT, gen_text=text, nfe_step=a.nfe,
                                   fix_duration=ref_dur + dur, remove_silence=False, show_info=lambda *_: None)
            wav = np.asarray(wav, dtype=np.float32)
            if sr != SR:
                import librosa
                wav = librosa.resample(wav, orig_sr=sr, target_sr=SR)
            i = int(s * SR)
            seg = wav[: max(0, len(track) - i)]
            # short fades so sentence joins never click
            f = min(len(seg) // 4, int(0.012 * SR))
            if f > 0:
                seg[:f] *= np.linspace(0, 1, f)
                seg[-f:] *= np.linspace(1, 0, f)
            track[i:i + len(seg)] += seg
        track = track[: int(total * SR)]
        sf.write(str(out / f"{sc.id}.wav"), track, SR)
        print(f"{sc.id:18s} {total:5.1f} s audio in {time.time() - t0:5.1f} s", flush=True)
    print(f"done in {(time.time() - t_all) / 60:.1f} min -> {out}")


if __name__ == "__main__":
    main()
