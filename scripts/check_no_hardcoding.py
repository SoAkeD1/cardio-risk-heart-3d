"""Zero-hardcoding guard: fail if the frontend source duplicates data that must come from the API.

Scans app/frontend/src (excluding tests, generated API types) for:
  * any hex colour that appears in artifacts/anatomy_map.json
  * any threshold / risk-tier cut-off from artifacts/thresholds.json (as a numeric literal)
  * any mesh / anchor / helper node name (patterns + every name listed in anatomy_map.json)
  * any feature name from artifacts/feature_schema.json used as a string literal
  * the disclaimer sentence (cardio_ml.config.DISCLAIMER)
  * any hold-out AUC value from artifacts/metrics.json (as a numeric literal)

    python scripts/check_no_hardcoding.py      -> exit 0 if clean, 1 with a report otherwise
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "app" / "frontend" / "src"
ART = ROOT / "artifacts"
EXCLUDE_DIRS = {"test", "__tests__"}
EXCLUDE_FILES = {"types.gen.ts"}


def _num_forms(v: float) -> set[str]:
    """Literal spellings of a data value: 3-decimal (trailing zeros stripped, e.g. 0.465, 0.29) and the full
    2-decimal form (e.g. 0.90, 0.83). Lossier forms (0.9) would collide with generic UI numbers (opacity, easing)."""
    three = f"{v:.3f}".rstrip("0").rstrip(".")
    return {three, f"{v:.2f}"} - {"0", "1", "0.00", "1.00"}


def rules() -> dict:
    sys.path.insert(0, str(ROOT))
    from cardio_ml.config import DISCLAIMER

    amap = json.loads((ART / "anatomy_map.json").read_text(encoding="utf-8"))
    thr = json.loads((ART / "thresholds.json").read_text(encoding="utf-8"))
    met = json.loads((ART / "metrics.json").read_text(encoding="utf-8"))
    schema = json.loads((ART / "feature_schema.json").read_text(encoding="utf-8"))
    blob = json.dumps(amap)
    hexes = {h.upper() for h in re.findall(r"#[0-9A-Fa-f]{6}\b", blob)}
    targets = [k for k in thr if isinstance(thr[k], dict) and "threshold" in thr[k]]
    thresholds = {float(thr[t]["threshold"]) for t in targets} | {float(thr["risk_tiers"]["low"]), float(thr["risk_tiers"]["high"])}
    aucs = {float(met["holdout"][t]["auc"]["value"]) for t in met["holdout"]}
    # every node name the map knows about
    mesh_names = set(re.findall(r'"((?:Coronary|Organ|Anchor|Territory|Extra|Heart|Torso)_[A-Za-z0-9_]+)"', blob))
    mesh_names |= {m for ns in amap["neutral_structures"] for m in ns["mesh_names"]}
    mesh_names |= set(amap.get("viewer", {}).get("groups", {}).values())
    return dict(
        hexes=hexes,
        # thresholds: exact 3-decimal spelling only (2-decimal rounding, e.g. 0.077 -> 0.08, collides with UI numbers)
        threshold_strs={f"{v:.3f}".rstrip("0").rstrip(".") for v in thresholds},
        auc_strs={s for v in aucs for s in _num_forms(v)},
        mesh_names=mesh_names,
        features={f["name"] for f in schema["features"]},
        disclaimer=DISCLAIMER,
    )


NUM = re.compile(r"(?<![\w.#])(0?\.\d+)(?![\w.])")
STR = re.compile(r"""(["'`])((?:\\.|(?!\1).)*)\1""")
MESH_PATTERN = re.compile(r"\b(?:Coronary|Organ|Anchor|Territory|Extra)_[A-Za-z]")


def scan() -> list[str]:
    R = rules()
    problems: list[str] = []
    for p in sorted(SRC.rglob("*")):
        if p.suffix not in {".ts", ".tsx"} or p.name in EXCLUDE_FILES or EXCLUDE_DIRS & set(p.relative_to(SRC).parts):
            continue
        rel = (p.relative_to(ROOT) if ROOT in p.parents else p.relative_to(SRC)).as_posix()
        for i, line in enumerate(p.read_text(encoding="utf-8").splitlines(), 1):
            code = line.split("//", 1)[0] if not line.strip().startswith("*") else ""   # ignore comments
            for h in re.findall(r"#[0-9A-Fa-f]{6}\b", code):
                if h.upper() in R["hexes"]:
                    problems.append(f"{rel}:{i}: anatomy_map colour {h}")
            for n in NUM.findall(code):
                if n in R["threshold_strs"] or ("0" + n if n.startswith(".") else n) in R["threshold_strs"]:
                    problems.append(f"{rel}:{i}: threshold value {n}")
                if n in R["auc_strs"]:
                    problems.append(f"{rel}:{i}: AUC value {n}")
            if MESH_PATTERN.search(code):
                problems.append(f"{rel}:{i}: mesh/anchor name pattern {MESH_PATTERN.search(code).group(0)}…")
            for _, lit in STR.findall(code):
                if lit in R["mesh_names"]:
                    problems.append(f"{rel}:{i}: mesh/node name '{lit}'")
                if lit in R["features"]:
                    problems.append(f"{rel}:{i}: feature name '{lit}' as a string literal")
            if R["disclaimer"][:48] in line:
                problems.append(f"{rel}:{i}: disclaimer text")
    return problems


def main() -> int:
    problems = scan()
    if problems:
        print(f"check_no_hardcoding: {len(problems)} problem(s)")
        print("\n".join("  " + p for p in problems))
        return 1
    print("check_no_hardcoding: OK (no hardcoded data in app/frontend/src)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
