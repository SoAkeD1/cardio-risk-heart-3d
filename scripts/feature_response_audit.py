"""Feature-response audit: how much can each input move each model estimate?

For every curated sample patient (GET /api/examples) and every feature in the schema (GET /api/schema):
  * binary   -> both values
  * numeric  -> 9 values evenly across the schema (training) range
  * ordinal / categorical -> every allowed level
and record max |Δ probability| (vs. the sample's own value) for cad / lad / lcx / rca, using the frozen models.
Models are NOT changed, retrained or tuned: near-zero effects are genuine model behaviour.

    python scripts/feature_response_audit.py
-> artifacts/feature_response.json, artifacts/figures/feature_response_heatmap.png
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

TARGETS = ["cad", "lad", "lcx", "rca"]
# effect_strength (0-3) from the max |Δ| over targets and samples, in probability points
STRENGTH_CUTS_PTS = [0.5, 5.0, 15.0]  # < 0.5 -> 0 ("little effect"), < 5 -> 1, < 15 -> 2, >= 15 -> 3
N_NUMERIC = 9


def levels(f: dict) -> list:
    if f["type"] == "numeric":
        return np.linspace(f["min"], f["max"], N_NUMERIC).round(4).tolist()
    return list(f.get("allowed_values") or [])


def main() -> int:
    from app.backend.services import Services
    from app.backend.settings import get_settings

    t0 = time.time()
    svc = Services(get_settings().ARTIFACTS_DIR).load()
    schema = svc.feature_schema()
    examples = svc.examples()
    pr = svc.predictor

    def probs(features: dict) -> dict:
        r = pr.predict(svc.validate(features), explain=False)
        return {t: float(r[t]["prob"]) for t in TARGETS}

    out: dict = {}
    for f in schema["features"]:
        n = f["name"]
        per_sample = {}
        for ex in examples:
            base = probs(ex["features"])
            deltas = {t: 0.0 for t in TARGETS}
            for v in levels(f):
                p = probs({**ex["features"], n: v})
                for t in TARGETS:
                    deltas[t] = max(deltas[t], abs(p[t] - base[t]))
            per_sample[ex["id"]] = {t: round(deltas[t], 5) for t in TARGETS}
        max_delta = {t: round(max(s[t] for s in per_sample.values()), 5) for t in TARGETS}
        top_pts = max(max_delta.values()) * 100
        strength = int(sum(top_pts >= c for c in STRENGTH_CUTS_PTS))
        out[n] = dict(label=f["label"], group=f["group"], type=f["type"], max_delta=max_delta,
                      effect_strength=strength, per_sample=per_sample, used_by_model=f["used_by_model"])
        print(f"{n:24s} " + " ".join(f"{t}={max_delta[t] * 100:5.1f}" for t in TARGETS) + f"  strength {strength}")

    doc = dict(
        description="Max |Δ calibrated probability| when sweeping each input over its schema range (binary: both "
                    "values; categorical/ordinal: every level; numeric: 9 values min..max) for each curated sample "
                    "patient, with all other inputs fixed. Frozen models; genuine model behaviour.",
        samples=[e["id"] for e in examples], targets=TARGETS, numeric_points=N_NUMERIC,
        effect_strength_rule=f"max over targets of max |Δ| in points: <{STRENGTH_CUTS_PTS[0]} -> 0, "
                             f"<{STRENGTH_CUTS_PTS[1]} -> 1, <{STRENGTH_CUTS_PTS[2]} -> 2, else 3",
        near_zero_threshold_pts=STRENGTH_CUTS_PTS[0], features=out,
        generated_in_s=round(time.time() - t0, 1))
    (ROOT / "artifacts" / "feature_response.json").write_text(json.dumps(doc, indent=1, ensure_ascii=False), encoding="utf-8")

    # heatmap: features (sorted by strongest effect) x targets, in probability points
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    names = sorted(out, key=lambda k: -max(out[k]["max_delta"].values()))
    M = np.array([[out[k]["max_delta"][t] * 100 for t in TARGETS] for k in names])
    fig, ax = plt.subplots(figsize=(6.6, 15))
    im = ax.imshow(M, aspect="auto", cmap="magma_r", vmin=0, vmax=max(10, float(M.max())))
    ax.set_xticks(range(len(TARGETS)), [t.upper() for t in TARGETS])
    ax.set_yticks(range(len(names)), [out[k]["label"] for k in names], fontsize=8)
    for i in range(len(names)):
        for j in range(len(TARGETS)):
            ax.text(j, i, f"{M[i, j]:.1f}", ha="center", va="center", fontsize=6.5, color="white" if M[i, j] > 0.55 * M.max() else "black")
    ax.set_title("Feature response: max |Δ probability| (pts)\nacross the 6 sample patients, input swept over its range", fontsize=10)
    fig.colorbar(im, ax=ax, fraction=0.04, pad=0.02, label="probability points")
    fig.tight_layout()
    fig.savefig(ROOT / "artifacts" / "figures" / "feature_response_heatmap.png", dpi=130)
    near_zero = [k for k in names if max(out[k]["max_delta"].values()) * 100 < STRENGTH_CUTS_PTS[0]]
    print(f"\nnear-zero effect (< {STRENGTH_CUTS_PTS[0]} pts on every target): {len(near_zero)} features: {', '.join(near_zero)}")
    print(f"done in {time.time() - t0:.0f} s")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
