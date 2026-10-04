import json
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import ValidationError

from ..schemas import MetricRow, Metrics
from ..settings import Settings, get_settings

router = APIRouter(prefix="/v1")


def _load(path: Path, what: str) -> dict:
    try:
        return json.loads(path.read_text())
    except FileNotFoundError as exc:
        raise HTTPException(503, f"{what} not built yet (expected at {path})") from exc
    except json.JSONDecodeError as exc:
        raise HTTPException(500, f"{what} is not valid JSON") from exc


@router.get("/metrics", response_model=Metrics)
def metrics(
    method: str | None = None,
    basin: str | None = None,
    season: str | None = None,
    s: Settings = Depends(get_settings),
) -> Metrics:
    raw = _load(s.metrics_path, "metrics")
    try:
        rows = [MetricRow(**r) for r in raw["rows"]]
        out = Metrics(
            run_id=raw["run_id"],
            test_years=raw["test_years"],
            independence_note=raw.get("independence_note"),
            rows=rows,
        )
    except (KeyError, ValidationError) as exc:
        raise HTTPException(500, "metrics file does not match the contract") from exc
    out.rows = [
        r
        for r in out.rows
        if (method is None or r.method == method)
        and (basin is None or r.basin == basin)
        and (season is None or r.season == season)
    ]
    return out


@router.get("/provenance")
def provenance(s: Settings = Depends(get_settings)) -> dict:
    return _load(s.manifest_path, "run manifest")
