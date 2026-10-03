from fastapi.testclient import TestClient

from oceanembed_serving.main import app
from oceanembed_serving.settings import get_settings

client = TestClient(app)


def _use(monkeypatch, name: str, path):
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


def test_provenance_missing_is_503(monkeypatch, tmp_path):
    _use(monkeypatch, "OE_MANIFEST_PATH", tmp_path / "none.json")
    assert client.get("/v1/provenance").status_code == 503
