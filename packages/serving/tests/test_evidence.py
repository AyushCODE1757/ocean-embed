import json

from fastapi.testclient import TestClient

from oceanembed_serving.main import app
from oceanembed_serving.routers.evidence import REQUIRED_KEYS
from oceanembed_serving.settings import get_settings

client = TestClient(app)


def _use(monkeypatch, name, path):
    monkeypatch.setenv(name, str(path))
    get_settings.cache_clear()


def test_metrics_missing_is_503(monkeypatch, tmp_path):
    _use(monkeypatch, "OE_METRICS_PATH", tmp_path / "none.json")
    assert client.get("/v1/metrics").status_code == 503


def test_metrics_invalid_json_is_500(monkeypatch, tmp_path):
    bad = tmp_path / "m.json"
    bad.write_text("not json")
    _use(monkeypatch, "OE_METRICS_PATH", bad)
    assert client.get("/v1/metrics").status_code == 500


def test_metrics_missing_required_keys_is_500(monkeypatch, tmp_path):
    p = tmp_path / "m.json"
    p.write_text(json.dumps({"run_id": "x"}))
    _use(monkeypatch, "OE_METRICS_PATH", p)
    assert client.get("/v1/metrics").status_code == 500


def test_metrics_passthrough_when_keys_present(monkeypatch, tmp_path):
    # Endpoint-logic test only: the file is a test input, never shown to users.
    p = tmp_path / "m.json"
    p.write_text(json.dumps({k: None for k in REQUIRED_KEYS}))
    _use(monkeypatch, "OE_METRICS_PATH", p)
    assert client.get("/v1/metrics").status_code == 200


def test_provenance_missing_is_503(monkeypatch, tmp_path):
    _use(monkeypatch, "OE_MANIFEST_PATH", tmp_path / "none.json")
    assert client.get("/v1/provenance").status_code == 503


def test_argo_and_reference_missing_are_503(monkeypatch, tmp_path):
    _use(monkeypatch, "OE_ARGO_PATH", tmp_path / "none.parquet")
    _use(monkeypatch, "OE_TARGETS_PATH", tmp_path / "none.zarr")
    q = {"date": "2024-01-01", "lat": 12.0, "lon": 85.0}
    assert client.get("/v1/argo", params=q).status_code == 503
    assert client.get("/v1/reference_profile", params=q).status_code == 503


def test_argo_radius_bounds():
    q = {"date": "2024-01-01", "lat": 12.0, "lon": 85.0, "radius_km": 5000}
    assert client.get("/v1/argo", params=q).status_code == 422
