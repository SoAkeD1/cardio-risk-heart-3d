"""Step 5 tests: anatomy map, colour scale, scene state, what-if, contracts.

Run:  python -m pytest tests -q
Update snapshots (only after an intended change):  UPDATE_SNAPSHOTS=1 python -m pytest tests -q
"""
from __future__ import annotations

import copy
import inspect
import json
import os
import struct
import time
from pathlib import Path

import jsonschema
import numpy as np
import pytest

from cardio_ml import anatomy as A
from cardio_ml import config as C
from cardio_ml.data import get_features, load_raw

SNAP_DIR = Path(__file__).parent / "snapshots"
SNAP_PATIENTS = 3


# ---------------------------------------------------------------------------- fixtures
@pytest.fixture(scope="session")
def amap():
    return A.load_map()


@pytest.fixture(scope="session")
def holdout_patients():
    df, _ = load_raw()
    X = get_features(df)
    te = json.loads((C.ARTIFACTS_DIR / "split.json").read_text())["test_idx"]
    return [(i, {k: (v.item() if hasattr(v, "item") else v) for k, v in X.iloc[i].items()}) for i in te]


@pytest.fixture(scope="session")
def predictions(holdout_patients):
    from cardio_ml.predict import predict_patient
    return [predict_patient(p, k=A.N_FEATURES) for _, p in holdout_patients[:SNAP_PATIENTS]]


def _fake_prediction(probs: dict, thresholds: dict | None = None):
    thr = thresholds or {"cad": 0.195, "lad": 0.465, "lcx": 0.29, "rca": 0.275}
    pred = {t: dict(prob=float(probs[t]), threshold=thr[t], label="x") for t in C.TARGETS}
    pred["cad"]["risk_tier"] = "Moderate"
    pred["expected_stenotic_vessels"] = sum(probs[v] for v in C.VESSELS)
    pred["warnings"], pred["disclaimer"] = [], C.DISCLAIMER
    return pred


# ---------------------------------------------------------------------------- 1. vessels
def test_each_vessel_has_exactly_one_entry_and_unique_meshes(amap):
    keys = [v["key"] for v in amap["vessels"]]
    assert sorted(keys) == sorted(C.VESSELS) and len(keys) == len(set(keys))
    meshes = [m for v in amap["vessels"] for m in v["mesh_names"]]
    assert len(meshes) == len(set(meshes))
    all_risk_meshes = meshes + [m for t in amap["territories"]["entries"] for m in t["mesh_names"]]
    neutral = [m for ns in amap["neutral_structures"] for m in ns["mesh_names"]]
    assert not set(all_risk_meshes) & set(neutral), "unmodelled branches must never be risk-coloured"


# ---------------------------------------------------------------------------- 2. body regions
def test_every_feature_maps_to_exactly_one_region(amap):
    schema = json.loads((C.ARTIFACTS_DIR / "feature_schema.json").read_text(encoding="utf-8"))
    names = [f["name"] for f in schema["features"]]
    assert len(names) == 55
    mapped = [f for r in amap["body_regions"] for f in r["features"]]
    assert sorted(mapped) == sorted(names), (set(names) - set(mapped), set(mapped) - set(names))
    assert len(mapped) == len(set(mapped)), "a feature is mapped to more than one region"


# ---------------------------------------------------------------------------- 3. no feature -> location
def test_no_feature_chooses_a_vessel_or_location(amap, predictions):
    pred = predictions[0]
    base = A.scene_state(pred)
    tampered = copy.deepcopy(pred)
    for t in C.TARGETS:                          # change every explained feature value, incl. region_rwma
        for e in tampered["explanations"][t]:
            e["value"] = 4 if e["feature"] == "region_rwma" else "changed"
    s2 = A.scene_state(tampered)
    for m, vis in base["meshes"].items():
        for k in ("color", "flagged", "pulse_hz", "emissive", "target", "visible"):
            assert s2["meshes"][m][k] == vis[k]
    # vessel entries carry no feature references; the code never reads a feature to pick a mesh
    assert all(set(v) == {"key", "mesh_names", "display_name", "short_description", "camera_anchor",
                          "territory_key"} for v in amap["vessels"])
    src = inspect.getsource(A.scene_state) + inspect.getsource(A._vessel_visual)
    assert "region_rwma" not in src and "rwma" not in src.lower()


# ---------------------------------------------------------------------------- 4. colour scale
def test_colour_scale_monotonic_in_lightness(amap):
    ps = np.linspace(0, 1, 201)
    L = np.array([A.lightness(A.color_for(p, amap)) for p in ps])
    assert np.all(np.diff(L) < 0), "CIELAB L* must strictly decrease with probability"
    assert A.color_for(-1, amap) == A.color_for(0, amap) and A.color_for(2, amap) == A.color_for(1, amap)
    # same probability -> same colour for every vessel (one shared scale)
    s = A.scene_state(_fake_prediction({"cad": .5, "lad": .4, "lcx": .4, "rca": .4}))
    assert len({s["vessels"][v]["color"] for v in C.VESSELS}) == 1


# ---------------------------------------------------------------------------- 5. flags
def test_flag_equals_prob_ge_threshold():
    rng = np.random.default_rng(0)
    for _ in range(300):
        probs = {t: float(rng.uniform()) for t in C.TARGETS}
        s = A.scene_state(_fake_prediction(probs))
        for v in C.VESSELS:
            thr = s["vessels"][v]["threshold"]
            assert s["vessels"][v]["flagged"] == (probs[v] >= thr)
            mesh = s["meshes"][s["vessels"][v]["mesh_names"][0]]
            assert mesh["flagged"] == s["vessels"][v]["flagged"]
            assert (mesh["badge"] is not None) == mesh["flagged"]          # non-colour cue
            assert (mesh["pulse_hz"] > 0) == mesh["flagged"]


# ---------------------------------------------------------------------------- 6. schema
def test_scene_state_validates_against_schema(predictions):
    schema = json.loads((C.ARTIFACTS_DIR / "scene_state.schema.json").read_text(encoding="utf-8"))
    for pred in predictions:
        for focus in C.TARGETS:
            for terr in (False, True):
                jsonschema.validate(A.scene_state(pred, focus, terr), schema)


# ---------------------------------------------------------------------------- 7. snapshots
def _normalise(x):
    if isinstance(x, float):
        return round(x, 3)
    if isinstance(x, dict):
        return {k: _normalise(v) for k, v in x.items()}
    if isinstance(x, list):
        return [_normalise(v) for v in x]
    return x


def test_snapshots_stable(holdout_patients, predictions):
    SNAP_DIR.mkdir(exist_ok=True)
    for (idx, _), pred in zip(holdout_patients, predictions):
        state = _normalise(json.loads(json.dumps(A.scene_state(pred), ensure_ascii=False)))
        f = SNAP_DIR / f"scene_patient_{idx}.json"
        if os.environ.get("UPDATE_SNAPSHOTS") == "1" or not f.exists():
            f.write_text(json.dumps(state, indent=1, ensure_ascii=False), encoding="utf-8")
            if os.environ.get("UPDATE_SNAPSHOTS") != "1":
                pytest.fail(f"snapshot {f.name} was missing and has been created - rerun")
        assert state == json.loads(f.read_text(encoding="utf-8")), f"scene for patient {idx} changed"


def test_scene_state_is_pure(predictions):
    p = copy.deepcopy(predictions[1])
    assert A.scene_state(p, "rca", True) == A.scene_state(p, "rca", True)
    assert p == predictions[1], "scene_state must not mutate its input"


# ---------------------------------------------------------------------------- 8. what-if
def test_what_if_rejects_non_modifiable(holdout_patients):
    _, p = holdout_patients[0]
    for bad in ({"age": 40}, {"sex": "Female"}, {"st_elevation": 0}, {"EF-TTE": 60}, {"region_rwma": 0}):
        with pytest.raises(ValueError, match="not modifiable"):
            A.what_if(p, bad)
    with pytest.raises(ValueError, match="Unknown"):
        A.what_if(p, {"cholesterol": 150})


def test_what_if_deltas_sum_and_caveat(holdout_patients):
    _, p = holdout_patients[2]
    r = A.what_if(p, {"LDL": 80, "bp": 120, "current_smoker": 0})
    for t in C.TARGETS:
        assert abs(r["before"][t]["prob"] + r["delta_per_target"][t] - r["after"][t]["prob"]) < 1e-3
    ev = r["before"]["expected_stenotic_vessels"] + r["delta_per_target"]["expected_stenotic_vessels"]
    assert abs(ev - r["after"]["expected_stenotic_vessels"]) < 1e-3
    assert "not causal" in r["note"].lower() or "correlational" in r["note"].lower()
    assert "treatment effect" not in r["note"].lower().replace("not a treatment effect", "")
    assert r["scene_after"]["disclaimer"] == C.DISCLAIMER


def test_weight_bmi_consistency(holdout_patients):
    _, p = holdout_patients[0]
    r = A.what_if(p, {"weight": 60})
    h = float(p["length"]) / 100
    assert abs(r["derived_updates"]["bmi"] - 60 / h ** 2) < 0.01


# ---------------------------------------------------------------------------- 9. latency
def test_latency(predictions, holdout_patients, amap):
    pred = predictions[0]
    A.scene_state(pred)
    t0 = time.perf_counter()
    for _ in range(200):
        A.scene_state(pred)
    assert (time.perf_counter() - t0) / 200 * 1000 < amap["style"]["latency_budget_ms"]["scene_state"]
    _, p = holdout_patients[0]
    A.sensitivity_curve(p, "ldl")
    t0 = time.perf_counter()
    curve = A.sensitivity_curve(p, "ldl")
    assert (time.perf_counter() - t0) * 1000 < amap["style"]["latency_budget_ms"]["sensitivity_curve"]
    assert len(curve) == amap["style"]["sensitivity_points"]
    assert all(0 <= c[t] <= 1 for c in curve for t in C.TARGETS)


# ---------------------------------------------------------------------------- 10. disclaimer
def test_disclaimer_everywhere(predictions):
    for pred in predictions:
        for focus in C.TARGETS:
            assert A.scene_state(pred, focus)["disclaimer"] == C.DISCLAIMER


# ---------------------------------------------------------------------------- contracts
def _make_glb(path: Path, mesh_names, anchor_names, triangles=12):
    gltf = {"asset": {"version": "2.0"}, "extensionsUsed": ["KHR_draco_mesh_compression"],
            "accessors": [{"count": triangles * 3, "componentType": 5123, "type": "SCALAR"}],
            "meshes": [{"name": m, "primitives": [{"attributes": {}, "indices": 0, "material": 0}]}
                       for m in mesh_names],
            "nodes": [{"name": m, "mesh": i} for i, m in enumerate(mesh_names)] +
                     [{"name": a} for a in anchor_names]}
    js = json.dumps(gltf).encode()
    js += b" " * ((4 - len(js) % 4) % 4)
    body = struct.pack("<I4s", len(js), b"JSON") + js
    path.write_bytes(struct.pack("<4sII", b"glTF", 2, 12 + len(body)) + body)


def test_validate_glb_names(tmp_path, amap):
    req = A.required_names(amap)
    good = tmp_path / "good.glb"
    _make_glb(good, req["meshes"], req["anchors"])
    rep = A.validate_glb_names(good, amap)
    assert rep["ok"], rep
    bad = tmp_path / "bad.glb"
    _make_glb(bad, [m for m in req["meshes"] if m != "Coronary_LCX"], req["anchors"][1:], triangles=200000)
    rep = A.validate_glb_names(bad, amap)
    assert not rep["ok"] and "Coronary_LCX" in rep["missing_meshes"] and rep["missing_anchors"] and rep["errors"]


def test_no_hardcoded_mesh_names_in_code(amap):
    src = inspect.getsource(A)
    for m in A.required_names(amap)["meshes"]:
        assert f'"{m}"' not in src and f"'{m}'" not in src, f"mesh name {m} hardcoded in anatomy.py"


@pytest.mark.parametrize("name", ["heart.glb", "heart_lite.glb"])
def test_step6_assets_pass_contract(name, amap):
    path = C.ARTIFACTS_DIR / name
    if not path.exists():
        pytest.skip(f"{name} not built yet (python blender/make_all.py)")
    rep = A.validate_glb_names(path, amap)
    assert rep["ok"], rep
    assert not rep["warnings"], rep["warnings"]          # Draco must be present
