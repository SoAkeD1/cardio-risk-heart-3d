"""Thin service layer around ``cardio_ml``. No ML logic lives here: prediction, explanation, scene state,
what-if and sensitivity all come from cardio_ml; this module only validates inputs, assembles responses and
selects the curated example patients."""
from __future__ import annotations

import json
import logging
import math
import re
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

from cardio_ml import anatomy as A
from cardio_ml import config as C
from cardio_ml.data import clean_name

from .reference_ranges import REFERENCE_RANGES

log = logging.getLogger("cardiolens")

CONTENT_DIR = Path(__file__).resolve().parent / "content"
DISPLAY = json.loads((CONTENT_DIR / "feature_display.json").read_text(encoding="utf-8"))
_YES = {"y", "yes", "1", "1.0", "true", "t"}
_NO = {"n", "no", "0", "0.0", "false", "f"}
_SEX = {"male": "Male", "m": "Male", "1": "Male", "female": "Female", "fmale": "Female", "f": "Female", "0": "Female"}


# ============================================================================ errors
class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str, fields: dict[str, str] | None = None):
        super().__init__(message)
        self.status, self.code, self.message, self.fields = status, code, message, fields


def _fmt(v: float) -> str:
    return f"{v:g}"


# ============================================================================ services
@dataclass
class Services:
    artifacts: Path
    predictor: object = None
    amap: dict = field(default_factory=dict)
    schema: dict = field(default_factory=dict)
    fields: dict = field(default_factory=dict)
    loaded_at: str = ""
    load_ms: float = 0.0
    _examples: list | None = None

    # ------------------------------------------------------------------ startup
    def load(self) -> "Services":
        from cardio_ml.predict import get_predictor
        t0 = time.perf_counter()
        self.predictor = get_predictor(self.artifacts)
        self.amap = A.load_map(self.artifacts / "anatomy_map.json")
        self.schema = self.predictor.schema
        self.fields = self.predictor.fields
        self.predictor.predict({}, explain=True, k=A.N_FEATURES)          # warm-up (first SHAP call is slow)
        self.metrics = json.loads((self.artifacts / "metrics.json").read_text(encoding="utf-8"))
        self.viewer_look = json.loads((self.artifacts / "viewer_look.json").read_text(encoding="utf-8"))
        self.scene_schema = json.loads((self.artifacts / "scene_state.schema.json").read_text(encoding="utf-8"))
        self._examples = select_examples(self)                           # curated hold-out cases (deterministic)
        fr = self.artifacts / "feature_response.json"
        self.feature_response = json.loads(fr.read_text(encoding="utf-8")) if fr.exists() else None
        self.education = json.loads((CONTENT_DIR / "education.json").read_text(encoding="utf-8"))
        self.load_ms = round((time.perf_counter() - t0) * 1000, 1)
        self.loaded_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
        log.info("cardio_ml models + anatomy map loaded in %.0f ms", self.load_ms)
        return self

    # ------------------------------------------------------------------ health / schema
    def health(self, version: str) -> dict:
        sel = self.metrics["selected"]
        strat = {sel[v].get("vessel_strategy") for v in C.VESSELS} - {None}
        return dict(status="ok", models={t: sel[t]["model"] for t in C.TARGETS},
                    vessel_strategy=", ".join(sorted(strat)) or "n/a", loaded_at=self.loaded_at,
                    load_ms=self.load_ms, version=version, disclaimer=C.DISCLAIMER)

    def feature_schema(self) -> dict:
        modifiable = set(self.amap["modifiable"]["features"])
        feats = []
        for f in self.schema["features"]:
            n = f["name"]
            spec = dict(name=n, original_name=f["original_name"], label=DISPLAY["label_overrides"].get(n, f["label"]),
                        group=f["group"], type=f["type"], unit=f["unit"], default=f["default"],
                        modifiable=n in modifiable, used_by_model=bool(f.get("used_by_model", True)),
                        help=DISPLAY["help"].get(n, f["label"]))
            eff = (self.feature_response or {}).get("features", {}).get(n)
            if eff:
                spec["effect_strength"] = int(eff["effect_strength"])
                spec["effect_max_pts"] = {t: round(v * 100, 1) for t, v in eff["max_delta"].items()}
            if f["type"] == "numeric":
                lo, hi = f.get("hard_limits", (None, None))
                spec.update(min=f["min"], max=f["max"], hard_min=lo, hard_max=hi,
                            step=float(DISPLAY["steps"].get(n, DISPLAY["steps"]["default"])))
                if n in REFERENCE_RANGES:
                    spec["normal_range"] = list(REFERENCE_RANGES[n])
            else:
                spec["allowed_values"] = f.get("allowed_values")
                if n in DISPLAY["value_labels"]:
                    spec["value_labels"] = DISPLAY["value_labels"][n]
            feats.append(spec)
        groups = [dict(key=g, label=DISPLAY["group_labels"].get(g, g), order=i) for i, g in enumerate(self.schema["groups"])]
        return dict(groups=groups, features=feats)

    # ------------------------------------------------------------------ validation
    def resolve(self, key: str) -> str:
        return self.predictor.original.get(clean_name(key), clean_name(key))

    def validate(self, features: dict) -> dict:
        """Raw payload -> canonical {name: value} for the supplied keys. 400 on label columns (leakage),
        422 with per-field messages on unknown names / wrong types / values outside physiological limits."""
        if not isinstance(features, dict):
            raise ApiError(422, "validation_error", "features must be an object {feature: value}")
        leaks = [k for k in features if self.resolve(k) in C.LABEL_COLUMNS]
        if leaks:
            raise ApiError(400, "label_as_input",
                           f"{', '.join(leaks)} {'is a' if len(leaks) == 1 else 'are'} diagnostic label"
                           f"{'' if len(leaks) == 1 else 's'} (Cath / LAD / LCX / RCA) and can never be a model input.",
                           {k: "Diagnostic labels cannot be used as inputs." for k in leaks})
        out, errors = {}, {}
        for key, value in features.items():
            name = self.resolve(key)
            f = self.fields.get(name)
            if f is None:
                errors[key] = "Unknown feature. Use a name from GET /api/schema."
                continue
            if value is None or (isinstance(value, float) and math.isnan(value)):
                continue                                          # -> schema default
            try:
                out[name] = self._canonical(name, f, value)
            except ValueError as e:
                errors[key] = str(e)
        if errors:
            n = len(errors)
            raise ApiError(422, "validation_error", f"{n} field{'s' if n > 1 else ''} could not be used.", errors)
        return out

    def _canonical(self, name: str, f: dict, value):
        label, unit = f["label"], f["unit"]
        t = f["type"]
        if t == "numeric":
            if isinstance(value, bool):
                raise ValueError(f"{label} must be a number{f' in {unit}' if unit else ''}.")
            try:
                v = float(value)
            except (TypeError, ValueError):
                raise ValueError(f"{label} must be a number{f' in {unit}' if unit else ''}.") from None
            if not math.isfinite(v):
                raise ValueError(f"{label} must be a finite number.")
            lo, hi = f.get("hard_limits", (-math.inf, math.inf))
            if not lo <= v <= hi:
                raise ValueError(f"{label} must be between {_fmt(lo)} and {_fmt(hi)}{f' {unit}' if unit else ''} "
                                 "(physiological limits).")
            return v
        s = str(value).strip().lower()
        allowed_vals = [str(a) for a in f.get("allowed_values") or []]
        if t == "binary" and set(allowed_vals) == set(_SEX.values()):     # labelled binary (dataset: "Fmale" typo)
            if s not in _SEX:
                raise ValueError(f"{label} must be {' or '.join(allowed_vals)}.")
            return _SEX[s]
        if t == "binary":
            if isinstance(value, bool):
                return int(value)
            if s in _YES:
                return 1
            if s in _NO:
                return 0
            raise ValueError(f"{label} must be Yes or No (1 or 0).")
        allowed = [str(a) for a in f["allowed_values"]]
        for a in allowed:
            if s == a.lower() or (s.replace(".0", "") == a.lower()):
                return int(a) if a.isdigit() else a             # numeric ordinal levels stay ints (schema default)
        raise ValueError(f"{label} must be one of: {', '.join(allowed)}.")

    def resolved(self, canonical: dict) -> dict:
        return {n: canonical.get(n, f["default"]) for n, f in self.fields.items()}

    # ------------------------------------------------------------------ prediction
    def _predict(self, canonical: dict) -> dict:
        try:
            return self.predictor.predict(canonical, explain=True, k=A.N_FEATURES)
        except ValueError as e:                                   # defensive: cardio_ml's own validation
            raise ApiError(422, "validation_error", str(e)) from None

    @staticmethod
    def _trim(pred: dict, k: int) -> dict:
        out = dict(pred)
        out["explanations"] = {t: v[:k] for t, v in pred["explanations"].items()}
        return out

    def summary_text(self, pred: dict) -> str:
        cad = pred["cad"]
        likely = "likely" if cad["prob"] >= cad["threshold"] else "unlikely"
        top = pred["explanations"]["cad"][:3]
        up = [_driver_phrase(e) for e in top if e["shap"] > 0]
        down = [_driver_phrase(e) for e in top if e["shap"] <= 0]
        s = (f"Model estimate: CAD {likely} ({round(cad['prob'] * 100)}%, {cad['risk_tier']} tier), with about "
             f"{pred['expected_stenotic_vessels']:.1f} of 3 main arteries expected to be narrowed.")
        parts = []
        if up:
            parts.append(f"raised mainly by {_join(up)}")
        if down:
            parts.append(f"lowered by {_join(down)}")
        if parts:
            s += " The estimate is " + "; ".join(parts) + "."
        return s

    def predict(self, features: dict, k: int, focus: str, show_territories: bool) -> dict:
        t0 = time.perf_counter()
        canonical = self.validate(features)
        pred = self._predict(canonical)
        scene = A.scene_state(pred, focus, show_territories, amap=self.amap)
        return dict(prediction=self._trim(pred, k), contributions=pred["explanations"], scene=scene,
                    summary_text=self.summary_text(pred), resolved_features=self.resolved(canonical),
                    warnings=list(scene["warnings"]), disclaimer=C.DISCLAIMER,
                    latency_ms=round((time.perf_counter() - t0) * 1000, 1))

    # ------------------------------------------------------------------ what-if / sensitivity
    def _changes(self, changes: dict) -> dict:
        allowed = list(self.amap["modifiable"]["features"])
        if not isinstance(changes, dict) or not changes:
            raise ApiError(400, "no_changes", "Provide at least one change {feature: new value}.")
        bad = [k for k in changes if self.resolve(k) not in allowed]
        if bad:
            labels = ", ".join(self.fields[n]["label"] for n in allowed)
            raise ApiError(400, "not_modifiable",
                           f"{', '.join(bad)} cannot be changed in what-if analysis. Modifiable: {labels}.",
                           {k: "Not modifiable in what-if analysis." for k in bad})
        return self.validate({self.resolve(k): v for k, v in changes.items()})

    def what_if(self, features: dict, changes: dict, focus: str) -> dict:
        t0 = time.perf_counter()
        canonical = self.validate(features)
        ch = self._changes(changes)
        try:
            r = A.what_if(canonical, ch, target_focus=focus)
        except ValueError as e:
            raise ApiError(400, "invalid_change", str(e)) from None
        return dict(before=r["before"], after=r["after"],
                    delta={t: r["delta_per_target"][t] for t in C.TARGETS}, scene_after=r["scene_after"],
                    derived_updates_applied=r["derived_updates"], applied_changes=r["applied_changes"],
                    tier_change=list(r["tier_change"]), note=r["note"], disclaimer=C.DISCLAIMER,
                    latency_ms=round((time.perf_counter() - t0) * 1000, 1))

    def sensitivity(self, features: dict, feature: str, n: int) -> dict:
        t0 = time.perf_counter()
        canonical = self.validate(features)
        name = self.resolve(feature)
        f = self.fields.get(name)
        if f is None or name not in self.amap["modifiable"]["features"] or f["type"] != "numeric":
            numeric = [m for m in self.amap["modifiable"]["features"] if self.fields[m]["type"] == "numeric"]
            raise ApiError(400, "not_modifiable_numeric",
                           f"Sensitivity curves are available for modifiable numeric features only: {', '.join(numeric)}.")
        pts = A.sensitivity_curve(canonical, name, n)
        return dict(feature=name, label=f["label"], unit=f["unit"], points=pts,
                    current_value=float(self.resolved(canonical)[name]), note=self.amap["modifiable"]["note"],
                    disclaimer=C.DISCLAIMER, latency_ms=round((time.perf_counter() - t0) * 1000, 1))

    # ------------------------------------------------------------------ examples
    def examples(self) -> list[dict]:
        if self._examples is None:
            self._examples = select_examples(self)
        return self._examples

    # ------------------------------------------------------------------ model card
    def model_card(self) -> dict:
        m, thr, amap = self.metrics, self.predictor.thresholds, self.amap
        summary = (self.artifacts / "ML_SUMMARY.md").read_text(encoding="utf-8")
        drivers = {}
        for line in summary.splitlines():
            cells = [c.strip() for c in line.strip().strip("|").split("|")]
            if len(cells) >= 8 and cells[0] in {C.TARGET_DISPLAY[t] for t in C.TARGETS}:
                key = next(t for t in C.TARGETS if C.TARGET_DISPLAY[t] == cells[0])
                drivers[key] = [d.strip() for d in cells[-1].split(",")]
        targets = []
        for t in C.TARGETS:
            sel = m["selected"][t]
            auc = float(m["holdout"][t]["auc"]["value"])
            ncv = sel.get("nested_cv_of_selected", {})
            targets.append(dict(
                key=t, label=C.TARGET_DISPLAY[t], model=sel["model"], strategy=sel.get("vessel_strategy"),
                calibration=sel.get("calibration"),
                holdout={k: {kk: float(vv) for kk, vv in v.items()} for k, v in m["holdout"][t].items()},
                nested_cv={k: float(v) for k, v in ncv.items() if isinstance(v, (int, float))},
                threshold=float(thr[t]["threshold"]), threshold_rule=thr[t]["rule"],
                reliability_badge=A.reliability_badge(auc, amap), top_drivers=drivers.get(t, []),
                positive_label=C.POSITIVE_TEXT[t], negative_label=C.NEGATIVE_TEXT[t]))
        lim = summary.split("**Limitations.**", 1)[-1].strip().split("\n\n")[0]
        lim = " ".join(lim.split())
        limitations = [s.strip() for s in re.split(r"(?<=\.)\s+(?=[A-Z])", lim) if s.strip()
                       and not s.startswith("For decision support")]
        limitations.append("Probabilities describe whole vessels: the dataset records no lesion location, so the "
                           "3D view never shows where in a vessel a narrowing might be.")
        limitations.append("What-if results are model-estimated associations, not treatment effects.")
        tiers = thr["risk_tiers"]
        figs = [("Calibration (reliability) curves", "calibration_reliability.png"),
                ("Hold-out ROC / PR / calibration: CAD", "holdout_cad.png"),
                ("Hold-out ROC / PR / calibration: LAD", "holdout_lad.png"),
                ("Hold-out ROC / PR / calibration: LCX", "holdout_lcx.png"),
                ("Hold-out ROC / PR / calibration: RCA", "holdout_rca.png"),
                ("Model comparison (nested CV AUC)", "model_zoo_auc.png"),
                ("Global SHAP importance: CAD", "shap_global_cad.png"),
                ("Ablation", "ablation.png")]
        figures = [dict(title=a, path=f"/figures/{b}") for a, b in figs if (self.artifacts / "figures" / b).exists()]
        atts = [dict(what="Dataset", text=C.DATASET_CITATION, url="https://doi.org/10.24432/C5Q31M",
                     license="CC BY 4.0")]
        for s in amap["asset"]["sources"]:
            if s.get("attribution"):
                atts.append(dict(what="3D heart model", text=s["attribution"], url=s.get("url"), license=s.get("license", "")))
        env = self.viewer_look["environment"]
        atts.append(dict(what="Lighting (HDRI)", text=f"\"{env['name']}\" by {env['author']}", url=env["source"],
                         license=env["license"]))
        for what, lic, url in (("three.js / React Three Fiber / drei", "MIT", "https://threejs.org"),
                               ("React", "MIT", "https://react.dev"), ("FastAPI", "MIT", "https://fastapi.tiangolo.com"),
                               ("scikit-learn", "BSD-3-Clause", "https://scikit-learn.org"),
                               ("XGBoost", "Apache-2.0", "https://xgboost.ai"),
                               ("SHAP", "MIT", "https://github.com/shap/shap"),
                               ("Inter / JetBrains Mono fonts", "OFL-1.1", "https://rsms.me/inter/")):
            atts.append(dict(what="Library", text=what, url=url, license=lic))
        cal = [{k: (v if isinstance(v, (int, float, str)) else str(v)) for k, v in row.items()} for row in m["calibration"]]
        return dict(
            dataset_citation=C.DATASET_CITATION, n_patients=int(self.metrics.get("n_patients", 303)),
            n_holdout=len(json.loads((self.artifacts / "split.json").read_text())["test_idx"]), single_centre=True,
            validation={k: v for k, v in m["validation"].items()},
            targets=targets,
            risk_tiers=dict(low=float(tiers["low"]), high=float(tiers["high"]),
                            rule=f"Low: CAD probability < {tiers['low']:.2f} (at most 5% of CAD patients); High: >= "
                                 f"{tiers['high']:.2f} (at most 10% of non-CAD patients); otherwise Moderate. "
                                 "Derived from out-of-fold predictions."),
            reliability_cutoffs={r["badge"]: r["min_auc"] for r in amap["style"]["reliability"]},
            calibration=cal, limitations=limitations, figures=figures, attributions=atts, disclaimer=C.DISCLAIMER)


# ============================================================================ helpers
def _driver_phrase(e: dict) -> str:
    v, unit, lab = e["value"], e["unit"], e["label"].split(" (")[0]
    if not (len(lab) > 1 and lab[:2].isupper()):                # keep acronyms (LDL, EF-TTE, BMI) as written
        lab = lab[0].lower() + lab[1:]
    if isinstance(v, (int, float)) and str(v) in {"0", "1"} and not unit:
        return lab if int(v) == 1 else f"no {lab}"
    if unit:
        return f"{lab} {_fmt(float(v)) if isinstance(v, (int, float)) else v} {unit}"
    return f"{lab} {v}"


def _join(xs: list[str]) -> str:
    return xs[0] if len(xs) == 1 else ", ".join(xs[:-1]) + " and " + xs[-1]


def select_examples(svc: Services) -> list[dict]:
    """6 curated hold-out patients chosen deterministically from split.json test indices."""
    from cardio_ml.data import get_features, get_targets, load_raw
    df, _ = load_raw()
    X, Y = get_features(df), get_targets(df)
    test_idx = json.loads((svc.artifacts / "split.json").read_text())["test_idx"]
    rows = []
    for i in test_idx:
        raw = {k: (v.item() if hasattr(v, "item") else v) for k, v in X.iloc[i].items()}
        feats = svc.validate(raw)
        p = svc.predictor.predict(feats, explain=False)
        rows.append(dict(i=i, f=feats, p=p, y={t: bool(Y.iloc[i][t]) for t in C.TARGETS}))
    tiers = svc.predictor.thresholds["risk_tiers"]
    DC = DISPLAY["examples"]["diabetic_case"]
    chosen: list[int] = []

    def pick(cands, key, title_hint):
        c = [r for r in cands if r["i"] not in chosen]
        if not c:
            c = [r for r in rows if r["i"] not in chosen]
        r = sorted(c, key=lambda r: (key(r), r["i"]))[0]
        chosen.append(r["i"])
        return r, title_hint

    fl = lambda r, v: r["p"][v]["prob"] >= r["p"][v]["threshold"]           # noqa: E731
    picks = [
        pick(rows, lambda r: r["p"]["cad"]["prob"], ("low", "Clear low-risk example")),
        pick([r for r in rows if r["p"]["cad"]["risk_tier"] == "Moderate"],
             lambda r: abs(r["p"]["cad"]["prob"] - (tiers["low"] + tiers["high"]) / 2), ("moderate", "Borderline / moderate risk")),
        pick([r for r in rows if r["p"]["cad"]["risk_tier"] == "High" and fl(r, "lad") and not fl(r, "lcx") and not fl(r, "rca")],
             lambda r: -r["p"]["lad"]["prob"], ("lad", "High risk · single vessel (LAD)")),
        pick([r for r in rows if r["p"]["cad"]["risk_tier"] == "High"],
             lambda r: (-sum(fl(r, v) for v in C.VESSELS), -r["p"]["expected_stenotic_vessels"]),
             ("multi", "High risk · multi-vessel")),
        pick([r for r in rows if all(int(r["f"].get(k, 0)) == 1 for k in DC["require_all"])] or
             [r for r in rows if all(int(r["f"].get(k, 0)) == 1 for k in DC["fallback_require"])],
             lambda r: -r["p"]["cad"]["prob"], ("diabetic", "Diabetic with atypical chest pain")),
        pick([r for r in rows if fl(r, "cad") != r["y"]["cad"]],
             lambda r: -abs(r["p"]["cad"]["prob"] - r["y"]["cad"]), ("uncertain", "Model uncertainty example")),
    ]
    out = []
    for r, (eid, subtitle) in picks:
        f = svc.resolved(r["f"])
        out.append(dict(id=eid, title=_title(f), subtitle=subtitle, features=f, true_labels=r["y"],
                        featured=eid == DISPLAY["examples"].get("featured")))
    return out


def _title(f: dict) -> str:
    T = DISPLAY["examples"]["title"]
    sex = T["sex_short"].get(str(f[T["sex_feature"]]), str(f[T["sex_feature"]]))
    pain = next((txt for k, txt in T["pain"] if int(f[k])), T["no_pain"])
    extras = [w for k, w in T["flags"] if int(f[k])]
    return " · ".join([f"{int(float(f[T['age_feature']]))} {sex}", pain] + extras[: T["max_flags"]])
