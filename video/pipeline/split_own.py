"""Cut one continuous own-voice reading of NARRATION.md into per-scene WAVs, with real word timings.

    python video/pipeline/split_own.py [recording]   (default: video/voice/clone/my_voice_original.*)

Needs video/voice/clone/transcript.json (faster-whisper word timestamps of the recording).
The transcript is aligned to the script word by word (difflib), so captions keep the script's exact wording while
their timing, and every capture cue, follow the presenter's voice.
Writes video/voice/record_here/<scene>.wav + <scene>.timing.json {words: [[start, end, script word]], cues}.
"""
from __future__ import annotations

import difflib
import json
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from script import VIDEO, parse  # noqa: E402

CLONE = VIDEO / "voice" / "clone"
REC = VIDEO / "voice" / "record_here"


def norm(w: str) -> str:
    w = w.lower().replace("%", " percent")
    return re.sub(r"[^a-z0-9]", "", w)


def main() -> None:
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else next(CLONE.glob("my_voice_original.*"))
    tr = json.loads((CLONE / "transcript.json").read_text(encoding="utf-8"))
    tw = [w for s in tr for w in s["words"]]  # [start, end, word]
    scenes = parse()

    # script words with their scene and character offset
    sw = []  # (scene index, word, char start)
    for si, sc in enumerate(scenes):
        for m in re.finditer(r"\S+", sc.text):
            sw.append((si, m.group(0), m.start()))
    a = [norm(w) for _, w, _ in sw]
    b = [norm(w[2]) for w in tw]
    sm = difflib.SequenceMatcher(a=a, b=b, autojunk=False)
    t_start: list[float | None] = [None] * len(sw)
    t_end: list[float | None] = [None] * len(sw)
    for blk in sm.get_matching_blocks():
        for k in range(blk.size):
            t_start[blk.a + k] = tw[blk.b + k][0]
            t_end[blk.a + k] = tw[blk.b + k][1]
    matched = sum(x is not None for x in t_start)
    # unmatched script words (misheard / misread): interpolate between matched neighbours
    known = [i for i, x in enumerate(t_start) if x is not None]
    for i in range(len(sw)):
        if t_start[i] is None:
            lo = max((k for k in known if k < i), default=None)
            hi = min((k for k in known if k > i), default=None)
            if lo is None:
                t_start[i], t_end[i] = t_start[hi], t_start[hi]
            elif hi is None:
                t_start[i], t_end[i] = t_end[lo], t_end[lo]
            else:
                f = (i - lo) / (hi - lo)
                t_start[i] = t_end[lo] + (t_start[hi] - t_end[lo]) * f
                t_end[i] = t_start[i]
    print(f"aligned {matched}/{len(sw)} script words ({matched / len(sw) * 100:.1f} %) to {len(tw)} spoken words")

    REC.mkdir(parents=True, exist_ok=True)
    idx = {si: [i for i, (s, _, _) in enumerate(sw) if s == si] for si in range(len(scenes))}
    for si, sc in enumerate(scenes):
        ii = idx[si]
        first, last = ii[0], ii[-1]
        prev_end = t_end[idx[si - 1][-1]] if si > 0 else 0.0
        next_start = t_start[idx[si + 1][0]] if si + 1 < len(scenes) else t_end[last] + 1.0
        # cut in the pause: never into the previous/next scene's words
        a0 = max(prev_end + 0.02, t_start[first] - 0.15) if si > 0 else max(0.0, t_start[first] - 0.15)
        a1 = min(next_start - 0.02, t_end[last] + 0.25)
        words = [[round(t_start[i] - a0, 3), round(max(t_end[i], t_start[i] + 0.05) - a0, 3), sw[i][1]] for i in ii]
        cues = {}
        for name, off in sc.cues.items():
            k = next((i for i in ii if sw[i][2] >= off), last)
            cues[name] = round(t_start[k] - a0, 3)
        out = REC / f"{sc.id}.wav"
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", f"{a0:.3f}", "-to", f"{a1:.3f}", "-i", str(src),
                        "-ac", "1", "-ar", "48000", str(out)], check=True)
        (REC / f"{sc.id}.timing.json").write_text(json.dumps({"words": words, "cues": cues, "source": src.name,
                                                              "span": [round(a0, 3), round(a1, 3)]}, indent=1), encoding="utf-8")
        print(f"{sc.id:18s} {a0:7.2f}-{a1:7.2f}  ({a1 - a0:5.2f} s)  cues={cues}")


if __name__ == "__main__":
    main()
