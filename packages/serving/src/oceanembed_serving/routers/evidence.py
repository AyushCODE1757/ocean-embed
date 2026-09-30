import json
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException

from ..settings import Settings, get_settings

router = APIRouter(prefix="/v1")

# Top-level keys A's metrics.schema.json defines. Inner shapes are passed through unchanged.
REQUIRED_KEYS = {
    "run_id", "model_name", "test_period", "is_sample_slice", "overall", "per_depth",
    "per_basin", "per_season", "baselines", "argo_validation", "independence_caveat",
}


def _load(path: Path, what: str) -> dict:
    try:
        return json.loads(path.read_text())
    except FileNotFoundError as exc:
        raise HTTPException(503, f"{what} not built yet (expected at {path})") from exc
    except json.JSONDecodeError as exc:
        raise HTTPException(500, f"{what} is not valid JSON") from exc


@router.get("/metrics")
def metrics(s: Settings = Depends(get_settings)) -> dict:
    raw = _load(s.metrics_path, "metrics")
    missing = REQUIRED_KEYS - set(raw)
    if missing:
        raise HTTPException(500, f"metrics file is missing keys: {sorted(missing)}")
    return raw


@router.get("/provenance")
def provenance(s: Settings = Depends(get_settings)) -> dict:
    return _load(s.manifest_path, "run manifest")
