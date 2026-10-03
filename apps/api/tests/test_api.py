from fastapi.testclient import TestClient

from apps.api.main import app

client = TestClient(app)


def test_meta_endpoint_returns_dates_and_shape() -> None:
    response = client.get("/v1/meta")
    assert response.status_code == 200
    payload = response.json()
    assert payload["meta"]["shape"] == [101, 241]
    assert payload["meta"]["depths"][0] == 0
    assert payload["dates"][0] == "2024-01-01"


def test_slice_endpoint_returns_grid() -> None:
    response = client.get("/v1/slice", params={"date": "2024-01-01", "depth": 0, "field": "model"})
    assert response.status_code == 200
    payload = response.json()
    assert payload["shape"] == [101, 241]
    assert len(payload["values"]) == 101
    assert len(payload["values"][0]) == 241
    assert payload["field"] == "model"


def test_profile_endpoint_returns_depth_series() -> None:
    response = client.get(
        "/v1/profile",
        params={"date": "2024-01-01", "lat": 15.0, "lon": 60.0},
    )
    assert response.status_code == 200
    payload = response.json()
    assert len(payload["depths"]) == 15
    assert len(payload["model"]) == 15
    assert len(payload["truth"]) == 15
    assert len(payload["clim"]) == 15


def test_metrics_and_health_endpoints() -> None:
    metrics = client.get("/v1/metrics")
    assert metrics.status_code == 200
    payload = metrics.json()
    assert "results" in payload
    assert "argo_validation" in payload

    health = client.get("/v1/health")
    assert health.status_code == 200
    assert health.json()["status"] == "ok"
