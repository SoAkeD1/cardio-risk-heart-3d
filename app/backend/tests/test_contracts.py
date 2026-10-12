"""Contract tests: API scenes match the Step 5 snapshots; OpenAPI exposes every endpoint."""
from __future__ import annotations

import json
from pathlib import Path

import pytest

pytestmark = pytest.mark.anyio
SNAP_DIR = Path(__file__).resolve().parents[3] / "tests" / "snapshots"


def _norm(x):
    if isinstance(x, float):
        return round(x, 3)
    if x == "Fmale":              # the API canonicalises the dataset's "Fmale" typo to "Female" (display value only)
        return "Female"
    if isinstance(x, dict):
        return {k: _norm(v) for k, v in x.items()}
    if isinstance(x, list):
        return [_norm(v) for v in x]
    return x


async def test_snapshot_patients_match_scene(client, holdout_rows):
    snaps = sorted(SNAP_DIR.glob("scene_patient_*.json"))
    assert snaps
    for f in snaps:
        idx = int(f.stem.rsplit("_", 1)[1])
        r = await client.post("/api/predict", json={"features": holdout_rows[idx]})
        assert r.status_code == 200
        assert _norm(r.json()["scene"]) == _norm(json.loads(f.read_text(encoding="utf-8"))), f.name


async def test_openapi_lists_all_endpoints(client):
    paths = (await client.get("/openapi.json")).json()["paths"]
    for p in ("/api/health", "/api/schema", "/api/examples", "/api/predict", "/api/what-if",
              "/api/sensitivity", "/api/model-card", "/api/anatomy-map"):
        assert p in paths, p
