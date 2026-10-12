"""Shared fixtures: the services (models + map) are loaded ONCE per test session; requests go through
httpx.AsyncClient on the ASGI app (no network)."""
from __future__ import annotations

import json
from pathlib import Path

import httpx
import pytest

from app.backend.main import create_app
from app.backend.services import Services
from app.backend.settings import get_settings

ROOT = Path(__file__).resolve().parents[3]


@pytest.fixture(scope="session")
def anyio_backend():
    return "asyncio"


@pytest.fixture(scope="session")
def services():
    return Services(get_settings().ARTIFACTS_DIR).load()


@pytest.fixture(scope="session")
def app(services):
    a = create_app(services)
    a.state.services = services            # ASGITransport does not run the lifespan
    return a


@pytest.fixture
async def client(app):
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as c:
        yield c


@pytest.fixture(scope="session")
def scene_schema():
    return json.loads((ROOT / "artifacts" / "scene_state.schema.json").read_text(encoding="utf-8"))


@pytest.fixture(scope="session")
def holdout_rows():
    from cardio_ml.data import get_features, load_raw
    df, _ = load_raw()
    X = get_features(df)
    te = json.loads((ROOT / "artifacts" / "split.json").read_text())["test_idx"]
    return {i: {k: (v.item() if hasattr(v, "item") else v) for k, v in X.iloc[i].items()} for i in te}
