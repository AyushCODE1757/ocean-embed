import json
import re
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import ValidationError

from ..deps import get_provenance, get_store
from ..schemas import Gaps, Osse, Provenance, Slice
from ..services.store import Store
from ..settings import Settings, get_settings

router = APIRouter(prefix="/v1")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _read(path: Path, what: str) -> dict:
    try:
        return json.loads(path.read_text())
    except FileNotFoundError as exc:
        raise HTTPException(503, f"{what} not built yet (expected at {path})") from exc
    except json.JSONDecodeError as exc:
        raise HTTPException(500, f"{what} is not valid JSON") from exc


@router.get("/uncertainty", response_model=Slice)
def uncertainty(
    date: str,
    depth: int = Query(ge=0, le=1000),
    store: Store = Depends(get_store),
    prov: Provenance = Depends(get_provenance),
) -> Slice:
    try:
        return Slice(date=date, depth_m=depth, provenance=prov, **store.spread_slice(date, depth))
    except KeyError as exc:
        raise HTTPException(404, str(exc)) from exc
    except LookupError as exc:
        raise HTTPException(404, str(exc)) from exc


@router.get("/gaps", response_model=Gaps)
def gaps(
    date: str,
    k: int = Query(default=10, ge=1, le=50),
    s: Settings = Depends(get_settings),
) -> Gaps:
    if not DATE_RE.match(date):  # also blocks path traversal in the filename
        raise HTTPException(422, "date must be YYYY-MM-DD")
    raw = _read(s.advisor_dir / "gaps" / f"{date}.json", "gap map")
    try:
        out = Gaps(**raw)
    except ValidationError as exc:
        raise HTTPException(500, "gap file does not match the contract") from exc
    out.sites = sorted(out.sites, key=lambda x: x.rank)[:k]
    return out


@router.get("/osse", response_model=Osse)
def osse(s: Settings = Depends(get_settings)) -> Osse:
    raw = _read(s.advisor_dir / "osse.json", "OSSE result")
    try:
        return Osse(**raw)
    except ValidationError as exc:
        raise HTTPException(500, "OSSE file does not match the contract") from exc
