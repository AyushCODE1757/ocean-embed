"""Tests for /v1/cyclones serving the packaged IBTrACS reference."""

import json

import pytest
from fastapi.testclient import TestClient

from oceanembed_serving.main import app
from oceanembed_serving.services import cyclones as cyc

client = TestClient(app)


@pytest.fixture()
def clear_ref_cache():
    cyc._load_ref.cache_clear()
    yield
    cyc._load_ref.cache_clear()


def test_cyclones_from_packaged_reference(clear_ref_cache, monkeypatch):
    monkeypatch.setenv("OE_CYCLONES_PATH", "")
    from oceanembed_serving.settings import get_settings

    get_settings.cache_clear()
    try:
        r = client.get("/v1/cyclones")
        assert r.status_code == 200
        body = r.json()
        names = [s["name"] for s in body["storms"]]
        assert names == ["Remal", "Fengal"]
        assert all(s["basin"] == "NI" and s["season"] == 2024 for s in body["storms"])
        remal = body["storms"][0]
        assert remal["n_points"] >= 20
        pts = remal["track"]
        times = [p["iso_time"] for p in pts]
        assert times == sorted(times), "track must be time-ordered"
        assert all(5 <= p["lat"] <= 30 and 45 <= p["lon"] <= 105 for p in pts)
        assert "IBTrACS" in body["source"]
    finally:
        get_settings.cache_clear()


def test_cyclones_override_path(clear_ref_cache, tmp_path, monkeypatch):
    custom = tmp_path / "cyclones.json"
    custom.write_text(
        json.dumps(
            {
                "source": "test fixture",
                "storms": [
                    {
                        "sid": "T1",
                        "name": "Teststorm",
                        "basin": "NI",
                        "season": 2024,
                        "n_points": 2,
                        "track": [
                            {"iso_time": "2024-05-24 00:00:00", "lat": 18.0, "lon": 88.0},
                            {"iso_time": "2024-05-24 06:00:00", "lat": 18.5, "lon": 88.4},
                        ],
                    },
                ],
            }
        )
    )
    monkeypatch.setenv("OE_CYCLONES_PATH", str(custom))
    from oceanembed_serving.settings import get_settings

    get_settings.cache_clear()
    try:
        r = client.get("/v1/cyclones")
        assert r.status_code == 200
        assert r.json()["storms"][0]["name"] == "Teststorm"
    finally:
        get_settings.cache_clear()


def test_cyclones_missing_is_503_not_fake(clear_ref_cache, monkeypatch):
    monkeypatch.setenv("OE_CYCLONES_PATH", str(__import__("pathlib").Path("Z:/nope.json")))
    from oceanembed_serving.settings import get_settings

    get_settings.cache_clear()
    try:
        r = client.get("/v1/cyclones")
        assert r.status_code == 503
    finally:
        get_settings.cache_clear()
