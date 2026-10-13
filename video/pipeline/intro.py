"""15-second intro: the same captured app clips and visual language as the demo, cut on narration cue words.

    .venv/Scripts/python video/pipeline/intro.py   ->  editor/src/intro.gen.json + public/voice/intro.wav
    then: cd video/editor && npx remotion render src/index.ts Intro ../out/intro_raw.mp4
"""
from __future__ import annotations

import asyncio
import json
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from assemble import captions_for  # noqa: E402
from script import VIDEO  # noqa: E402

PUB = VIDEO / "editor" / "public"
VOICE = "en-US-AndrewNeural"
TOTAL = 15.0
LEAD = 0.35
# {cue} = cut to the next shot on this word
SCRIPT = ("{heart}CardioLens turns routine clinical data into a 3D heart. {lad}Each artery gets its own calibrated risk, "
          "{why}explained with SHAP, {live}and updated live as you change an input.")
# shot: (cue, capture clip, source start = mark time + offset, lower-third, zoom (scale, focus x, y))
SHOTS = [
    ("heart", "s00_cold", ("loaded", -1.5), "55 routine measurements → calibrated CAD + LAD / LCX / RCA risk", (1.08, 760, 560)),
    ("lad", "s05f_3d", ("hover_lad", -0.5), "Hover or click an artery: probability · threshold · reliability", (1.12, 760, 560)),
    ("why", "s05i_why", ("why", 0.4), "Why? SHAP in probability points, for each artery", (1.30, 1714, 420)),
    ("live", "s05d_live", ("toast_htn", -1.3), "Live: Hypertension off → CAD −21 pts", (1.25, 920, 230)),
]


async def synth(text: str, mp3: Path) -> list:
    import edge_tts

    words = []
    for attempt in range(8):
        words = []
        try:
            with open(mp3, "wb") as f:
                async for ch in edge_tts.Communicate(text, VOICE, rate="-5%", boundary="WordBoundary").stream():
                    if ch["type"] == "audio":
                        f.write(ch["data"])
                    elif ch["type"] == "WordBoundary":
                        s = ch["offset"] / 1e7
                        words.append([round(s, 3), round(s + ch["duration"] / 1e7, 3), ch["text"]])
            return words
        except edge_tts.exceptions.NoAudioReceived:
            await asyncio.sleep(5 + 8 * attempt)
    raise RuntimeError("TTS failed")


# own voice: the presenter's opening line, cut straight from their reading (record_here/s00_cold.wav)
SCRIPT_OWN = ("{heart}This is CardioLens. Routine clinical data goes in, and a 3D heart shows where coronary risk is "
              "likely to be, {lad}artery by artery.")


def main() -> None:
    import shutil

    own = "--own" in sys.argv
    script = SCRIPT_OWN if own else SCRIPT
    cues, out, pos = {}, [], 0
    for m in re.finditer(r"\{(\w+)\}", script):
        out.append(script[pos:m.start()])
        cues[m.group(1)] = len("".join(out))
        pos = m.end()
    out.append(script[pos:])
    text = re.sub(r"\s+", " ", "".join(out)).strip()

    (PUB / "voice").mkdir(parents=True, exist_ok=True)
    if own:
        v = json.loads((VIDEO / "voice" / "out" / "s00_cold.json").read_text(encoding="utf-8"))
        assert v.get("source") == "own", "run tts.py --own first"
        shutil.copy2(VIDEO / "voice" / "out" / "s00_cold.wav", PUB / "voice" / "intro.wav")
        words, dur = v["words"], v["duration"]
    else:
        tmp = VIDEO / "voice" / "ai"
        tmp.mkdir(parents=True, exist_ok=True)
        mp3 = tmp / "intro.mp3"
        words = asyncio.run(synth(text, mp3))
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(mp3), "-ar", "48000", "-ac", "1", str(PUB / "voice" / "intro.wav")], check=True)
        dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(mp3)],
                                   capture_output=True, text=True, check=True).stdout)

    # cue -> time of the first word at/after the cue's character offset (picture time = LEAD + voice time)
    starts, p = [], 0
    for w in words:
        i = text.find(w[2], p)
        starts.append(i if i >= 0 else p)
        p = (i + len(w[2])) if i >= 0 else p
    ct = {n: LEAD + next(w[0] for w, c in zip(words, starts) if c >= off) for n, off in cues.items()}
    ct["heart"] = 0.0
    if own:  # one sentence of voice: the last two shots follow it, carried by their lower-thirds
        ct["why"] = LEAD + dur + 0.25
        ct["live"] = ct["why"] + (TOTAL - 2.0 - ct["why"]) / 2
        end_card = TOTAL - 2.0
    else:
        end_card = min(TOTAL - 2.0, LEAD + dur + 0.45)
    shots = []
    for i, (cue, clip, (mark, off), lower, zoom) in enumerate(SHOTS):
        meta = json.loads((VIDEO / "raw" / f"{clip}.json").read_text(encoding="utf-8"))
        mt = next(m["t"] for m in meta["marks"] if m["name"] == mark)
        a = ct[cue]
        b = ct[SHOTS[i + 1][0]] if i + 1 < len(SHOTS) else end_card
        shots.append({"clip": f"clips/{clip}.mp4", "from": round(a, 3), "to": round(b, 3),
                      "src": round(meta["handle"] + mt + off, 3), "lower": lower,
                      "zoom": {"s": zoom[0], "x": zoom[1], "y": zoom[2]}})
    short = [s for s in shots if s["to"] - s["from"] < 1.5]
    caps = captions_for(text, words, LEAD)
    spec = {"fps": 30, "duration": TOTAL, "lead": LEAD, "voice": round(dur, 3), "endCard": round(end_card, 3),
            "audio": "voice/intro.wav", "shots": shots, "captions": caps, "text": text}
    (VIDEO / "editor" / "src" / "intro.gen.json").write_text(json.dumps(spec, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"voice {dur:.2f}s, end card at {end_card:.2f}s; shots:", [(s["clip"].split("/")[-1], s["from"], s["to"]) for s in shots])
    if short:
        print("WARNING: shots shorter than 1.5 s:", short)


if __name__ == "__main__":
    main()
