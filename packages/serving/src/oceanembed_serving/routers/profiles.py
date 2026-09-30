from fastapi import APIRouter, Depends, HTTPException, Query

from ..schemas import ArgoNearby, ArgoProfile, ReferenceProfile
from ..services import argo, store
from ..settings import Settings, get_settings

router = APIRouter(prefix="/v1")


@router.get("/reference_profile", response_model=ReferenceProfile)
def reference(date: str, lat: float, lon: float, s: Settings = Depends(get_settings)) -> ReferenceProfile:
    if not (s.lat_min <= lat <= s.lat_max and s.lon_min <= lon <= s.lon_max):
        raise HTTPException(422, "point outside the contract domain")
    try:
        vals = store.reference_profile(s, date, lat, lon)
    except store.DataNotBuilt as exc:
        raise HTTPException(503, str(exc)) from exc
    except KeyError as exc:
        raise HTTPException(404, str(exc)) from exc
    return ReferenceProfile(date=date, lat=lat, lon=lon, depths_m=list(s.depths_m), values=vals)


@router.get("/argo", response_model=ArgoNearby)
def argo_nearby(
    date: str,
    lat: float,
    lon: float,
    radius_km: float = Query(default=300, gt=0, le=1000),
    window_days: int = Query(default=5, ge=0, le=30),
    s: Settings = Depends(get_settings),
) -> ArgoNearby:
    try:
        rows = argo.nearby(str(s.argo_path), date, lat, lon, radius_km, window_days)
    except argo.ArgoNotBuilt as exc:
        raise HTTPException(503, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(422, "date must be YYYY-MM-DD") from exc
    return ArgoNearby(
        date=date,
        window_days=window_days,
        radius_km=radius_km,
        profiles=[ArgoProfile(**r) for r in rows],
    )
