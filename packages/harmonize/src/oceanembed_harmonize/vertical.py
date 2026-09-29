"""Monotone PCHIP Vertical Interpolation Module for OceanEmbed.

Interpolates subsurface ocean temperature profiles from arbitrary depth levels
to the 15 standard SIH depths using Monotone Piecewise Cubic Hermite Interpolating
Polynomial (PCHIP) interpolation. Monotone interpolation guarantees no synthetic overshoots
and preserves natural thermal stratification and thermocline structure.
"""
from typing import List, Optional, Union
import numpy as np
from scipy.interpolate import PchipInterpolator

from oceanembed_contracts import DEPTH_LEVELS, NUM_DEPTHS


def interpolate_profile_pchip(
    source_depths: np.ndarray,
    source_temps: np.ndarray,
    target_depths: Optional[np.ndarray] = None,
    max_depth_extrapolate_m: float = 5.0,
) -> np.ndarray:
    """Interpolate a 1D temperature profile to target depth levels via PCHIP.

    Args:
        source_depths: 1D array of source measurement depths in meters (ascending).
        source_temps: 1D array of temperature values in °C.
        target_depths: Desired target depths (defaults to 15 SIH standard levels).
        max_depth_extrapolate_m: Allowable shallow extrapolation margin (e.g. 0m from 0.5m).

    Returns:
        1D array of interpolated temperatures at target depths, with NaNs where invalid.
    """
    if target_depths is None:
        target_depths = np.array(DEPTH_LEVELS, dtype=np.float32)

    valid_mask = ~np.isnan(source_temps) & ~np.isnan(source_depths)
    if np.sum(valid_mask) < 2:
        return np.full(len(target_depths), np.nan, dtype=np.float32)

    z_valid = np.asarray(source_depths[valid_mask], dtype=np.float64)
    t_valid = np.asarray(source_temps[valid_mask], dtype=np.float64)

    # Sort in ascending depth
    sort_idx = np.argsort(z_valid)
    z_valid = z_valid[sort_idx]
    t_valid = t_valid[sort_idx]

    # Remove duplicate depth measurements if any
    unique_z, unique_idx = np.unique(z_valid, return_index=True)
    z_valid = unique_z
    t_valid = t_valid[unique_idx]

    if len(z_valid) < 2:
        return np.full(len(target_depths), np.nan, dtype=np.float32)

    # Near-surface extrapolation handling: if shallowest measurement is <= 5m, extrapolate flat to 0m
    if z_valid[0] > 0.0 and z_valid[0] <= max_depth_extrapolate_m:
        z_valid = np.insert(z_valid, 0, 0.0)
        t_valid = np.insert(t_valid, 0, t_valid[0])

    interpolator = PchipInterpolator(z_valid, t_valid, extrapolate=False)
    interpolated = interpolator(target_depths)

    return np.asarray(interpolated, dtype=np.float32)


def interpolate_cube_vertical_pchip(
    source_cube: np.ndarray,
    source_depths: np.ndarray,
    target_depths: Optional[np.ndarray] = None,
) -> np.ndarray:
    """Interpolate a 3D [source_depths, lat, lon] or 4D [time, source_depths, lat, lon] cube.

    Returns:
        Cube interpolated to target depth levels: [..., 15, lat, lon].
    """
    if target_depths is None:
        target_depths = np.array(DEPTH_LEVELS, dtype=np.float32)

    if source_cube.ndim == 3:
        n_z_src, n_lat, n_lon = source_cube.shape
        out_cube = np.full((len(target_depths), n_lat, n_lon), np.nan, dtype=np.float32)
        for i in range(n_lat):
            for j in range(n_lon):
                prof = source_cube[:, i, j]
                if not np.all(np.isnan(prof)):
                    out_cube[:, i, j] = interpolate_profile_pchip(source_depths, prof, target_depths)
        return out_cube

    elif source_cube.ndim == 4:
        n_t, n_z_src, n_lat, n_lon = source_cube.shape
        out_cube = np.full((n_t, len(target_depths), n_lat, n_lon), np.nan, dtype=np.float32)
        for t in range(n_t):
            for i in range(n_lat):
                for j in range(n_lon):
                    prof = source_cube[t, :, i, j]
                    if not np.all(np.isnan(prof)):
                        out_cube[t, :, i, j] = interpolate_profile_pchip(source_depths, prof, target_depths)
        return out_cube

    else:
        raise ValueError(f"Expected 3D or 4D cube, got shape {source_cube.shape}")
