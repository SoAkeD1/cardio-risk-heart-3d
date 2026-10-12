"""Endpoint behaviour: shapes, leakage guard, validation, defaults, determinism, what-if, disclaimer."""
from __future__ import annotations

import jsonschema
import pytest

from cardio_ml import config as C

pytestmark = pytest.mark.anyio
SAMPLE = {"age": 63, "sex": "Male", "dm": 1, "typical_chest_pain": 1, "ldl": 160, "bp": 150}


async def test_health(client):
    r = await client.get("/api/health")
    j = r.json()
    assert r.status_code == 200 and j["status"] == "ok"
    assert set(j["models"]) == set(C.TARGETS) and j["load_ms"] > 0 and j["vessel_strategy"]


async def test_schema_lists_every_feature_with_help(client):
    j = (await client.get("/api/schema")).json()
    assert len(j["features"]) == len(C.FEATURES) == 55
    assert [g["key"] for g in j["groups"]] == C.GROUPS
    for f in j["features"]:
        assert f["help"] and f["label"] and f["group"] in C.GROUPS
        if f["type"] == "numeric":
            assert f["min"] < f["max"] and f["step"] > 0
        else:
            assert f["allowed_values"]
    bp = next(f for f in j["features"] if f["name"] == "bp")
    assert bp["normal_range"] == [90, 120] and bp["modifiable"] is True
    assert next(f for f in j["features"] if f["name"] == "age")["modifiable"] is False


async def test_examples_are_six_deterministic_deidentified(client):
    a = (await client.get("/api/examples")).json()["examples"]
    b = (await client.get("/api/examples")).json()["examples"]
    assert a == b and len(a) == 6
    assert [e["id"] for e in a] == ["low", "moderate", "lad", "multi", "diabetic", "uncertain"]
    assert any(e["subtitle"] == "Model uncertainty example" for e in a)
    for e in a:
        assert "row" not in e["title"].lower() and "#" not in e["title"]
        assert set(e["true_labels"]) == set(C.TARGETS) and len(e["features"]) == 55


async def test_predict_shape_and_scene_schema(client, scene_schema):
    r = await client.post("/api/predict", json={"features": SAMPLE, "k": 5, "focus": "lad"})
    assert r.status_code == 200
    j = r.json()
    jsonschema.validate(j["scene"], scene_schema)
    assert j["scene"]["target_focus"] == "lad"
    assert all(len(v) == 5 for v in j["prediction"]["explanations"].values())
    assert all(len(v) >= 50 for v in j["contributions"].values())
    assert j["resolved_features"]["age"] == 63 and len(j["resolved_features"]) == 55
    assert j["summary_text"].startswith("Model estimate: CAD") and j["latency_ms"] > 0
    for t in C.TARGETS:
        assert 0 <= j["prediction"][t]["prob"] <= 1


async def test_original_names_are_accepted(client):
    a = (await client.post("/api/predict", json={"features": {"Age": 63, "EF-TTE": 45, "Typical Chest Pain": 1}})).json()
    b = (await client.post("/api/predict", json={"features": {"age": 63, "ef_tte": 45, "typical_chest_pain": 1}})).json()
    assert a["prediction"]["cad"] == b["prediction"]["cad"]


@pytest.mark.parametrize("label", ["Cath", "LAD", "LCX", "RCA", "lad"])
async def test_leakage_labels_rejected(client, label):
    r = await client.post("/api/predict", json={"features": {label: 1}})
    assert r.status_code == 400
    e = r.json()["error"]
    assert e["code"] == "label_as_input" and "never be a model input" in e["message"]


async def test_invalid_inputs_return_field_messages(client):
    r = await client.post("/api/predict", json={"features": {"bp": "high", "age": 300, "cholesterol": 5, "sex": "x"}})
    assert r.status_code == 422
    f = r.json()["error"]["fields"]
    assert "Systolic blood pressure must be a number in mmHg" in f["bp"]
    assert "between 18 and 110 years" in f["age"]
    assert "Unknown feature" in f["cholesterol"] and "Male or Female" in f["sex"]


async def test_malformed_body_is_422_not_500(client):
    r = await client.post("/api/predict", json={"features": {"age": [1, 2]}})
    assert r.status_code == 422 and r.json()["error"]["code"] == "validation_error"
    r = await client.post("/api/predict", content=b"not json", headers={"Content-Type": "application/json"})
    assert r.status_code == 422


async def test_empty_features_use_defaults(client, services):
    r = await client.post("/api/predict", json={"features": {}})
    assert r.status_code == 200
    rf = r.json()["resolved_features"]
    assert all(rf[n] == f["default"] for n, f in services.fields.items())


async def test_deterministic(client):
    a = (await client.post("/api/predict", json={"features": SAMPLE})).json()
    b = (await client.post("/api/predict", json={"features": SAMPLE})).json()
    a.pop("latency_ms"), b.pop("latency_ms")
    assert a == b


async def test_what_if_non_modifiable_400(client):
    r = await client.post("/api/what-if", json={"features": SAMPLE, "changes": {"age": 40}})
    assert r.status_code == 400
    e = r.json()["error"]
    assert e["code"] == "not_modifiable" and "LDL cholesterol" in e["message"]


async def test_what_if_delta_is_after_minus_before(client, scene_schema):
    r = await client.post("/api/what-if",
                          json={"features": SAMPLE, "changes": {"ldl": 90, "current_smoker": 0, "weight": 70}})
    assert r.status_code == 200
    j = r.json()
    for t in C.TARGETS:
        assert abs(j["after"][t]["prob"] - j["before"][t]["prob"] - j["delta"][t]) < 1e-3
    assert "bmi" in j["derived_updates_applied"]
    assert "NOT a treatment effect" in j["note"]
    jsonschema.validate(j["scene_after"], scene_schema)


async def test_sensitivity(client):
    r = await client.post("/api/sensitivity", json={"features": SAMPLE, "feature": "ldl", "n": 9})
    j = r.json()
    assert r.status_code == 200 and len(j["points"]) == 9 and j["current_value"] == 160
    vals = [p["value"] for p in j["points"]]
    assert vals == sorted(vals)
    assert (await client.post("/api/sensitivity", json={"features": {}, "feature": "dm"})).status_code == 400
    assert (await client.post("/api/sensitivity", json={"features": {}, "feature": "age"})).status_code == 400


async def test_disclaimer_in_every_prediction_response(client):
    for path, body in (("/api/predict", {"features": SAMPLE}),
                       ("/api/what-if", {"features": SAMPLE, "changes": {"bp": 120}}),
                       ("/api/sensitivity", {"features": SAMPLE, "feature": "bp"})):
        j = (await client.post(path, json=body)).json()
        assert j["disclaimer"] == C.DISCLAIMER
    j = (await client.post("/api/predict", json={"features": SAMPLE})).json()
    assert j["prediction"]["disclaimer"] == j["scene"]["disclaimer"] == C.DISCLAIMER
    mc = (await client.get("/api/model-card")).json()
    assert mc["disclaimer"] == C.DISCLAIMER


async def test_model_card(client):
    j = (await client.get("/api/model-card")).json()
    assert j["n_patients"] == 303 and j["n_holdout"] == 61
    assert [t["key"] for t in j["targets"]] == list(C.TARGETS)
    for t in j["targets"]:
        assert {"auc", "f1", "brier"} <= set(t["holdout"])
        assert t["holdout"]["auc"]["ci_low"] <= t["holdout"]["auc"]["value"] <= t["holdout"]["auc"]["ci_high"]
        assert t["reliability_badge"] in {"High", "Moderate", "Limited"}
    assert any("neshallads" in a["text"] for a in j["attributions"])
    assert j["limitations"] and j["figures"]


async def test_anatomy_map_and_unknown_route(client):
    j = (await client.get("/api/anatomy-map")).json()
    assert {v["key"] for v in j["vessels"]} == set(C.VESSELS) and not any(k.startswith("_") for k in j)
    r = await client.get("/api/nope")
    assert r.status_code == 404 and "error" in r.json()


async def test_gzip(client):
    r = await client.get("/api/schema", headers={"Accept-Encoding": "gzip"})
    assert r.headers.get("content-encoding") == "gzip"
