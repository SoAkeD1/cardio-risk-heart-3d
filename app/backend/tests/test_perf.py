"""Latency gate: 50 sequential /api/predict calls, p95 < 250 ms."""
from __future__ import annotations

import time

import numpy as np
import pytest

pytestmark = pytest.mark.anyio


async def test_predict_latency_p95(client, holdout_rows):
    rows = list(holdout_rows.values())
    await client.post("/api/predict", json={"features": rows[0]})            # warm-up
    times = []
    for i in range(50):
        t0 = time.perf_counter()
        r = await client.post("/api/predict", json={"features": rows[i % len(rows)]})
        times.append((time.perf_counter() - t0) * 1000)
        assert r.status_code == 200
    p50, p95 = np.percentile(times, 50), np.percentile(times, 95)
    print(f"\n/api/predict latency over 50 sequential calls: p50 {p50:.0f} ms, p95 {p95:.0f} ms, max {max(times):.0f} ms")
    assert p95 < 250, f"p95 {p95:.0f} ms >= 250 ms"
