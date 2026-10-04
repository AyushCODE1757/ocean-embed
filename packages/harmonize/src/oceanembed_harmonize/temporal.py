"""Temporal Harmonization and Aggregation Module for OceanEmbed.

Handles:
- Aligning time steps to exact 1 UTC calendar day per step
- Aggregating sub-daily datasets (e.g. CCMP 6-hourly winds) to daily mean u, v
- Calculating derived physical variables (e.g., wind speed: sqrt(u^2 + v^2))
"""

import numpy as np
import pandas as pd


def align_to_daily_utc(timestamp_str: str) -> str:
    """Normalize arbitrary datetime strings or timestamps to 'YYYY-MM-DD'."""
    dt = pd.to_datetime(timestamp_str, utc=True)
    return dt.strftime("%Y-%m-%d")


def aggregate_subdaily_to_daily_wind(
    u_6hourly: np.ndarray,
    v_6hourly: np.ndarray,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Aggregate 6-hourly wind components [4, lat, lon] over 1 day into daily
    mean u, v, and wind speed.

    Returns:
        (u_mean [lat, lon], v_mean [lat, lon], wind_speed [lat, lon])
    """
    if u_6hourly.shape[0] != 4 or v_6hourly.shape[0] != 4:
        raise ValueError(f"Expected 4 sub-daily steps per day, got {u_6hourly.shape[0]}")

    u_daily = np.nanmean(u_6hourly, axis=0).astype(np.float32)
    v_daily = np.nanmean(v_6hourly, axis=0).astype(np.float32)
    speed_daily = np.sqrt(u_daily**2 + v_daily**2).astype(np.float32)

    return u_daily, v_daily, speed_daily
