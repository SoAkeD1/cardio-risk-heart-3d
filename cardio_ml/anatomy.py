"""Step 5: prediction -> anatomy mapping layer.

Turns ``predict_patient()`` output into a deterministic, render-ready *scene state* for the 3D
heart / torso, and defines the contracts later steps must follow (mesh names, JSON Schema,
asset spec, glb validator).

Design rules (enforced here and in tests/test_anatomy.py):
* All mesh names, texts and visual constants come from ``artifacts/anatomy_map.json``.
* Vessel colour depends ONLY on that vessel's calibrated probability (one shared scale);
  the flag depends ONLY on prob >= that vessel's threshold. No clinical feature (e.g. Region
  RWMA) ever chooses a vessel, a segment or a location.
* Whole vessels are coloured uniformly - the dataset has no lesion location.
* Body-region glows mark where a contributing risk factor lives, not where disease is.
"""
from __future__ import annotations

import json
import struct
from functools import lru_cache
from pathlib import Path

import numpy as np
import pandas as pd

from . import config as C
from .data import clean_name

MAP_PATH = C.ARTIFACTS_DIR / "anatomy_map.json"
SCHEMA_VERSION = "1.0"
N_FEATURES = len(C.FEATURES)


# ============================================================================ map loading
@lru_cache(maxsize=4)
def _load(path: str) -> dict:
    amap = json.loads(Path(path).read_text(encoding="utf-8"))
    metrics = json.loads((C.ARTIFACTS_DIR / "metrics.json").read_text(encoding="utf-8"))
    amap["_holdout_auc"] = {t: float(metrics["holdout"][t]["auc"]["value"]) for t in C.TARGETS}
    amap["_feature_region"] = {f: r["region"] for r in amap["body_regions"] for f in r["features"]}
    amap["_region"] = {r["region"]: r for r in amap["body_regions"]}
    amap["_vessel"] = {v["key"]: v for v in amap["vessels"]}
    amap["_territory"] = {t["key"]: t for t in amap["territories"]["entries"]}
    amap["_lab_stops"] = [(float(p), _hex_to_lab(h)) for p, h in amap["style"]["color_scale"]["stops"]]
    return amap


def load_map(path: str | Path | None = None) -> dict:
    """Load anatomy_map.json (+ hold-out AUCs from metrics.json). Cached; treat as read-only."""
    return _load(str(Path(path or MAP_PATH).resolve()))


# ============================================================================ colour (CIELAB)
def _srgb_to_lin(c):
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def _lin_to_srgb(c):
    return np.where(c <= 0.0031308, 12.92 * c, 1.055 * np.power(np.clip(c, 0, None), 1 / 2.4) - 0.055)


_M = np.array([[0.4124564, 0.3575761, 0.1804375],
               [0.2126729, 0.7151522, 0.0721750],
               [0.0193339, 0.1191920, 0.9503041]])
_WHITE = np.array([0.95047, 1.0, 1.08883])


def _hex_to_lab(h: str) -> np.ndarray:
    rgb = np.array([int(h.lstrip("#")[i:i + 2], 16) / 255 for i in (0, 2, 4)])
    xyz = _M @ _srgb_to_lin(rgb) / _WHITE
    f = np.where(xyz > (6 / 29) ** 3, np.cbrt(xyz), xyz / (3 * (6 / 29) ** 2) + 4 / 29)
    return np.array([116 * f[1] - 16, 500 * (f[0] - f[1]), 200 * (f[1] - f[2])])


def _lab_to_hex(lab: np.ndarray) -> str:
    fy = (lab[0] + 16) / 116
    f = np.array([fy + lab[1] / 500, fy, fy - lab[2] / 200])
    xyz = np.where(f > 6 / 29, f ** 3, 3 * (6 / 29) ** 2 * (f - 4 / 29)) * _WHITE
    rgb = np.clip(_lin_to_srgb(np.linalg.solve(_M, xyz)), 0, 1)
    return "#" + "".join(f"{int(round(v * 255)):02X}" for v in rgb)


def lightness(hex_color: str) -> float:
    """CIELAB L* of a hex colour."""
    return float(_hex_to_lab(hex_color)[0])


def color_for(prob: float, amap: dict | None = None) -> str:
    """Hex colour of a probability on the shared sequential scale (interpolated in CIELAB, so
    lightness decreases monotonically from neutral tissue to deep red)."""
    amap = amap or load_map()
    stops = amap["_lab_stops"]
    p = float(np.clip(prob, stops[0][0], stops[-1][0]))
    for (p0, l0), (p1, l1) in zip(stops[:-1], stops[1:]):
        if p <= p1:
            w = 0.0 if p1 == p0 else (p - p0) / (p1 - p0)
            return _lab_to_hex(l0 + w * (l1 - l0))
    return _lab_to_hex(stops[-1][1])


def reliability_badge(auc: float, amap: dict) -> str:
    for r in amap["style"]["reliability"]:          # ordered high -> low
        if auc >= r["min_auc"]:
            return r["badge"]
    return amap["style"]["reliability"][-1]["badge"]


# ============================================================================ scene state
def _r(x, d=4):
    return round(float(x), d)


def _check_prediction(pred: dict) -> None:
    missing = [k for k in [*C.TARGETS, "expected_stenotic_vessels", "disclaimer"] if k not in pred]
    if missing:
        raise ValueError(f"prediction is missing keys {missing}; pass the output of predict_patient()")
    for t in C.TARGETS:
        if not {"prob", "threshold", "label"} <= set(pred[t]):
            raise ValueError(f"prediction['{t}'] needs prob, threshold and label")


def _vessel_visual(prob: float, thr: float, amap: dict) -> dict:
    sv = amap["style"]["vessel"]
    flagged = bool(prob >= thr)
    excess = float(np.clip((prob - thr) / max(1e-9, 1 - thr), 0, 1))
    return dict(
        color=color_for(prob, amap), opacity=sv["opacity"], flagged=flagged,
        emissive=sv["emissive_flagged"] if flagged else sv["emissive_unflagged"],
        pulse_hz=_r(sv["pulse_hz_min"] + (sv["pulse_hz_max"] - sv["pulse_hz_min"]) * excess, 3)
        if flagged else sv["pulse_hz_unflagged"],
        outline_color=sv["outline_color"] if flagged else None,
        badge=sv["badge_text"] if flagged else None)


def _region_layer(pred: dict, target: str, amap: dict) -> tuple[list, list]:
    expl = (pred.get("explanations") or {}).get(target, [])
    warnings = []
    if not expl:
        return [], [f"no explanations for '{target}' in prediction - region layer empty"]
    if len(expl) < N_FEATURES - len(C.DROP_CONSTANT):
        warnings.append(f"region layer uses only the top {len(expl)} features of '{target}'; call "
                        f"predict_patient(..., k={N_FEATURES}) for complete regional totals")
    sums, feats = {}, {}
    for e in expl:
        reg = amap["_feature_region"][e["feature"]]
        sums[reg] = sums.get(reg, 0.0) + float(e["shap"])
        feats.setdefault(reg, []).append(e)
    max_abs = max((abs(v) for v in sums.values()), default=0.0) or 1.0
    st = amap["style"]["regions"]
    ranked = sorted(sums, key=lambda r: (-abs(sums[r]), r))[: st["top_n"]]
    out = []
    for reg in ranked:
        meta = amap["_region"][reg]
        raises = sums[reg] > 0
        labels = [e["label"] for e in sorted(feats[reg], key=lambda e: -abs(e["shap"]))]
        direction = "raises" if raises else "lowers"
        out.append(dict(
            region=reg, display_name=meta["display_name"], mesh_names=list(meta["mesh_names"]),
            camera_anchor=meta["camera_anchor"], intensity=_r(abs(sums[reg]) / max_abs),
            net_shap=_r(sums[reg], 5), direction=direction,
            color=st["raises_color"] if raises else st["lowers_color"],
            icon=st["raises_icon"] if raises else st["lowers_icon"], features=labels,
            tooltip=amap["region_tooltip"].format(display_name=meta["display_name"],
                                                  target=C.TARGET_DISPLAY[target],
                                                  direction=f"{direction} risk", features=", ".join(labels))))
    return out, warnings


def scene_state(prediction: dict, target_focus: str = "cad", show_territories: bool = False,
                amap: dict | None = None) -> dict:
    """Pure function: predict_patient() output -> render-ready scene state (see
    artifacts/scene_state.schema.json). Same input -> same output."""
    amap = amap or load_map()
    _check_prediction(prediction)
    if target_focus not in C.TARGETS:
        raise ValueError(f"target_focus must be one of {list(C.TARGETS)}")
    st = amap["style"]
    meshes, vessels = {}, {}

    for v in C.VESSELS:
        meta, pv = amap["_vessel"][v], prediction[v]
        vis = _vessel_visual(pv["prob"], pv["threshold"], amap)
        auc = amap["_holdout_auc"][v]
        rel = reliability_badge(auc, amap)
        tooltip = st["vessel"]["tooltip"].format(
            display_name=meta["display_name"], short_description=meta["short_description"],
            prob=pv["prob"], threshold=pv["threshold"], reliability=rel, holdout_auc=auc,
            flag_text=st["vessel"]["flag_text"] if vis["flagged"] else "")
        for m in meta["mesh_names"]:
            meshes[m] = dict(vis, target=v, visible=True, tooltip=tooltip)
        drivers = [{k: e[k] for k in ("label", "value", "unit", "contribution_pct", "direction")}
                   for e in (prediction.get("explanations") or {}).get(v, [])[: st["top_drivers_n"]]]
        vessels[v] = dict(prob=_r(pv["prob"]), threshold=_r(pv["threshold"]), flagged=vis["flagged"],
                          label=pv["label"], color=vis["color"], badge=vis["badge"], reliability=rel,
                          holdout_auc=_r(auc, 3), top_drivers=drivers, tooltip=tooltip,
                          display_name=meta["display_name"], camera_anchor=meta["camera_anchor"],
                          mesh_names=list(meta["mesh_names"]))
        terr = amap["_territory"][meta["territory_key"]]
        for m in terr["mesh_names"]:
            meshes[m] = dict(color=vis["color"], emissive=0.0, pulse_hz=0.0, flagged=False, target=v,
                             outline_color=None, badge=None, visible=bool(show_territories),
                             opacity=st["territory"]["opacity"] if show_territories else 0.0,
                             tooltip=amap["territories"]["tooltip"])

    for ns in amap["neutral_structures"]:
        for m in ns["mesh_names"]:
            meshes[m] = dict(color=ns["color"], opacity=ns["opacity"], emissive=0.0, pulse_hz=0.0,
                             flagged=False, target=None, outline_color=None, badge=None,
                             visible=True, tooltip=ns["tooltip"])

    cad = prediction["cad"]
    tier = cad.get("risk_tier", "Moderate")
    ht = st["heart_tiers"][tier]
    heart_tip = amap["heart"]["tooltip"].format(risk_tier=tier, cad_prob=cad["prob"],
                                                expected_stenotic_vessels=prediction["expected_stenotic_vessels"])
    for m in amap["heart"]["mesh_names"]:
        meshes[m] = dict(color=ht["color"], opacity=1.0, emissive=ht["emissive"], pulse_hz=ht["pulse_hz"],
                         flagged=bool(cad["prob"] >= cad["threshold"]), target="cad", outline_color=None,
                         badge=None, visible=True, tooltip=heart_tip)

    regions, warns = _region_layer(prediction, target_focus, amap)
    focus_anchor = amap["heart"]["camera_anchor"] if target_focus == "cad" else \
        amap["_vessel"][target_focus]["camera_anchor"]
    return {
        "version": SCHEMA_VERSION,
        "target_focus": target_focus,
        "focus_camera_anchor": focus_anchor,
        "show_territories": bool(show_territories),
        "meshes": meshes,
        "vessels": vessels,
        "heart": dict(cad_prob=_r(cad["prob"]), threshold=_r(cad["threshold"]), label=cad["label"],
                      risk_tier=tier, expected_stenotic_vessels=_r(prediction["expected_stenotic_vessels"], 3),
                      reliability=reliability_badge(amap["_holdout_auc"]["cad"], amap),
                      holdout_auc=_r(amap["_holdout_auc"]["cad"], 3), tooltip=heart_tip,
                      camera_anchor=amap["heart"]["camera_anchor"]),
        "regions": regions,
        "legend": dict(
            stops=[{"p": float(p), "color": h} for p, h in st["color_scale"]["stops"]],
            meaning=st["color_scale"]["meaning"],
            threshold_markers={v: _r(prediction[v]["threshold"]) for v in C.VESSELS},
            reliability_cutoffs={r["badge"]: r["min_auc"] for r in st["reliability"]},
            risk_tiers=list(st["heart_tiers"])),
        "warnings": list(prediction.get("warnings", [])) + warns,
        "disclaimer": C.DISCLAIMER,
    }


def predict_scene(patient: dict, target_focus: str = "cad", show_territories: bool = False) -> dict:
    """Convenience: predict_patient (all features explained) + scene_state."""
    from .predict import predict_patient
    pred = predict_patient(patient, k=N_FEATURES)
    return scene_state(pred, target_focus, show_territories)


# ============================================================================ what-if
def _resolve_name(key: str, predictor) -> str:
    return predictor.original.get(clean_name(key), clean_name(key))


def _as01(v) -> int:
    return int(str(v).strip().lower() in {"1", "1.0", "y", "yes", "true"})


def _apply_changes(row: dict, changes: dict, amap: dict) -> tuple[dict, dict]:
    """Apply validated changes + derived updates (weight<->bmi, obesity, smoking status)."""
    new, derived = dict(row), {}
    new.update(changes)
    h2 = (float(row["length"]) / 100) ** 2
    if "weight" in changes and "bmi" not in changes:
        derived["bmi"] = round(float(changes["weight"]) / h2, 2)
    elif "bmi" in changes and "weight" not in changes:
        derived["weight"] = round(float(changes["bmi"]) * h2, 1)
    elif "bmi" in changes and "weight" in changes:
        if abs(float(changes["weight"]) / h2 - float(changes["bmi"])) > 0.5:
            raise ValueError("weight and bmi changed inconsistently for this patient's height; change one of them")
    new.update(derived)
    if "weight" in changes or "bmi" in changes:
        ob = int(float(new["bmi"]) >= amap["modifiable"]["obesity_bmi_cutoff"])
        if ob != _as01(row["obesity"]):
            derived["obesity"] = ob
        new["obesity"] = ob
    if "current_smoker" in changes:
        cur, was = _as01(changes["current_smoker"]), _as01(row["current_smoker"])
        if cur == 1:
            derived["ex_smoker"] = 0
        elif was == 1:
            derived["ex_smoker"] = 1          # quitting makes the patient an ex-smoker
        new.update({k: v for k, v in derived.items() if k == "ex_smoker"})
    return new, derived


def _validate_changes(changes: dict, predictor, amap: dict) -> dict:
    if not isinstance(changes, dict) or not changes:
        raise ValueError("changes must be a non-empty dict {feature: new_value}")
    allowed = set(amap["modifiable"]["features"])
    out = {}
    for k, v in changes.items():
        name = _resolve_name(k, predictor)
        if name not in predictor.fields:
            raise ValueError(f"Unknown feature '{k}'")
        if name not in allowed:
            raise ValueError(f"'{k}' is not modifiable in what-if analysis (only {sorted(allowed)}). "
                             "Age, sex, ECG and echo findings cannot be changed.")
        out[name] = v
    return out


def what_if(patient: dict, changes: dict, target_focus: str = "cad") -> dict:
    """Model-estimated effect of changing modifiable risk factors. NOT a treatment effect."""
    from .predict import get_predictor
    amap = load_map()
    pr = get_predictor()
    ch = _validate_changes(changes, pr, amap)
    X0, _ = pr.to_frame(patient)
    row = X0.iloc[0].to_dict()
    new_row, derived = _apply_changes(row, ch, amap)
    before = pr.predict(row, explain=True, k=N_FEATURES)
    after = pr.predict(new_row, explain=True, k=N_FEATURES)
    delta = {t: _r(after[t]["prob"] - before[t]["prob"]) for t in C.TARGETS}
    delta["expected_stenotic_vessels"] = _r(after["expected_stenotic_vessels"] - before["expected_stenotic_vessels"])
    return dict(before=before, after=after, delta_per_target=delta,
                applied_changes=ch, derived_updates=derived,
                tier_change=(before["cad"]["risk_tier"], after["cad"]["risk_tier"]),
                scene_before=scene_state(before, target_focus, amap=amap),
                scene_after=scene_state(after, target_focus, amap=amap),
                note=amap["modifiable"]["note"], disclaimer=C.DISCLAIMER)


def sensitivity_curve(patient: dict, feature: str, n: int | None = None) -> list[dict]:
    """Sweep one modifiable feature over its training range (schema min/max) -> probabilities.
    Predictions only (no explanations), batched for speed."""
    from .predict import get_predictor
    amap = load_map()
    pr = get_predictor()
    name = list(_validate_changes({feature: None}, pr, amap))[0]
    n = n or amap["style"]["sensitivity_points"]
    f = pr.fields[name]
    values = [0, 1] if f["type"] == "binary" else np.linspace(f["min"], f["max"], n).round(3).tolist()
    X0, _ = pr.to_frame(patient)
    row = X0.iloc[0].to_dict()
    rows = [_apply_changes(row, {name: v}, amap)[0] for v in values]
    X = pd.DataFrame(rows)[list(pr.fields)]
    probs = {t: pr.models[t].predict_proba(X)[:, 1] for t in C.TARGETS}
    return [dict(value=v, **{t: _r(probs[t][i]) for t in C.TARGETS}) for i, v in enumerate(values)]


# ============================================================================ asset contract
def required_names(amap: dict | None = None) -> dict:
    """Mesh and anchor names Step 6 must provide (from the map)."""
    amap = amap or load_map()
    meshes = [m for v in amap["vessels"] for m in v["mesh_names"]]
    meshes += [m for t in amap["territories"]["entries"] for m in t["mesh_names"]]
    meshes += [m for ns in amap["neutral_structures"] if ns["required"] for m in ns["mesh_names"]]
    meshes += amap["heart"]["mesh_names"]
    meshes += [m for r in amap["body_regions"] for m in r["mesh_names"]]
    optional = [m for ns in amap["neutral_structures"] if not ns["required"] for m in ns["mesh_names"]]
    anchors = [v["camera_anchor"] for v in amap["vessels"]] + [amap["heart"]["camera_anchor"]]
    anchors += [r["camera_anchor"] for r in amap["body_regions"]]
    dedup = lambda xs: list(dict.fromkeys(xs))    # noqa: E731
    return dict(meshes=dedup(meshes), anchors=dedup(anchors), optional_meshes=dedup(optional))


def _read_glb_json(path: Path) -> dict:
    data = path.read_bytes()
    magic, version, _ = struct.unpack_from("<4sII", data, 0)
    if magic != b"glTF" or version != 2:
        raise ValueError(f"{path} is not a glTF 2.0 binary (.glb)")
    length, ctype = struct.unpack_from("<I4s", data, 12)
    if ctype != b"JSON":
        raise ValueError("first glb chunk is not JSON")
    return json.loads(data[20:20 + length].decode("utf-8"))


def validate_glb_names(path: str | Path, amap: dict | None = None) -> dict:
    """Check a Step-6 .glb against the contract: required mesh + anchor names, triangle budget,
    file size, Draco compression and one material per mesh. Returns a report; ok=True to pass."""
    amap = amap or load_map()
    path = Path(path)
    gltf = _read_glb_json(path)
    req = required_names(amap)
    node_names = {n.get("name") for n in gltf.get("nodes", [])}
    mesh_names = {m.get("name") for m in gltf.get("meshes", [])}
    # a mesh may be named on the node or on the mesh itself
    named_mesh_nodes = {n.get("name") for n in gltf.get("nodes", []) if "mesh" in n}
    have_mesh = mesh_names | named_mesh_nodes
    missing_meshes = [m for m in req["meshes"] if m not in have_mesh]
    missing_anchors = [a for a in req["anchors"] if a not in node_names]
    acc = gltf.get("accessors", [])
    tris, multi_mat = 0, []
    for m in gltf.get("meshes", []):
        mats = {p.get("material") for p in m.get("primitives", [])}
        if len(mats) > 1:
            multi_mat.append(m.get("name"))
        for p in m.get("primitives", []):
            if p.get("mode", 4) == 4:
                cnt = acc[p["indices"]]["count"] if "indices" in p else \
                    acc[p["attributes"]["POSITION"]]["count"]
                tris += cnt // 3
    spec = amap["asset"]
    size_mb = path.stat().st_size / 1e6
    warnings = []
    if spec["compression"] not in gltf.get("extensionsUsed", []):
        warnings.append(f"{spec['compression']} not used")
    errors = []
    if tris > spec["max_triangles"]:
        errors.append(f"{tris} triangles > budget {spec['max_triangles']}")
    if size_mb > spec["max_file_mb"]:
        errors.append(f"file {size_mb:.1f} MB > {spec['max_file_mb']} MB")
    if multi_mat:
        errors.append(f"meshes with >1 material: {multi_mat}")
    ok = not (missing_meshes or missing_anchors or errors)
    return dict(ok=ok, missing_meshes=missing_meshes, missing_anchors=missing_anchors, errors=errors,
                warnings=warnings, triangles=tris, size_mb=round(size_mb, 2))


def write_asset_spec(path: str | Path | None = None, amap: dict | None = None) -> Path:
    """Generate artifacts/ASSET_SPEC.md (the Step 6 contract) from anatomy_map.json."""
    amap = amap or load_map()
    req = required_names(amap)
    a = amap["asset"]
    L = ["# ASSET_SPEC: 3D heart and torso (contract for Step 6)",
         "",
         "_Generated from `artifacts/anatomy_map.json` by `cardio_ml.anatomy.write_asset_spec()`. "
         "Do not edit by hand. Change the map instead._",
         "",
         "## Export",
         f"* One file, {a['format']}: {a['up_axis']}-up, in {a['units']}, with the origin at the {a['origin']}.",
         f"* **Budget:** at most {a['max_triangles']:,} triangles in total, at most {a['max_file_mb']} MB, "
         f"with `{a['compression']}`. It must run in a browser without a dedicated GPU.",
         f"* **Materials:** {a['materials']}.",
         "* **Validation:** `python -c \"from cardio_ml.anatomy import validate_glb_names as v; "
         "print(v('heart.glb'))\"` must return `ok: True`.",
         "",
         "## Required meshes (exact names)",
         "| mesh | role | colour at runtime |", "|---|---|---|"]
    for v in amap["vessels"]:
        for m in v["mesh_names"]:
            L.append(f"| `{m}` | {v['display_name']}: {v['short_description']} | "
                     "risk colour, uniform along the **whole** vessel |")
    for t in amap["territories"]["entries"]:
        for m in t["mesh_names"]:
            L.append(f"| `{m}` | AHA segments {t['aha_segments']} ({t['key'].upper()} territory) | "
                     "vessel colour at reduced opacity; hidden by default |")
    for m in amap["heart"]["mesh_names"]:
        L.append(f"| `{m}` | {amap['heart']['display_name']} | tint by CAD risk tier |")
    for ns in amap["neutral_structures"]:
        for m in ns["mesh_names"]:
            L.append(f"| `{m}`{'' if ns['required'] else ' (optional)'} | {ns['display_name']} | "
                     f"fixed neutral `{ns['color']}`, not risk-coloured |")
    for r in amap["body_regions"]:
        for m in r["mesh_names"]:
            if m not in {x for v in amap["vessels"] for x in v["mesh_names"]} | \
                    set(amap["heart"]["mesh_names"]) | {x for ns in amap["neutral_structures"] for x in ns["mesh_names"]}:
                L.append(f"| `{m}` | torso region: {r['display_name']} | glow overlay "
                         "(contributing risk factor, NOT disease location) |")
    shared = [f"`{r['region']}` -> {', '.join(f'`{m}`' for m in r['mesh_names']) or 'no mesh (HUD chip at its anchor)'}"
              for r in amap["body_regions"]]
    L += ["", "Torso-region overlay meshes (a region may reuse a heart/vessel/torso mesh as an additive glow layer, "
          "or have no mesh and be shown as a HUD chip at its anchor): " + "; ".join(shared) + "."]
    L += ["", "## Required camera anchors (empty objects)", ", ".join(f"`{x}`" for x in req["anchors"]),
          "", "Place each anchor at the centre of its structure, slightly in front of it, to act as the "
          "focus and zoom target.", "",
          "## Coronary modelling rules",
          "* Model the LAD, LCX and RCA as separate meshes along their whole course. Do **not** split them "
          "into proximal, mid or distal segments: the dataset has no lesion location.",
          "* The left main, diagonals and other branches are separate neutral meshes "
          "(tooltip: \"not modelled - no label in dataset\").",
          "* Do not bake colours or textures into the coronaries. Colour is set at runtime from the scene state.",
          f"* Territories: {amap['territories']['assumption']}",
          "* Region RWMA is a clinical input, **not** a coordinate. Nothing in the model is placed from feature "
          "values.", "",
          "## Sources and licences",
          "| source | url | licence | model / author | attribution text |", "|---|---|---|---|---|"]
    for s in a["sources"]:
        L.append(f"| {s['name']} | {s['url']} | {s['license']} | {s.get('author', '_tbd_')} | "
                 f"{s.get('attribution', '_tbd_')} |")
    out = Path(path or C.ARTIFACTS_DIR / "ASSET_SPEC.md")
    out.write_text("\n".join(L) + "\n", encoding="utf-8")
    return out


# ============================================================================ JSON Schema
def scene_state_schema() -> dict:
    num = {"type": "number"}
    prob = {"type": "number", "minimum": 0, "maximum": 1}
    hexc = {"type": "string", "pattern": "^#[0-9A-Fa-f]{6}$"}
    nul_str = {"type": ["string", "null"]}
    mesh = {"type": "object",
            "required": ["color", "emissive", "opacity", "pulse_hz", "flagged", "target", "visible", "tooltip"],
            "properties": {"color": hexc, "emissive": num, "opacity": prob, "pulse_hz": {"type": "number", "minimum": 0},
                           "flagged": {"type": "boolean"}, "target": {"enum": [*C.TARGETS, None]},
                           "visible": {"type": "boolean"}, "outline_color": {"oneOf": [hexc, {"type": "null"}]},
                           "badge": nul_str, "tooltip": {"type": "string"}}}
    driver = {"type": "object", "required": ["label", "value", "unit", "contribution_pct", "direction"],
              "properties": {"label": {"type": "string"}, "unit": {"type": "string"},
                             "contribution_pct": num, "direction": {"enum": ["raises risk", "lowers risk"]}}}
    vessel = {"type": "object",
              "required": ["prob", "threshold", "flagged", "label", "reliability", "holdout_auc", "top_drivers",
                           "tooltip", "camera_anchor", "color"],
              "properties": {"prob": prob, "threshold": prob, "flagged": {"type": "boolean"}, "label": {"type": "string"},
                             "reliability": {"enum": ["High", "Moderate", "Limited"]}, "holdout_auc": prob,
                             "top_drivers": {"type": "array", "items": driver, "maxItems": 10},
                             "tooltip": {"type": "string"}, "camera_anchor": {"type": "string"}, "color": hexc,
                             "badge": nul_str}}
    region = {"type": "object",
              "required": ["region", "mesh_names", "intensity", "direction", "features", "tooltip"],
              "properties": {"region": {"type": "string"}, "mesh_names": {"type": "array", "items": {"type": "string"}},
                             "intensity": prob, "direction": {"enum": ["raises", "lowers"]},
                             "features": {"type": "array", "items": {"type": "string"}},
                             "tooltip": {"type": "string"}, "color": hexc, "icon": {"type": "string"}}}
    return {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$id": "scene_state.schema.json",
        "title": "Track A scene state",
        "type": "object",
        "required": ["version", "meshes", "vessels", "heart", "regions", "legend", "warnings", "disclaimer"],
        "properties": {
            "version": {"const": SCHEMA_VERSION},
            "target_focus": {"enum": list(C.TARGETS)},
            "focus_camera_anchor": {"type": "string"},
            "show_territories": {"type": "boolean"},
            "meshes": {"type": "object", "additionalProperties": mesh},
            "vessels": {"type": "object", "required": list(C.VESSELS),
                        "properties": {v: vessel for v in C.VESSELS}, "additionalProperties": False},
            "heart": {"type": "object", "required": ["cad_prob", "risk_tier", "expected_stenotic_vessels"],
                      "properties": {"cad_prob": prob, "risk_tier": {"enum": ["Low", "Moderate", "High"]},
                                     "expected_stenotic_vessels": {"type": "number", "minimum": 0, "maximum": 3}}},
            "regions": {"type": "array", "items": region},
            "legend": {"type": "object", "required": ["stops", "threshold_markers"],
                       "properties": {"stops": {"type": "array", "minItems": 2},
                                      "threshold_markers": {"type": "object", "required": list(C.VESSELS)}}},
            "warnings": {"type": "array", "items": {"type": "string"}},
            "disclaimer": {"const": C.DISCLAIMER},
        },
    }


def write_schema(path: str | Path | None = None) -> Path:
    out = Path(path or C.ARTIFACTS_DIR / "scene_state.schema.json")
    out.write_text(json.dumps(scene_state_schema(), indent=1, ensure_ascii=False), encoding="utf-8")
    return out
