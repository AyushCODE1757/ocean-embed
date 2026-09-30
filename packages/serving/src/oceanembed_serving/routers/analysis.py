from typing import Literal

import numpy as np
from fastapi import APIRouter, Depends, HTTPException, Query

from ..deps import get_provenance, get_store
from ..schemas import HeatField, Provenance, Section
from ..services import geo, heat
from ..services.store import Store
from ..settings import Settings, get_settings

router = APIRouter(prefix="/v1")


def _clean(a: np.ndarray) -> list:
    return np.where(np.isfinite(a), np.round(a, 3), None).tolist()


@router.get("/section", response_model=Section)
def section(
    date: str,
    path: str = Query(description="'lat,lon;lat,lon;...' with 2-20 vertices"),
    n: int = Query(default=100, ge=2, le=200),
    store: Store = Depends(get_store),
    prov: Provenance = Depends(get_provenance),
    s: Settings = Depends(get_settings),
) -> Section:
    try:
        verts = geo.parse_path(path)
        if not all(s.lat_min <= la <= s.lat_max and s.lon_min <= lo <= s.lon_max for la, lo in verts):
            raise ValueError("path leaves the contract domain")
        lats, lons, dist = geo.sample_path(verts, n)
        vals = store.section(date, lats, lons)
    except KeyError as exc:
        raise HTTPException(404, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    return Section(
        date=date,
        distance_km=np.round(dist, 2).tolist(),
        lat=np.round(lats, 4).tolist(),
        lon=np.round(lons, 4).tolist(),
        depths_m=list(s.depths_m),
        values=_clean(vals),
        provenance=prov,
    )


_HEAT = {
    "ohc": (
        "GJ m-2",
        "rho*cp*integral of T dz, 0-300 m, trapezoid on standard levels; rho=1025, cp=3985",
    ),
    "d26": (
        "m",
        "26 degC isotherm depth, linear between the 15 standard levels; NaN if surface <26 or deeper than 1000 m",
    ),
    "d20": (
        "m",
        "20 degC isotherm depth, linear between the 15 standard levels; NaN if surface <20 or deeper than 1000 m",
    ),
}


@router.get("/heat", response_model=HeatField)
def heat_field(
    date: str,
    metric: Literal["ohc", "d26", "d20"],
    store: Store = Depends(get_store),
    prov: Provenance = Depends(get_provenance),
    s: Settings = Depends(get_settings),
) -> HeatField:
    try:
        t = store.column_stack(date)
    except KeyError as exc:
        raise HTTPException(404, str(exc)) from exc
    if metric == "ohc":
        field = heat.ohc_gj_m2(t, s.depths_m)
    else:
        field = heat.isotherm_depth(t, s.depths_m, 26.0 if metric == "d26" else 20.0)
    units, method = _HEAT[metric]
    return HeatField(
        date=date,
        metric=metric,
        units=units,
        method=method,
        lat=store.ds["lat"].values.tolist(),
        lon=store.ds["lon"].values.tolist(),
        values=_clean(field),
        provenance=prov,
    )
