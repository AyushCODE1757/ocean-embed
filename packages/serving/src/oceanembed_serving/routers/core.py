from fastapi import APIRouter, Depends, HTTPException, Query

from ..deps import get_provenance, get_store
from ..schemas import Meta, Profile, Provenance, Slice
from ..services.store import Store
from ..settings import Settings, get_settings

router = APIRouter(prefix="/v1")


@router.get("/health")
def health() -> dict:
    return {"status": "ok"}


@router.get("/meta", response_model=Meta)
def meta(
    store: Store = Depends(get_store),
    prov: Provenance = Depends(get_provenance),
    s: Settings = Depends(get_settings),
) -> Meta:
    dates = store.dates()
    return Meta(
        lat=store.ds["lat"].values.tolist(),
        lon=store.ds["lon"].values.tolist(),
        depths_m=list(s.depths_m),
        dates=dates,
        data_through=dates[-1] if dates else None,
        provenance=prov,
    )


@router.get("/slice", response_model=Slice)
def get_slice(
    date: str,
    depth: int = Query(ge=0, le=1000),
    store: Store = Depends(get_store),
    prov: Provenance = Depends(get_provenance),
) -> Slice:
    try:
        return Slice(date=date, depth_m=depth, provenance=prov, **store.slice(date, depth))
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/profile", response_model=Profile)
def get_profile(
    date: str,
    lat: float,
    lon: float,
    store: Store = Depends(get_store),
    prov: Provenance = Depends(get_provenance),
    s: Settings = Depends(get_settings),
) -> Profile:
    try:
        p = store.profile(date, lat, lon)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return Profile(date=date, lat=lat, lon=lon, depths_m=list(s.depths_m), provenance=prov, **p)
