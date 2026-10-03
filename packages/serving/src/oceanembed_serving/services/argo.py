"""Nearby-Argo lookup for the profile overlay.

Reads B's QC-filtered export (data/app_data/argo.parquet: one row per
observation level, TEMP_QC==1 and PRES_QC==1 applied at export time).
If the parquet is absent the overlay degrades to an explicit note - no
synthetic profiles are ever produced.
"""

from functools import lru_cache

import numpy as np
import pandas as pd

from ..settings import Settings

COLUMNS = [
    "PLATFORM_NUMBER",
    "CYCLE_NUMBER",
    "DATA_MODE",
    "PRES",
    "TEMP",
    "LATITUDE",
    "LONGITUDE",
    "TIME",
]


class ArgoNotBuilt(RuntimeError):
    pass


@lru_cache(maxsize=1)
def _load(path: str) -> pd.DataFrame:
    try:
        df = pd.read_parquet(path, columns=COLUMNS)
    except Exception as exc:
        raise ArgoNotBuilt(f"argo profiles not available at {path}") from exc
    df["TIME"] = pd.to_datetime(df["TIME"], utc=True, errors="coerce")
    return df.dropna(subset=["TIME"])


def nearby(
    settings: Settings,
    date: str,
    lat: float,
    lon: float,
    radius_deg: float = 1.0,
    days: int = 5,
    limit: int = 400,
) -> list[dict]:
    """Observation levels within radius_deg of the point and days of the date,
    nearest in space-time first."""
    df = _load(str(settings.argo_path))
    t0 = np.datetime64(date, "ns")
    dt = df["TIME"].values - t0
    dt_days = np.abs(dt) / np.timedelta64(1, "D")
    m = (
        (np.abs(df["LATITUDE"].values - lat) <= radius_deg)
        & (np.abs(df["LONGITUDE"].values - lon) <= radius_deg)
        & (dt_days <= days)
    )
    sub = df[m]
    if sub.empty:
        return []
    dist = np.hypot(sub["LATITUDE"].values - lat, sub["LONGITUDE"].values - lon)
    sub = sub.assign(_dist=dist, _dt=np.abs(dt_days[m])).sort_values(["_dt", "_dist"]).head(limit)
    out = []
    for row in sub.itertuples(index=False):
        out.append(
            {
                "time": np.datetime_as_string(row.TIME.to_datetime64(), unit="D"),
                "lat": round(float(row.LATITUDE), 4),
                "lon": round(float(row.LONGITUDE), 4),
                "depth_m": round(float(row.PRES), 1),
                "temp_c": round(float(row.TEMP), 3),
                "data_mode": str(row.DATA_MODE),
                "platform": str(row.PLATFORM_NUMBER).strip(),
                "cycle": int(row.CYCLE_NUMBER),
            }
        )
    return out
