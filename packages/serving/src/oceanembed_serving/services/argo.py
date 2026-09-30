"""Nearby Argo profiles from data/argo/argo_profiles.parquet (long format, one row per level)."""
from datetime import datetime, timedelta
from functools import lru_cache

import numpy as np
import pandas as pd

from .geo import haversine_km

COLS = ["platform_id", "cycle_number", "timestamp", "latitude", "longitude", "depth", "temperature", "data_mode"]


class ArgoNotBuilt(RuntimeError):
    pass


@lru_cache(maxsize=1)
def _load(path: str) -> pd.DataFrame:
    try:
        df = pd.read_parquet(path, columns=COLS)
    except Exception as exc:
        raise ArgoNotBuilt(f"Argo profiles not available at {path}") from exc
    df["t"] = pd.to_datetime(df["timestamp"], utc=True)
    return df


def nearby(
    path: str,
    date: str,
    lat: float,
    lon: float,
    radius_km: float,
    window_days: int,
    limit: int = 20,
) -> list[dict]:
    df = _load(path)
    centre = pd.Timestamp(datetime.fromisoformat(date), tz="UTC")
    span = timedelta(days=window_days)
    sub = df[(df["t"] >= centre - span) & (df["t"] <= centre + span + timedelta(days=1))]
    out = []
    for (pid, cyc), g in sub.groupby(["platform_id", "cycle_number"]):
        la, lo = float(g["latitude"].iloc[0]), float(g["longitude"].iloc[0])
        d = haversine_km(lat, lon, la, lo)
        if d > radius_km:
            continue
        g = g.sort_values("depth")
        out.append({
            "platform_id": str(pid),
            "cycle_number": int(cyc),
            "timestamp": str(g["timestamp"].iloc[0]),
            "latitude": la,
            "longitude": lo,
            "data_mode": str(g["data_mode"].iloc[0]),
            "distance_km": round(d, 1),
            "depths_m": g["depth"].astype(float).tolist(),
            "temperature": np.where(np.isfinite(g["temperature"]), g["temperature"], None).tolist(),
        })
    return sorted(out, key=lambda p: p["distance_km"])[:limit]
