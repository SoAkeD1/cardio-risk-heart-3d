"""Copy runtime assets from artifacts/ (and three.js decoders from node_modules) into app/frontend/public,
then verify every copy by SHA-256. Idempotent; run by dev.py and build.py.

    python scripts/sync_assets.py
"""
from __future__ import annotations

import hashlib
import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PUB = ROOT / "app" / "frontend" / "public"
THREE = ROOT / "app" / "frontend" / "node_modules" / "three" / "examples" / "jsm" / "libs"
FIGURES = ["calibration_reliability.png", "holdout_cad.png", "holdout_lad.png", "holdout_lcx.png", "holdout_rca.png",
           "model_zoo_auc.png", "shap_global_cad.png", "ablation.png", "coronary_schematic_low.png",
           "coronary_schematic_moderate.png", "coronary_schematic_high.png"]


def sha(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def plan() -> list[tuple[Path, Path]]:
    pairs = [(ROOT / "artifacts" / f, PUB / "models" / f) for f in ("heart.glb", "heart_lite.glb")]
    pairs += [(ROOT / "assets_src" / "hdri" / "studio_small_09_1k.hdr", PUB / "env" / "studio_small_09_1k.hdr")]
    pairs += [(ROOT / "artifacts" / "figures" / f, PUB / "figures" / f) for f in FIGURES]
    for f in ("draco_decoder.js", "draco_decoder.wasm", "draco_wasm_wrapper.js"):
        pairs.append((THREE / "draco" / "gltf" / f, PUB / "decoders" / "draco" / f))
    for f in ("basis_transcoder.js", "basis_transcoder.wasm"):
        pairs.append((THREE / "basis" / f, PUB / "decoders" / "basis" / f))
    return pairs


def main() -> int:
    manifest, missing = {}, []
    for src, dst in plan():
        if not src.exists():
            missing.append(str(src.relative_to(ROOT)))
            continue
        dst.parent.mkdir(parents=True, exist_ok=True)
        if not dst.exists() or sha(dst) != sha(src):
            shutil.copy2(src, dst)
        h = sha(dst)
        if h != sha(src):
            print(f"hash mismatch after copy: {dst}")
            return 1
        manifest[str(dst.relative_to(PUB)).replace("\\", "/")] = h[:16]
    (PUB / "assets-manifest.json").write_text(json.dumps(manifest, indent=1), encoding="utf-8")
    print(f"synced {len(manifest)} assets into app/frontend/public (hashes verified)")
    if missing:
        print("missing (run `npm install` in app/frontend or rebuild the asset):", *missing, sep="\n  ")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
