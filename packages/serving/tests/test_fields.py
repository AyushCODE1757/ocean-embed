"""Tests for the field selector on /v1/slice and the Argo overlay on /v1/profile.

Fixtures are tiny arrays built here - labelled test inputs, never shown to users.
Real serving data comes from scripts/build_artifacts.py against B's export.
"""

import json

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

from oceanembed_serving.main import app

client = TestClient(app)

LAT = np.array([5.0, 5.25, 5.5, 5.75])
LON = np.array([45.0, 45.25, 45.5, 45.75, 46.0])
DATES = ["2024-01-01", "2024-01-03"]
DEPTHS = [0, 10, 20]


@pytest.fixture()
def tiny_store(tmp_path, monkeypatch):
    pred = tmp_path / "predictions.zarr"
    t = np.array(DATES, dtype="datetime64[ns]")
    coords = {"time": t, "depth": np.array(DEPTHS, dtype="int32"), "lat": LAT, "lon": LON}
    shape = (len(DATES), len(DEPTHS), len(LAT), len(LON))
    mean = np.arange(np.prod(shape), dtype="float32").reshape(shape)
    truth = mean - 0.5
    clim = mean * 0.5
    import xarray as xr

    ds = xr.Dataset(
        coords=coords,
        data_vars={
            "temp_mean": (("time", "depth", "lat", "lon"), mean),
            "temp_truth": (("time", "depth", "lat", "lon"), truth),
            "temp_clim": (("time", "depth", "lat", "lon"), clim),
        },
    )
    ds.to_zarr(pred)
    argo = tmp_path / "argo.parquet"
    pd.DataFrame(
        {
            "PLATFORM_NUMBER": ["5901001", "5901001", "5901002"],
            "CYCLE_NUMBER": [10, 10, 11],
            "DATA_MODE": ["D", "D", "R"],
            "PRES": [5.0, 15.0, 30.0],
            "TEMP": [28.1, 27.5, 26.0],
            "LATITUDE": [5.1, 5.1, 9.9],
            "LONGITUDE": [45.1, 45.1, 46.0],
            "TIME": pd.to_datetime(["2024-01-02", "2024-01-02", "2024-03-01"], utc=True),
        }
    ).to_parquet(argo)
    monkeypatch.setenv("OE_PREDICTIONS_PATH", str(pred))
    monkeypatch.setenv("OE_ARGO_PATH", str(argo))
    from oceanembed_serving.services import argo as argo_svc
    from oceanembed_serving.services import store
    from oceanembed_serving.settings import get_settings

    get_settings.cache_clear()
    store._open.cache_clear()
    argo_svc._load.cache_clear()
    yield
    get_settings.cache_clear()
    store._open.cache_clear()
    argo_svc._load.cache_clear()


def test_slice_fields(tiny_store):
    base = {"date": "2024-01-01", "depth": 0}
    model = client.get("/v1/slice", params=base).json()
    truth = client.get("/v1/slice", params={**base, "field": "truth"}).json()
    err = client.get("/v1/slice", params={**base, "field": "error"}).json()
    assert model["field"] == "model" and truth["field"] == "truth"
    i, j = 1, 2
    m, tr, e = model["values"][i][j], truth["values"][i][j], err["values"][i][j]
    assert tr == pytest.approx(m - 0.5, abs=1e-3)
    assert e == pytest.approx(m - tr, abs=1e-3)


def test_slice_bad_field_rejected(tiny_store):
    r = client.get("/v1/slice", params={"date": "2024-01-01", "depth": 0, "field": "bogus"})
    assert r.status_code == 422


def test_profile_has_truth_clim_and_argo(tiny_store):
    r = client.get("/v1/profile", params={"date": "2024-01-01", "lat": 5.1, "lon": 45.1})
    assert r.status_code == 200
    body = r.json()
    assert len(body["mean"]) == len(DEPTHS)
    assert body["truth"] == pytest.approx([m - 0.5 for m in body["mean"]], abs=1e-2)
    assert body["clim"] == pytest.approx([m * 0.5 for m in body["mean"]], abs=1e-2)
    # two obs near the point/date (third is 9.9N, far away in time and space)
    assert len(body["argo"]) == 2
    obs = body["argo"][0]
    assert {"time", "lat", "lon", "depth_m", "temp_c", "data_mode", "platform", "cycle"} <= set(obs)
    assert obs["data_mode"] in {"D", "R"}


def test_profile_argo_absent_degrades_with_note(tmp_path, monkeypatch):
    pred = tmp_path / "predictions.zarr"
    import xarray as xr

    coords = {
        "time": np.array(DATES, dtype="datetime64[ns]"),
        "depth": np.array(DEPTHS, dtype="int32"),
        "lat": LAT,
        "lon": LON,
    }
    ds = xr.Dataset(
        coords=coords,
        data_vars={
            "temp_mean": (("time", "depth", "lat", "lon"), np.zeros((2, 3, 4, 5), "float32")),
            "temp_truth": (("time", "depth", "lat", "lon"), np.zeros((2, 3, 4, 5), "float32")),
            "temp_clim": (("time", "depth", "lat", "lon"), np.zeros((2, 3, 4, 5), "float32")),
        },
    )
    ds.to_zarr(pred)
    monkeypatch.setenv("OE_PREDICTIONS_PATH", str(pred))
    monkeypatch.setenv("OE_ARGO_PATH", str(tmp_path / "missing.parquet"))
    from oceanembed_serving.services import argo as argo_svc
    from oceanembed_serving.services import store
    from oceanembed_serving.settings import get_settings

    get_settings.cache_clear()
    store._open.cache_clear()
    argo_svc._load.cache_clear()
    try:
        r = client.get("/v1/profile", params={"date": "2024-01-01", "lat": 5.1, "lon": 45.1})
        assert r.status_code == 200
        body = r.json()
        assert body["argo"] == []
        assert "unavailable" in body["argo_note"]
    finally:
        get_settings.cache_clear()
        store._open.cache_clear()
        argo_svc._load.cache_clear()


def test_profile_argo_empty_window_note(tiny_store):
    r = client.get("/v1/profile", params={"date": "2024-01-01", "lat": 5.75, "lon": 46.5})
    body = r.json()
    assert body["argo"] == []
    assert "no Argo profile" in body["argo_note"]


def test_metrics_contract_from_build(tmp_path, monkeypatch):
    metrics = tmp_path / "metrics.json"
    metrics.write_text(
        json.dumps(
            {
                "run_id": "t",
                "test_years": [2024],
                "independence_note": "n",
                "rows": [
                    {
                        "method": "oceanembed",
                        "depth_m": 100,
                        "basin": "all",
                        "season": "all",
                        "rmse": 1.381,
                        "bias": None,
                        "corr": None,
                        "n": 0,
                    }
                ],
            }
        )
    )
    monkeypatch.setenv("OE_METRICS_PATH", str(metrics))
    from oceanembed_serving.settings import get_settings

    get_settings.cache_clear()
    try:
        r = client.get("/v1/metrics")
        assert r.status_code == 200
        assert r.json()["rows"][0]["rmse"] == pytest.approx(1.381)
    finally:
        get_settings.cache_clear()
