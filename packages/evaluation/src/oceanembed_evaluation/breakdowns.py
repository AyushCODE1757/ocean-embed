"""Breakdown Evaluator for OceanEmbed across Depths, Basins, and Seasons.

Computes stratified metrics:
1. Per-depth (0, 5, 10, 20, 30, 50, 75, 100, 125, 150, 200, 300, 500, 700, 1000 m)
2. Per-basin:
   - Arabian Sea (5-25°N, 45-77°E)
   - Bay of Bengal (5-23°N, 80-100°E)
   - Equatorial Indian Ocean (5-10°N, 45-105°E)
3. Per-season:
   - Pre-monsoon (MAM)
   - Southwest Monsoon (JJAS)
   - Post-monsoon (ON)
   - Winter (DJF)
"""

from typing import Any

import numpy as np
import pandas as pd
from oceanembed_contracts import (
    DEPTH_LEVELS,
    get_spatial_grid,
)

from oceanembed_evaluation.metrics import compute_all_pointwise_metrics

# Basin geographical boundaries
BASIN_BOUNDS = {
    "arabian_sea": {"lat_min": 5.0, "lat_max": 25.0, "lon_min": 45.0, "lon_max": 77.0},
    "bay_of_bengal": {"lat_min": 5.0, "lat_max": 23.0, "lon_min": 80.0, "lon_max": 100.0},
    "equatorial_indian_ocean": {"lat_min": 5.0, "lat_max": 10.0, "lon_min": 45.0, "lon_max": 105.0},
}

SEASON_MONTHS = {
    "pre_monsoon_mam": [3, 4, 5],
    "southwest_monsoon_jjas": [6, 7, 8, 9],
    "post_monsoon_on": [10, 11],
    "winter_djf": [12, 1, 2],
}


def get_basin_mask(basin_name: str, ocean_mask: np.ndarray | None = None) -> np.ndarray:
    """Generate boolean 2D mask for a specific basin."""
    lat_grid, lon_grid = get_spatial_grid()
    if basin_name not in BASIN_BOUNDS:
        raise ValueError(f"Unknown basin: {basin_name}. Choose from {list(BASIN_BOUNDS.keys())}")

    b = BASIN_BOUNDS[basin_name]
    basin_mask = (
        (lat_grid >= b["lat_min"])
        & (lat_grid <= b["lat_max"])
        & (lon_grid >= b["lon_min"])
        & (lon_grid <= b["lon_max"])
    )
    if ocean_mask is not None:
        basin_mask &= ocean_mask
    return basin_mask


def compute_depth_breakdown(
    pred_cubes: np.ndarray,  # [N, 15, lat, lon]
    target_cubes: np.ndarray,  # [N, 15, lat, lon]
    clim_cubes: np.ndarray,  # [N, 15, lat, lon]
    depth_mask_3d: np.ndarray | None = None,  # [15, lat, lon]
) -> list[dict[str, Any]]:
    """Compute performance metrics for each of the 15 depths."""
    breakdown = []
    for d_idx, z in enumerate(DEPTH_LEVELS):
        pred_z = pred_cubes[:, d_idx]
        tgt_z = target_cubes[:, d_idx]
        clim_z = clim_cubes[:, d_idx]

        mask_z = None
        if depth_mask_3d is not None:
            mask_2d = depth_mask_3d[d_idx]
            mask_z = np.broadcast_to(mask_2d, pred_z.shape)

        metrics = compute_all_pointwise_metrics(pred_z, tgt_z, clim_z, mask=mask_z)
        entry = {"depth": float(z), **metrics.__dict__}
        breakdown.append(entry)
    return breakdown


def compute_basin_breakdown(
    pred_cubes: np.ndarray,  # [N, 15, lat, lon]
    target_cubes: np.ndarray,  # [N, 15, lat, lon]
    clim_cubes: np.ndarray,  # [N, 15, lat, lon]
    ocean_mask_2d: np.ndarray | None = None,
) -> dict[str, dict[str, float]]:
    """Compute metrics across Arabian Sea, Bay of Bengal, and Equatorial Indian Ocean."""
    basin_metrics = {}
    for b_name in BASIN_BOUNDS.keys():
        b_mask = get_basin_mask(b_name, ocean_mask_2d)
        # Broadcast 2D basin mask to 4D
        b_mask_4d = np.broadcast_to(b_mask, pred_cubes.shape)
        metrics = compute_all_pointwise_metrics(
            pred_cubes, target_cubes, clim_cubes, mask=b_mask_4d
        )
        basin_metrics[b_name] = metrics.__dict__
    return basin_metrics


def compute_season_breakdown(
    pred_cubes: np.ndarray,  # [N, 15, lat, lon]
    target_cubes: np.ndarray,  # [N, 15, lat, lon]
    clim_cubes: np.ndarray,  # [N, 15, lat, lon]
    dates: list[str],
    ocean_mask_2d: np.ndarray | None = None,
) -> dict[str, dict[str, float]]:
    """Compute metrics stratified by monsoon seasons."""
    months = np.array([pd.to_datetime(d).month for d in dates])
    season_metrics = {}

    for s_name, s_months in SEASON_MONTHS.items():
        s_indices = np.where(np.isin(months, s_months))[0]
        if len(s_indices) == 0:
            season_metrics[s_name] = {
                "rmse": float("nan"),
                "mae": float("nan"),
                "bias": float("nan"),
                "pearson_r": float("nan"),
                "acc": float("nan"),
                "skill_score_clim": float("nan"),
            }
            continue

        p_sub = pred_cubes[s_indices]
        t_sub = target_cubes[s_indices]
        c_sub = clim_cubes[s_indices]
        mask_sub = (
            np.broadcast_to(ocean_mask_2d, p_sub.shape) if ocean_mask_2d is not None else None
        )

        metrics = compute_all_pointwise_metrics(p_sub, t_sub, c_sub, mask=mask_sub)
        season_metrics[s_name] = metrics.__dict__

    return season_metrics
