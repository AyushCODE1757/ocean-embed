from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from apps.api.data_store import (
    DATA_DIR,
    lat_grid,
    load_argo,
    load_argo_validation,
    load_array,
    load_dates,
    load_meta,
    load_results,
    lon_grid,
)

app = FastAPI(title="OceanEmbed API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _scaled_value(value: np.ndarray, scale: float, nodata: int) -> np.ndarray:
    arr = value.astype(np.float64, copy=False) * float(scale)
    arr[value == nodata] = np.nan
    return arr


def _to_jsonable(arr: np.ndarray) -> list[list[Any] | Any]:
    out: list[list[Any] | Any] = []
    for row in arr:
        row_values: list[Any] = []
        for value in row:
            row_values.append(None if np.isnan(value) else float(value))
        out.append(row_values)
    return out


@app.get("/v1/meta")
def get_meta() -> dict[str, Any]:
    meta = load_meta()
    return {
        "meta": meta,
        "dates": load_dates(),
        "data_dir": str(DATA_DIR),
    }


@app.get("/v1/slice")
def get_slice(
    date: str = Query(...),
    depth: int = Query(...),
    field: str = Query(..., pattern="^(model|truth|clim|error)$"),
) -> dict[str, Any]:
    meta = load_meta()
    dates = load_dates()
    if date not in dates:
        raise HTTPException(status_code=404, detail=f"Date {date} not found")

    depth_values = meta["depths"]
    if depth not in depth_values:
        closest = min(depth_values, key=lambda value: abs(value - depth))
    else:
        closest = depth
    depth_idx = depth_values.index(closest)
    date_idx = dates.index(date)

    scale = float(meta["scale"])
    nodata = int(meta["nodata"])
    model = _scaled_value(load_array("pred_model")[date_idx, depth_idx], scale, nodata)
    truth = _scaled_value(load_array("truth_glorys")[date_idx, depth_idx], scale, nodata)
    clim = _scaled_value(load_array("clim")[date_idx, depth_idx], scale, nodata)

    if field == "model":
        selected = model
    elif field == "truth":
        selected = truth
    elif field == "clim":
        selected = clim
    else:
        selected = model - truth

    return {
        "date": date,
        "depth": closest,
        "field": field,
        "shape": list(meta["shape"]),
        "values": _to_jsonable(selected),
        "units": meta["units"],
        "nodata": nodata,
        "scale": scale,
    }


@app.get("/v1/profile")
def get_profile(
    date: str = Query(...),
    lat: float = Query(...),
    lon: float = Query(...),
) -> dict[str, Any]:
    meta = load_meta()
    dates = load_dates()
    if date not in dates:
        raise HTTPException(status_code=404, detail=f"Date {date} not found")

    lat_arr = lat_grid()
    lon_arr = lon_grid()
    lat_idx = int(np.argmin(np.abs(lat_arr - lat)))
    lon_idx = int(np.argmin(np.abs(lon_arr - lon)))
    date_idx = dates.index(date)

    scale = float(meta["scale"])
    nodata = int(meta["nodata"])

    model = _scaled_value(load_array("pred_model")[date_idx, :, lat_idx, lon_idx], scale, nodata)
    truth = _scaled_value(load_array("truth_glorys")[date_idx, :, lat_idx, lon_idx], scale, nodata)
    clim = _scaled_value(load_array("clim")[date_idx, :, lat_idx, lon_idx], scale, nodata)

    argo = load_argo().copy()
    ref_ts = pd.to_datetime(date)
    argo = argo[
        (argo["LATITUDE"].sub(lat).abs() <= 1.0)
        & (argo["LONGITUDE"].sub(lon).abs() <= 1.0)
        & (argo["TIME"].sub(ref_ts).dt.days.abs() <= 5)
    ].sort_values("TIME")

    argo_records = []
    for _, row in argo.iterrows():
        argo_records.append(
            {
                "time": row["TIME"].isoformat(),
                "latitude": float(row["LATITUDE"]),
                "longitude": float(row["LONGITUDE"]),
                "depth_m": float(row["PRES"]),
                "temp_c": float(row["TEMP"]),
                "data_mode": str(row["DATA_MODE"]),
            }
        )

    return {
        "date": date,
        "lat": float(lat),
        "lon": float(lon),
        "depths": meta["depths"],
        "model": [None if np.isnan(value) else float(value) for value in model],
        "truth": [None if np.isnan(value) else float(value) for value in truth],
        "clim": [None if np.isnan(value) else float(value) for value in clim],
        "argo": argo_records,
    }


@app.get("/v1/metrics")
def get_metrics() -> dict[str, Any]:
    return {
        "results": load_results(),
        "argo_validation": load_argo_validation(),
    }


@app.get("/v1/health")
def get_health() -> dict[str, Any]:
    meta = load_meta()
    return {
        "status": "ok",
        "split": meta["split"],
        "data_files": sorted([p.name for p in DATA_DIR.iterdir()]),
        "dates_count": len(load_dates()),
        "depth_count": len(meta["depths"]),
    }
