"""Narration audio per scene.

AI voice (default): edge-tts neural voice, rate -5%, with word timings -> cue times.
Own voice: if video/voice/record_here/<scene>.wav exists (and --own is passed), it is cleaned
(denoise, 80 Hz high-pass, de-ess, compress, loudness) and used instead; cue times are then
re-mapped proportionally from the AI timing (good enough for a calm read of the same script).

Writes video/voice/out/<scene>.wav + video/voice/out/<scene>.json
{duration, cues: {name: seconds}, words: [[start, end, text]], source}.
Also writes the per-scene recording scripts to video/voice/record_here/<scene>.txt.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from script import VIDEO, Scene, parse  # noqa: E402

VOICE = "en-US-AndrewNeural"
RATE = "-5%"
AI = VIDEO / "voice" / "ai"
OUT = VIDEO / "voice" / "out"
REC = VIDEO / "voice" / "record_here"


def probe_duration(p: Path) -> float:
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(p)],
                       capture_output=True, text=True, check=True)
    return float(r.stdout.strip())


async def synth(sc: Scene, force: bool) -> dict:
    import edge_tts

    mp3, meta = AI / f"{sc.id}.mp3", AI / f"{sc.id}.json"
    if meta.exists() and mp3.exists() and not force:
        m = json.loads(meta.read_text(encoding="utf-8"))
        if m.get("text") == sc.text and m.get("voice") == VOICE:
            return m
    for attempt in range(8):  # the service rate-limits and then returns no audio; retry with back-off
        words: list[list] = []
        try:
            comm = edge_tts.Communicate(sc.text, VOICE, rate=RATE, boundary="WordBoundary")
            with open(mp3, "wb") as f:
                async for ch in comm.stream():
                    if ch["type"] == "audio":
                        f.write(ch["data"])
                    elif ch["type"] == "WordBoundary":
                        s = ch["offset"] / 1e7
                        words.append([round(s, 3), round(s + ch["duration"] / 1e7, 3), ch["text"]])
            break
        except edge_tts.exceptions.NoAudioReceived:
            if attempt == 7:
                raise
            await asyncio.sleep(5 + 8 * attempt)
    # cue -> time of the first word that starts at/after the cue's character offset
    starts, pos = [], 0
    for w in words:
        i = sc.text.find(w[2], pos)
        starts.append(i if i >= 0 else pos)
        pos = (i + len(w[2])) if i >= 0 else pos
    cues = {}
    for name, off in sc.cues.items():
        t = next((w[0] for w, c in zip(words, starts) if c >= off), words[-1][0] if words else 0.0)
        cues[name] = round(t, 3)
    await asyncio.sleep(2)  # pace requests
    m = {"id": sc.id, "voice": VOICE, "rate": RATE, "text": sc.text, "words": words, "cues": cues,
         "duration": round(probe_duration(mp3), 3)}
    meta.write_text(json.dumps(m, indent=1), encoding="utf-8")
    return m


def clean_own(src: Path, dst: Path) -> None:
    # denoise -> high-pass 80 Hz -> de-ess -> gentle compression -> loudness normalise (final mix does -14 LUFS)
    af = ("afftdn=nf=-25,highpass=f=80,deesser=i=0.4,"
          "acompressor=threshold=-20dB:ratio=3:attack=10:release=120:makeup=2,loudnorm=I=-18:TP=-2:LRA=9")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(src), "-af", af, "-ar", "48000", "-ac", "1", str(dst)],
                   check=True)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true", help="re-synthesise every scene")
    ap.add_argument("--own", action="store_true", help="use video/voice/record_here/<scene>.wav where present")
    a = ap.parse_args()
    for d in (AI, OUT, REC):
        d.mkdir(parents=True, exist_ok=True)
    scenes = parse()
    total = 0.0
    for sc in scenes:
        m = asyncio.run(synth(sc, a.force))
        own = REC / f"{sc.id}.wav"
        wav = OUT / f"{sc.id}.wav"
        if a.own and own.exists():
            clean_own(own, wav)
            d = probe_duration(wav)
            timing = REC / f"{sc.id}.timing.json"  # real word timings (split_own.py) beat proportional re-mapping
            if timing.exists():
                tj = json.loads(timing.read_text(encoding="utf-8"))
                info = {"duration": round(d, 3), "cues": tj["cues"], "words": tj["words"], "source": "own"}
            else:
                k = d / m["duration"]
                info = {"duration": round(d, 3), "cues": {n: round(t * k, 3) for n, t in m["cues"].items()},
                        "words": [[s * k, e * k, w] for s, e, w in m["words"]], "source": "own"}
        else:
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(AI / f"{sc.id}.mp3"), "-ar", "48000", "-ac", "1",
                            str(wav)], check=True)
            info = {"duration": probe_duration(wav), "cues": m["cues"], "words": m["words"], "source": f"ai:{VOICE}"}
        (OUT / f"{sc.id}.json").write_text(json.dumps({"id": sc.id, **info}, indent=1), encoding="utf-8")
        (REC / f"{sc.id}.txt").write_text(
            f"Scene {sc.id}: {sc.title}\nTarget length: about {m['duration']:.0f} s (calm pace, ~145 words/min)\n"
            f"Save your recording as: {sc.id}.wav (this folder)\n\n{sc.text}\n", encoding="utf-8")
        total += info["duration"]
        print(f"{sc.id:18s} {info['duration']:6.2f}s  cues={info['cues']}")
    print(f"speech total: {total:.1f}s")


if __name__ == "__main__":
    main()
