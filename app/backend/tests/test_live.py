"""Live-response tests: binary features produce exactly the deltas recorded by scripts/feature_response_audit.py,
every response is live (no caching / fakes), and a restarted backend serves identical results."""
from __future__ import annotations

import json
from pathlib import Path

import httpx
import pytest

from app.backend.main import create_app
from app.backend.services import Services
from app.backend.settings import get_settings

pytestmark = pytest.mark.anyio
ROOT = Path(__file__).resolve().parents[3]
AUDIT = json.loads((ROOT / "artifacts" / "feature_response.json").read_text(encoding="utf-8"))
TARGETS = AUDIT["targets"]


async def _probs(client, features):
    j = (await client.post("/api/predict", json={"features": features})).json()
    return {t: j["prediction"][t]["prob"] for t in TARGETS}


@pytest.mark.parametrize("feature", ["htn", "edema", "current_smoker"])
async def test_binary_feature_delta_matches_audit(client, feature):
    examples = (await client.get("/api/examples")).json()["examples"]
    rec = AUDIT["features"][feature]["per_sample"]
    for ex in examples:
        f = dict(ex["features"])
        base = await _probs(client, f)
        other = 0 if int(f[feature]) == 1 else 1
        flipped = await _probs(client, {**f, feature: other})
        for t in TARGETS:
            # the audit's max |Δ| over both binary values == |p(other) - p(base)| (the base value gives Δ = 0)
            assert abs(abs(flipped[t] - base[t]) - rec[ex["id"]][t]) < 2e-4, (feature, ex["id"], t)


async def test_toggling_changes_the_response(client):
    ex = (await client.get("/api/examples")).json()["examples"][2]
    a = await _probs(client, ex["features"])
    b = await _probs(client, {**ex["features"], "htn": 1 - int(ex["features"]["htn"])})
    assert any(abs(a[t] - b[t]) > 1e-6 for t in TARGETS), "HTN must change at least one live estimate"


async def test_backend_restart_recovery():
    """Two independent backend lifetimes (fresh Services load each) give identical results."""
    body = {"features": {"age": 61, "htn": 1, "current_smoker": 1}}
    outs = []
    for _ in range(2):
        svc = Services(get_settings().ARTIFACTS_DIR).load()
        app = create_app(svc)
        app.state.services = svc
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t") as c:
            assert (await c.get("/api/health")).json()["status"] == "ok"
            j = (await c.post("/api/predict", json=body)).json()
            j.pop("latency_ms")
            outs.append(j)
    assert outs[0] == outs[1]


async def test_schema_serves_effect_strength(client):
    feats = (await client.get("/api/schema")).json()["features"]
    by = {f["name"]: f for f in feats}
    for n, rec in AUDIT["features"].items():
        assert by[n]["effect_strength"] == rec["effect_strength"]
    assert (await client.get("/api/education")).json()["items"]
