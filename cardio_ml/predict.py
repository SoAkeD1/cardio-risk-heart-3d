"""Deployment API: predict_patient() and explain_patient().

Loads the artifacts written by the notebook (models/*.joblib, feature_schema.json,
thresholds.json, shap_background.joblib). Missing inputs fall back to schema defaults;
invalid inputs raise ``ValueError`` with a clear message.
"""
from __future__ import annotations

import json
import time
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

from . import config as C
from .data import clean_name, encode_frame
from .explain import build_explainers, group_totals, top_features


class CardioPredictor:
    def __init__(self, artifacts_dir: str | Path = C.ARTIFACTS_DIR, mode: str = "fast"):
        d = Path(artifacts_dir)
        self.models = {t: joblib.load(d / "models" / f"{t}.joblib") for t in C.TARGETS}
        self.schema = json.loads((d / "feature_schema.json").read_text(encoding="utf-8"))
        self.thresholds = json.loads((d / "thresholds.json").read_text(encoding="utf-8"))
        bg = joblib.load(d / "shap_background.joblib")
        self.background = bg["background"]
        self.explainers = build_explainers(self.models, bg["background"], bg.get("train"), mode)
        self.fields = {f["name"]: f for f in self.schema["features"]}
        self.original = {clean_name(f["original_name"]): f["name"] for f in self.schema["features"]}

    # ------------------------------------------------------------------ input handling
    def to_frame(self, patient: dict) -> tuple[pd.DataFrame, list[str]]:
        if not isinstance(patient, dict):
            raise ValueError("patient must be a dict of {feature_name: value}")
        row, warnings = {}, []
        for key, value in patient.items():
            name = self.original.get(clean_name(key), clean_name(key))
            if name in C.LABEL_COLUMNS:
                raise ValueError(f"'{key}' is a diagnostic label (Cath/LAD/LCX/RCA) and can never "
                                 "be a model input")
            if name not in self.fields:
                raise ValueError(f"Unknown feature '{key}'. Valid names: {sorted(self.fields)}")
            row[name] = value
        for name, f in self.fields.items():
            if name not in row or row[name] is None or (isinstance(row[name], float)
                                                        and np.isnan(row[name])):
                row[name] = f["default"]
            if f["type"] == "numeric":
                try:
                    v = float(row[name])
                except (TypeError, ValueError):
                    raise ValueError(f"'{name}' must be numeric, got {row[name]!r}") from None
                lo, hi = f.get("hard_limits", (-np.inf, np.inf))
                if not lo <= v <= hi:
                    raise ValueError(f"'{name}'={v} outside physiological limits [{lo}, {hi}] "
                                     f"{f['unit']}")
                if not f["min"] <= v <= f["max"]:
                    warnings.append(f"{name}={v} outside training range [{f['min']}, {f['max']}] "
                                    "- extrapolation, interpret with caution")
                row[name] = v
        X = pd.DataFrame([row])[list(self.fields)]
        encode_frame(X)                       # raises ValueError on invalid categorical values
        return X, warnings

    # ------------------------------------------------------------------ prediction
    def predict(self, patient: dict, explain: bool = True, k: int = 8) -> dict:
        X, warnings = self.to_frame(patient)
        out, expl, groups = {}, {}, {}
        cad_res = None
        for t in C.TARGETS:
            ex = self.explainers[t]
            if explain:
                if t == "cad":
                    P, contrib = cad_res = ex.explain_raw(X)
                elif hasattr(ex, "cad"):
                    P, contrib = ex.explain_raw(X, cad_result=cad_res)
                else:
                    P, contrib = ex.explain_raw(X)
                expl[t] = top_features(contrib.iloc[0], X.iloc[0], k)
                groups[t] = {g: round(float(v), 2) for g, v in group_totals(contrib.iloc[0]).iloc[0].items()}
            else:
                P = self.models[t].predict_proba(X)[:, 1]
            p = float(P[0])
            thr = float(self.thresholds[t]["threshold"])
            out[t] = dict(prob=round(p, 4), threshold=thr,
                          label=C.POSITIVE_TEXT[t] if p >= thr else C.NEGATIVE_TEXT[t])
        tiers = self.thresholds["risk_tiers"]
        pc = out["cad"]["prob"]
        out["cad"]["risk_tier"] = ("High" if pc >= tiers["high"] else
                                   "Low" if pc < tiers["low"] else "Moderate")
        out["expected_stenotic_vessels"] = round(sum(out[v]["prob"] for v in C.VESSELS), 3)
        if explain:
            out["explanations"] = expl
            out["group_contributions"] = groups
        out["warnings"] = warnings
        out["disclaimer"] = C.DISCLAIMER
        return out


_PREDICTOR: CardioPredictor | None = None


def get_predictor(artifacts_dir: str | Path = C.ARTIFACTS_DIR) -> CardioPredictor:
    global _PREDICTOR
    if _PREDICTOR is None:
        _PREDICTOR = CardioPredictor(artifacts_dir)
    return _PREDICTOR


def predict_patient(patient_dict: dict, k: int = 8) -> dict:
    """Full contract: probabilities, labels, thresholds, risk tier, expected vessels,
    top-k raw-feature explanations per target and physiological-group contributions."""
    return get_predictor().predict(patient_dict, explain=True, k=k)


def explain_patient(patient_dict: dict, k: int = 8) -> dict:
    """Per target: top-k raw features {feature, label, group, value, unit, shap,
    contribution_pct, direction} plus group totals (% of total |attribution|)."""
    r = get_predictor().predict(patient_dict, explain=True, k=k)
    return {t: dict(prob=r[t]["prob"], top_features=r["explanations"][t],
                    group_totals=r["group_contributions"][t]) for t in C.TARGETS}


def benchmark(patients: list[dict], repeats: int = 3) -> dict:
    """Latency of predict_patient() incl. explanations (ms per patient)."""
    pred = get_predictor()
    pred.predict(patients[0])                                   # warm-up
    times = []
    for _ in range(repeats):
        for p in patients:
            t0 = time.perf_counter()
            pred.predict(p)
            times.append((time.perf_counter() - t0) * 1000)
    return dict(mean_ms=float(np.mean(times)), p95_ms=float(np.percentile(times, 95)),
                max_ms=float(np.max(times)), n=len(times))
