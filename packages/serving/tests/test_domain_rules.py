from fastapi.testclient import TestClient

from oceanembed_serving.main import app

client = TestClient(app)


def test_health():
    assert client.get("/v1/health").json() == {"status": "ok"}


def test_missing_store_is_503_not_fake_data(monkeypatch, tmp_path):
    monkeypatch.setenv("OE_PREDICTIONS_PATH", str(tmp_path / "missing.zarr"))
    from oceanembed_serving.services import store
    from oceanembed_serving.settings import get_settings

    get_settings.cache_clear()
    store._open.cache_clear()
    r = client.get("/v1/meta")
    assert r.status_code == 503


def test_depth_out_of_range_rejected():
    from oceanembed_serving.deps import get_store

    app.dependency_overrides[get_store] = lambda: None
    try:
        assert (
            client.get("/v1/slice", params={"date": "2024-01-01", "depth": 5000}).status_code == 422
        )
    finally:
        app.dependency_overrides.clear()
