import json

from fastapi.testclient import TestClient

from oceanembed_serving.main import app
from oceanembed_serving.settings import get_settings

client = TestClient(app)


def _advisor_dir(monkeypatch, path):
    monkeypatch.setenv("OE_ADVISOR_DIR", str(path))
    get_settings.cache_clear()


def test_gaps_missing_is_503(monkeypatch, tmp_path):
    _advisor_dir(monkeypatch, tmp_path)
    assert client.get("/v1/gaps", params={"date": "2024-01-01"}).status_code == 503


def test_gaps_rejects_bad_date(monkeypatch, tmp_path):
    _advisor_dir(monkeypatch, tmp_path)
    assert client.get("/v1/gaps", params={"date": "../../etc/passwd"}).status_code == 422


def test_gaps_k_bounds():
    assert client.get("/v1/gaps", params={"date": "2024-01-01", "k": 0}).status_code == 422
    assert client.get("/v1/gaps", params={"date": "2024-01-01", "k": 51}).status_code == 422


def test_gaps_returns_top_k_in_rank_order(monkeypatch, tmp_path):
    # Contract-shape test of the endpoint logic only. This file is a test input,
    # not data shown to users; real gap maps come from the advisor package.
    (tmp_path / "gaps").mkdir()
    sites = [{"rank": r, "lat": 10.0, "lon": 80.0, "score": 1.0 / r} for r in (3, 1, 2)]
    (tmp_path / "gaps" / "2024-01-01.json").write_text(
        json.dumps({"date": "2024-01-01", "sites": sites})
    )
    _advisor_dir(monkeypatch, tmp_path)
    body = client.get("/v1/gaps", params={"date": "2024-01-01", "k": 2}).json()
    assert [x["rank"] for x in body["sites"]] == [1, 2]


def test_osse_missing_is_503(monkeypatch, tmp_path):
    _advisor_dir(monkeypatch, tmp_path)
    assert client.get("/v1/osse").status_code == 503
