"""One-command build of the CardioLens demo video.

    python video/make_video.py                  # everything: voice, capture, terminals, edit, mix, export, QA
    python video/make_video.py --skip-capture   # reuse video/raw/*.mp4
    python video/make_video.py --own-voice      # use video/voice/record_here/<scene>.wav where present

Needs: the project .venv (+ video/requirements.txt), Node 20+, ffmpeg, Microsoft Edge, and the app's production
server on :8000 built with test hooks (`CARDIOLENS_TEST_HOOKS=1 python scripts/build.py`, then
`python -m app.backend.main`, or Start CardioLens.bat). Blender is optional (asset validator clip + procedural render).
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
import urllib.request
from pathlib import Path

VIDEO = Path(__file__).resolve().parent
ROOT = VIDEO.parent
PY = str(ROOT / ".venv" / "Scripts" / "python.exe") if (ROOT / ".venv" / "Scripts" / "python.exe").exists() else sys.executable
NPX = "npx.cmd" if sys.platform == "win32" else "npx"
BLENDER = shutil.which("blender") or next((str(p) for p in Path("C:/Program Files/Blender Foundation").glob("*/blender.exe")), None)
OUT = VIDEO / "out"


def run(cmd: list[str], cwd: Path = ROOT, check: bool = True, capture: bool = False, **kw) -> subprocess.CompletedProcess:
    print("·", " ".join(str(c) for c in cmd), flush=True)
    return subprocess.run(cmd, cwd=cwd, check=check, text=True, capture_output=capture, encoding="utf-8", errors="replace", **kw)


def health() -> bool:
    try:
        return json.loads(urllib.request.urlopen("http://localhost:8000/api/health", timeout=5).read())["status"] == "ok"
    except Exception:
        return False


def terminals() -> None:
    """Real outputs for the terminal clips (video/qa/term_*.txt; first line is the command)."""
    qa = VIDEO / "qa"

    def save(name: str, cmd: str, lines: list[str]) -> None:
        (qa / f"term_{name}.txt").write_text("$ " + cmd + "\n" + "\n".join(lines) + "\n", encoding="utf-8")

    r = run([PY, "scripts/check_no_hardcoding.py"], capture=True, check=False)
    save("guard", "python scripts/check_no_hardcoding.py", (r.stdout + r.stderr).strip().splitlines()[-4:])
    r = run([PY, "-m", "pytest", "tests", "app/backend/tests", "-q", "-p", "no:cacheprovider"], capture=True, check=False)
    save("pytest", "python -m pytest -q", [l for l in r.stdout.splitlines() if re.search(r"passed|failed", l)][-1:])
    r = run([NPX, "vitest", "run"], cwd=ROOT / "app/frontend", capture=True, check=False)
    clean = re.sub(r"\x1b\[[0-9;]*m", "", r.stdout)
    save("vitest", "npx vitest run", [l.strip() for l in clean.splitlines() if re.search(r"Test Files|Tests ", l)])
    e2e = (qa / "e2e_run.txt")
    if e2e.exists():
        save("e2e", "npx playwright test", [l.strip() for l in e2e.read_text(encoding="utf-8").splitlines() if re.search(r"passed|skipped|failed", l)])
    if BLENDER:
        r = run([BLENDER, "-b", "--factory-startup", "-P", "blender/check_glb.py", "--", "artifacts/heart.glb", "artifacts/heart_lite.glb"], capture=True, check=False)
        (qa / "check_glb_full.txt").write_text(r.stdout, encoding="utf-8")
        keep = [l.strip() for l in r.stdout.splitlines() if re.search(r"^=== |triangle budget|file size|Draco compression|centreline bend|ALL CHECKS|FAIL", l)]
        keep = [re.sub(r" \(segments and 4 mm chords.*?\):", ":", l) for l in keep]
        save("check_glb", "blender -b -P blender/check_glb.py -- heart.glb heart_lite.glb", keep)


def loudnorm(src: Path, dst: Path) -> dict:
    """Two-pass EBU R128 to -14 LUFS, true peak aimed at -1.5 dBTP so the AAC encode stays under -1 dBTP; video re-encoded to yuv420p, AAC 192 kbps, faststart."""
    f1 = "loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json"
    r = run(["ffmpeg", "-hide_banner", "-i", str(src), "-af", f1, "-f", "null", "-"], capture=True)
    m = json.loads(re.search(r"\{[^{}]*\"input_i\"[^{}]*\}", r.stderr, re.S).group(0))
    f2 = (f"loudnorm=I=-14:TP=-1.5:LRA=11:measured_I={m['input_i']}:measured_TP={m['input_tp']}:"
          f"measured_LRA={m['input_lra']}:measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true:print_format=json")
    # video: H.264 High, standard (TV) range yuv420p (Remotion's JPEG frames arrive full-range)
    r = run(["ffmpeg", "-v", "info", "-y", "-i", str(src), "-af", f2, "-ar", "48000",
             "-vf", "scale=out_range=tv:out_color_matrix=bt709,format=yuv420p", "-c:v", "libx264", "-profile:v", "high",
             "-preset", "slow", "-crf", "16", "-color_range", "tv", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
             "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", str(dst)], capture=True)
    return json.loads(re.search(r"\{[^{}]*\"input_i\"[^{}]*\}", r.stderr, re.S).group(0))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--skip-capture", action="store_true")
    ap.add_argument("--skip-terminals", action="store_true")
    ap.add_argument("--own-voice", action="store_true")
    a = ap.parse_args()
    OUT.mkdir(exist_ok=True)
    if not health():
        sys.exit("The app is not running on http://localhost:8000 (see the docstring).")

    if a.own_voice and (VIDEO / "voice" / "clone" / "transcript.json").exists():
        run([PY, "video/pipeline/split_own.py"])  # one continuous reading -> per-scene WAVs with real word timings
    run([PY, "video/pipeline/tts.py", *(["--own"] if a.own_voice else [])])
    if not a.skip_capture:
        run([NPX, "playwright", "test", "-c", "capture/playwright.config.ts"], cwd=VIDEO)
    if not a.skip_terminals:
        terminals()
    if BLENDER and not (VIDEO / "assets" / "procedural_front.png").exists():
        run([BLENDER, "-b", "--factory-startup", "-P", "video/pipeline/render_procedural.py"])
    run([PY, "video/pipeline/assemble.py", *(["--pad", "0.6"] if a.own_voice else [])])
    raw = OUT / "master_raw.mp4"
    run([NPX, "remotion", "render", "src/index.ts", "Master", str(raw), "--codec=h264", "--crf=16", "--audio-bitrate=320k",
         "--pixel-format=yuv420p", "--x264-preset=slow"], cwd=VIDEO / "editor")
    final = OUT / "cardiolens_demo_1080p.mp4"
    stats = loudnorm(raw, final)
    run([NPX, "remotion", "still", "src/index.ts", "Thumbnail", str(OUT / "thumbnail.png")], cwd=VIDEO / "editor")
    run([PY, "video/pipeline/qa.py"])
    print("loudness:", {k: stats[k] for k in ("output_i", "output_tp", "output_lra")})
    print("done:", final)


if __name__ == "__main__":
    main()
