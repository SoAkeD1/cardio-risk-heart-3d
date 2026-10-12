"""One-command Step 6 pipeline (run with the project venv):

    python blender/make_all.py [--blender "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe"]

1. demo risk colours from cardio_ml.anatomy.color_for (LAD 0.85, LCX 0.40, RCA 0.15)
2. blender/build_heart.py  -> artifacts/heart.glb, heart_lite.glb, blender/heart_source.blend, viewer_look.json,
                              Cycles renders in both looks (realistic + *_clinical), src_*.png
   (--heart-source sketchfab [default] | procedural; needs node + `npm install` for gltf-transform)
3. blender/check_glb.py    -> re-import + contract / anatomy / texture / attribution checks
4. cardio_ml.anatomy.validate_glb_names on both files
5. artifacts/figures/lite_vs_full.png and compare_sketchfab_vs_ours.png
"""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

import matplotlib.image as mpimg
import matplotlib.pyplot as plt

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from cardio_ml.anatomy import color_for, load_map, validate_glb_names  # noqa: E402

DEFAULT_BLENDER = r"C:\Program Files\Blender Foundation\Blender 5.2\blender.exe"
DEMO_PROBS = {"lad": 0.85, "lcx": 0.40, "rca": 0.15}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--blender", default=shutil.which("blender") or DEFAULT_BLENDER)
    ap.add_argument("--no-render", action="store_true")
    ap.add_argument("--heart-source", choices=("sketchfab", "procedural"), default="sketchfab")
    a = ap.parse_args()
    if not Path(a.blender).exists():
        sys.exit(f"Blender not found at {a.blender}; pass --blender <path to blender.exe>")
    thr = json.loads((ROOT / "artifacts" / "thresholds.json").read_text())
    demo = {k: color_for(p) for k, p in DEMO_PROBS.items()}
    demo.update({f"{k}_flag": p >= thr[k]["threshold"] for k, p in DEMO_PROBS.items()})
    figs = ROOT / "artifacts" / "figures"
    cmd = [a.blender, "-b", "--factory-startup", "-P", str(ROOT / "blender" / "build_heart.py"), "--",
           "--out", str(ROOT / "artifacts" / "heart.glb"), "--lite", str(ROOT / "artifacts" / "heart_lite.glb"),
           "--heart-source", a.heart_source]
    if not a.no_render:
        cmd += ["--renders", str(figs), "--demo-colors", json.dumps(demo)]
    subprocess.run(cmd, check=True)
    chk = subprocess.run([a.blender, "-b", "--factory-startup", "-P", str(ROOT / "blender" / "check_glb.py"), "--",
                          str(ROOT / "artifacts" / "heart.glb"), str(ROOT / "artifacts" / "heart_lite.glb")],
                         capture_output=True, text=True)
    print("\n".join(l for l in chk.stdout.splitlines() if l.startswith(("  [", "===", "  ==>", "build report"))))
    amap = load_map()
    for f in ("heart.glb", "heart_lite.glb"):
        print(f, validate_glb_names(ROOT / "artifacts" / f, amap))
    lite_png = figs / "_lite_front.png"
    if lite_png.exists():
        fig, axes = plt.subplots(1, 2, figsize=(16, 5.2))
        for ax, (img, title) in zip(axes, ((figs / "heart_front.png", "heart.glb (full)"),
                                           (lite_png, "heart_lite.glb (lite)"))):
            ax.imshow(mpimg.imread(img))
            ax.set_title(title, fontsize=13)
            ax.axis("off")
        fig.tight_layout()
        fig.savefig(figs / "lite_vs_full.png", dpi=110, bbox_inches="tight", pad_inches=0.15)
        lite_png.unlink()
    ours = figs / "_ours_front_for_compare.png"
    ref = ROOT / "assets_src" / "sketchfab_heart" / "reference" / "01_front.jpg"
    if ours.exists() and ref.exists():
        fig, axes = plt.subplots(1, 2, figsize=(10, 6))
        for ax, (img, title) in zip(axes, ((ref, "Sketchfab reference 01_front"), (ours, "ours (realistic)"))):
            ax.imshow(mpimg.imread(img))
            ax.set_title(title)
            ax.axis("off")
        fig.tight_layout()
        fig.savefig(figs / "compare_sketchfab_vs_ours.png", dpi=100, bbox_inches="tight")
    sys.exit(chk.returncode)


if __name__ == "__main__":
    main()
