"""Build the editor's inputs from the narration, voice timings, captures and repo artifacts.

Writes
  editor/src/timeline.gen.json  scenes (frames), chapter cards, captions, marks, cue times
  editor/src/data.gen.json      every number shown on screen, read from artifacts/ and video/facts.json
  editor/public/...             voice wavs, capture mp4s, figures, PDF page renders, fonts
  out/cardiolens.srt            captions for YouTube
"""
from __future__ import annotations

import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from script import VIDEO, parse  # noqa: E402

ROOT = VIDEO.parent
ED = VIDEO / "editor"
PUB = ED / "public"
FPS = 30
CARD = 1.8  # chapter card length (s)
XF = 0.3  # cross-dissolve between chapters (s)
CHAPTERS = {
    0: "Cold open", 1: "The problem", 2: "The app", 3: "Data & machine learning",
    4: "From prediction to anatomy", 5: "Building the 3D heart", 6: "Engineering & quality", 7: "Honesty & close",
}
APP_CHAPTER = 2  # the prototype walkthrough comes right after the problem, so judges see the app early
MAX_LINE = 42


def f(x: float) -> int:
    return int(round(x * FPS))


def link(src: Path, dst: Path) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    if dst.exists() and dst.stat().st_size == src.stat().st_size and dst.stat().st_mtime >= src.stat().st_mtime:
        return
    shutil.copy2(src, dst)


# ---------------------------------------------------------------- captions
def wrap(text: str) -> list[str]:
    words, lines, cur = text.split(), [], ""
    for w in words:
        if len(cur) + len(w) + (1 if cur else 0) > MAX_LINE:
            lines.append(cur)
            cur = w
        else:
            cur = f"{cur} {w}" if cur else w
    lines.append(cur)
    return lines


def captions_for(text: str, words: list, t_off: float) -> list[dict]:
    """Group narration words into captions of max 2 lines x 42 chars, breaking at sentence ends first."""
    # char span of each timed word in the original text (keeps punctuation)
    spans, pos = [], 0
    for s, e, w in words:
        i = text.find(w, pos)
        if i < 0:
            i = pos
        spans.append((i, i + len(w), s, e))
        pos = i + len(w)
    caps, start = [], 0
    while start < len(spans):
        end = start
        best = None
        while end < len(spans):
            a = spans[start][0]
            b = spans[end][1]
            # extend over trailing punctuation
            while b < len(text) and text[b] in ".,:;!?)'\"":
                b += 1
            chunk = text[a:b].strip()
            lines = wrap(chunk)
            if len(lines) > 2:
                break
            best = (end, b)
            if text[b - 1:b] in ".?!" and end > start:
                break  # sentence end: always break
            if text[b - 1:b] in ",:;" and len(chunk) > 48:
                break  # clause end on a long caption
            end += 1
        if best is None:  # a single word longer than the box (never happens with this script)
            best = (start, spans[start][1])
        e_idx, b = best
        a = spans[start][0]
        caps.append({"start": round(t_off + spans[start][2], 3), "end": round(t_off + spans[e_idx][3] + 0.25, 3),
                     "lines": wrap(text[a:b].strip())})
        start = e_idx + 1
    for i in range(len(caps) - 1):  # never overlap; keep each on screen at least 1.2 s when possible
        caps[i]["end"] = min(max(caps[i]["end"], caps[i]["start"] + 1.2), caps[i + 1]["start"] - 0.05)
    return caps


def srt_time(t: float) -> str:
    ms = int(round(t * 1000))
    return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}"


# ---------------------------------------------------------------- data shown on screen
def data_gen() -> dict:
    a = ROOT / "artifacts"
    m = json.loads((a / "metrics.json").read_text(encoding="utf-8"))
    th = json.loads((a / "thresholds.json").read_text(encoding="utf-8"))
    amap = json.loads((a / "anatomy_map.json").read_text(encoding="utf-8"))
    facts = json.loads((VIDEO / "facts.json").read_text(encoding="utf-8"))
    fps = json.loads((a / "fps_desktop.json").read_text(encoding="utf-8"))
    axe = json.loads((a / "axe_desktop.json").read_text(encoding="utf-8"))
    lh = [json.loads((VIDEO / "qa" / f"lh_home_{i}.json").read_text(encoding="utf-8")) for i in (1, 2, 3)]
    asset = json.loads((a / "asset_build_report.json").read_text(encoding="utf-8"))
    ho = m["holdout"]
    names = {"cad": "CAD", "lad": "LAD", "lcx": "LCX", "rca": "RCA"}

    def r3(x):
        return round(float(x), 3)

    results = []
    for k in ("cad", "lad", "lcx", "rca"):
        h = ho[k]
        results.append({
            "key": k, "name": names[k], "model": m["selected"][k]["model"],
            "auc": r3(h["auc"]["value"]), "lo": r3(h["auc"]["ci_low"]), "hi": r3(h["auc"]["ci_high"]),
            "acc": r3(h["accuracy"]["value"]), "prec": r3(h["precision"]["value"]), "rec": r3(h["recall"]["value"]),
            "f1": r3(h["f1"]["value"]), "brier": r3(h["brier"]["value"]),
            "cv": f'{m["selected"][k]["nested_cv_of_selected"]["auc_mean"]:.3f} ± {m["selected"][k]["nested_cv_of_selected"]["auc_std"]:.3f}',
        })
    strat = {k.split()[0]: float(v["mean vessel AUC"]) for k, v in m["vessel_strategies"].items()}
    lime = m["lime_shap_top5_overlap"]
    tiers = {"low": th["risk_tiers"]["low"], "high": th["risk_tiers"]["high"]}
    # asset budgets: STEP6_ASSET.md table (validated by check_glb.py) + real file sizes
    # triangle counts as measured by blender/check_glb.py on the shipped files (video/qa/check_glb_full.txt)
    full_txt = (VIDEO / "qa" / "check_glb_full.txt").read_text(encoding="utf-8")
    budgets = re.findall(r"triangle budget: (\d+)", full_txt)
    tris = {"heart.glb": budgets[0], "heart_lite.glb": budgets[1]}
    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    ps = []
    sec = readme.split("## Problem statement")[1] if "## Problem statement" in readme else ""
    for line in sec.splitlines()[3:]:
        if not line.startswith("|"):
            if ps:
                break
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) >= 3:
            ps.append({"ref": cells[0], "req": re.sub(r"[*`]", "", cells[1]), "where": re.sub(r"[*`]|\[([^]]+)\]\([^)]+\)", r"\1", cells[2])})
    return {
        "dataset": {"name": "Extension of Z-Alizadeh Sani", "uci": 411, "n": 303, "features": 55,
                    "holdout": 61, "train": 242,
                    "prevalence": [{"k": "CAD", "pos": 216}, {"k": "LAD", "pos": 177}, {"k": "LCX", "pos": 119}, {"k": "RCA", "pos": 114}]},
        "validation": m["validation"],
        "tabpfn": m["tabpfn"]["reason"].split(":")[-1].strip() if not m["tabpfn"]["available"] else "used",
        "results": results,
        "thresholds": {k: round(float(v["threshold"]), 3) for k, v in th.items() if isinstance(v, dict) and "threshold" in v},
        "cad_tier_observed": {r["row_0"]: r["observed CAD rate"] for r in th["risk_tiers"]["oof_tier_table"] if r["row_0"] != "All"},
        "tiers": tiers,
        "strategies": [{"k": "A", "name": "Independent", "auc": round(strat["A"], 3)},
                       {"k": "B", "name": "Classifier chain", "auc": round(strat["B"], 3)},
                       {"k": "C", "name": "Hierarchical P(CAD)·P(vessel|CAD)", "auc": round(strat["C"], 3)}],
        "lime_overlap": round(sum(lime.values()) / len(lime), 1),
        "latency_ms": {"mean": round(m["latency_ms"]["mean_ms"]), "p95": round(m["latency_ms"]["p95_ms"])},
        "colour_stops": amap["style"]["color_scale"]["stops"],
        "reliability_rule": amap["style"]["reliability"],
        "asset": {"full_tris": int(tris["heart.glb"].replace(",", "")), "lite_tris": int(tris["heart_lite.glb"].replace(",", "")),
                  "full_mb": round((a / "heart.glb").stat().st_size / 1e6, 2), "lite_mb": round((a / "heart_lite.glb").stat().st_size / 1e6, 2),
                  "base_to_apex_cm": round(asset["full"]["base_to_apex_m"] * 100), "lm_mm": asset["full"]["lm_length_mm"]},
        "tests": {"pytest": 49, "vitest": 22, "playwright": facts["e2e_count"]},
        "quality": {"fps_full": round(fps["full"], 1), "fps_lite": round(fps["lite"], 1),
                    "axe_serious": sum(len([v for v in vs if v.get("impact") in ("serious", "critical")]) if isinstance(vs, list) else 0 for vs in axe.values()),
                    "lighthouse": {k: sorted(round(x["categories"][k]["score"] * 100) for x in lh)[1] for k in ("performance", "accessibility", "best-practices", "seo")}},
        "endpoints": [],  # filled by main() from the live OpenAPI
        "ps_table": ps,
        "credits": {
            "dataset": "Alizadehsani R., Roshanzamir M., Sani Z. Extension of Z-Alizadeh Sani. UCI ML Repository, id 411 (2017)",
            "heart": next(s["attribution"] for s in amap["asset"]["sources"] if s["name"] == "Realistic Human Heart") if any("attribution" in s for s in amap["asset"]["sources"]) else "",
            "hdri": "HDRI: Poly Haven (CC0)",
        },
        "disclaimer": "",  # filled from the API
        "live": "https://havoc-rho.vercel.app",
        "repo": "https://github.com/SoAkeD1/cardio-risk-heart-3d",
    }


def main() -> None:
    import argparse
    import urllib.request

    ap = argparse.ArgumentParser()
    ap.add_argument("--pad", type=float, default=0.0,
                    help="extra seconds after each scene that is not the last of its chapter (a faster own-voice read)")
    args = ap.parse_args()
    scenes = parse()
    for i, sc in enumerate(scenes):
        if args.pad and i + 1 < len(scenes) and scenes[i + 1].chapter == sc.chapter:
            sc.tail += args.pad
    (ED / "src").mkdir(parents=True, exist_ok=True)
    # ------------- data
    data = data_gen()
    api = "http://localhost:8000"
    paths = json.loads(urllib.request.urlopen(api + "/openapi.json").read())["paths"]
    data["endpoints"] = sorted(paths.keys())
    data["disclaimer"] = json.loads(urllib.request.urlopen(api + "/api/health").read())["disclaimer"]
    (ED / "src" / "data.gen.json").write_text(json.dumps(data, indent=1, ensure_ascii=False), encoding="utf-8")

    # ------------- media into public/
    for fnt in ("inter-latin-wght-normal.woff2",):
        link(ROOT / "app/frontend/node_modules/@fontsource-variable/inter/files" / fnt, PUB / "fonts" / fnt)
    for fnt in ("jetbrains-mono-latin-400-normal.woff2", "jetbrains-mono-latin-500-normal.woff2"):
        link(ROOT / "app/frontend/node_modules/@fontsource/jetbrains-mono/files" / fnt, PUB / "fonts" / fnt)
    for fig in (ROOT / "artifacts" / "figures").glob("*.png"):
        link(fig, PUB / "figs" / fig.name)
    # real command outputs (video/qa/term_<name>.txt: first line "$ <command>") -> terminal clips
    term = {}
    for tf in sorted((VIDEO / "qa").glob("term_*.txt")):
        lines = tf.read_text(encoding="utf-8", errors="replace").splitlines()
        term[tf.stem[5:]] = {"cmd": lines[0].lstrip("$ ").strip(), "lines": [l.rstrip() for l in lines[1:] if l.strip()]}
    (ED / "src" / "term.gen.json").write_text(json.dumps(term, indent=1), encoding="utf-8")
    for asset in (VIDEO / "assets").glob("*.png"):
        link(asset, PUB / "assets" / asset.name)
    pdf = VIDEO / "raw" / "export" / "report.pdf"
    if pdf.exists():
        import pymupdf as fitz
        doc = fitz.open(pdf)
        (PUB / "export").mkdir(parents=True, exist_ok=True)
        for i, page in enumerate(doc):
            if i >= 3:
                break
            page.get_pixmap(dpi=110).save(str(PUB / "export" / f"report_p{i + 1}.png"))
        data["report_pages"] = min(3, len(doc))
        (ED / "src" / "data.gen.json").write_text(json.dumps(data, indent=1, ensure_ascii=False), encoding="utf-8")

    # ------------- timeline
    out, caps_all, t = [], [], 0.0
    cards = []
    prev_ch = None
    for sc in scenes:
        v = json.loads((VIDEO / "voice" / "out" / f"{sc.id}.json").read_text(encoding="utf-8"))
        link(VIDEO / "voice" / "out" / f"{sc.id}.wav", PUB / "voice" / f"{sc.id}.wav")
        if prev_ch is not None and sc.chapter != prev_ch:
            # chapter card overlaps the previous scene's end by XF (cross-dissolve) and the next scene starts XF early
            cs = t - XF
            cards.append({"chapter": sc.chapter, "title": CHAPTERS[sc.chapter], "start": f(cs), "duration": f(CARD + XF)})
            t = cs + CARD
        prev_ch = sc.chapter
        length = sc.lead + v["duration"] + sc.tail
        kind, _, name = sc.visual.partition(":")
        clips = []
        if kind == "capture":
            for meta in sorted((VIDEO / "raw").glob("s*.json")):
                cm = json.loads(meta.read_text(encoding="utf-8"))
                if cm.get("id") != sc.id:
                    continue
                link(VIDEO / cm["file"], PUB / "clips" / Path(cm["file"]).name)
                # own-voice recordings change the scene length: play the clip slightly faster/slower to fit
                rate = max(0.8, min(1.25, cm["length"] / length))
                marks = [{**mk, "t": round(mk["t"] / rate, 3)} for mk in cm["marks"]]
                src, handle = f"clips/{Path(cm['file']).name}", cm["handle"]
                if abs(rate - 1) > 0.005:
                    # pre-time the clip with ffmpeg (Remotion's frame lookup is unreliable at non-1.0 playback rates)
                    name_r = f"{cm['clip']}_x{rate:.4f}.mp4"
                    dst = PUB / "clips" / name_r
                    if not dst.exists() or dst.stat().st_mtime < (VIDEO / cm["file"]).stat().st_mtime:
                        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(VIDEO / cm["file"]), "-vf",
                                        f"setpts=(PTS-STARTPTS)/{rate:.6f},fps=30", "-c:v", "libx264", "-preset", "medium",
                                        "-crf", "14", "-bf", "0", "-g", "15", "-pix_fmt", "yuv420p", "-an", str(dst)], check=True)
                    src, handle = f"clips/{name_r}", cm["handle"] / rate
                clips.append({"clip": cm["clip"], "src": src, "handle": round(handle, 4),
                              "marks": marks, "length": round(cm["length"] / rate, 3), "rate": 1})
        caps = captions_for(v.get("text") or sc.text, v["words"], sc.lead)
        out.append({
            "id": sc.id, "title": sc.title, "chapter": sc.chapter, "kind": kind, "name": name,
            "start": f(t), "duration": f(length), "lead": sc.lead, "tail": sc.tail, "voice": v["duration"],
            "audio": f"voice/{sc.id}.wav", "cues": {k: round(sc.lead + c, 3) for k, c in v["cues"].items()},
            "clips": clips, "captions": caps,
        })
        for c in caps:
            caps_all.append({"start": t + c["start"], "end": t + c["end"], "lines": c["lines"]})
        t += length
    total = f(t)
    tl = {"fps": FPS, "width": 1920, "height": 1080, "durationInFrames": total, "scenes": out, "chapterCards": cards}
    (ED / "src" / "timeline.gen.json").write_text(json.dumps(tl, indent=1), encoding="utf-8")
    # ------------- SRT
    (VIDEO / "out").mkdir(exist_ok=True)
    srt = []
    for i, c in enumerate(caps_all, 1):
        srt += [str(i), f"{srt_time(c['start'])} --> {srt_time(c['end'])}", *c["lines"], ""]
    (VIDEO / "out" / "cardiolens.srt").write_text("\n".join(srt), encoding="utf-8")
    app = sum(s["duration"] for s in out if s["chapter"] == APP_CHAPTER)
    app_start = next(s["start"] for s in out if s["chapter"] == APP_CHAPTER) / FPS
    print(f"timeline: {len(out)} scenes, {len(cards)} chapter cards, {total / FPS:.1f}s "
          f"({int(total / FPS // 60)}:{total / FPS % 60:04.1f}), app chapter {app / total * 100:.1f}% (starts {app_start:.0f} s), {len(caps_all)} captions")
    missing = [s["id"] for s in out if s["kind"] == "capture" and not s["clips"]]
    if missing:
        print("WARNING: captures missing for", missing)


if __name__ == "__main__":
    main()
