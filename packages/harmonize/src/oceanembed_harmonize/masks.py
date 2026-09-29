"""Masks and Static Context Field Generation Module for OceanEmbed.

Generates:
- `valid_ocean_mask` [101, 241]: 2D boolean mask (True=Ocean, False=Land).
- `valid_depth_mask` [15, 101, 241]: 3D boolean mask (seafloor shallower than level means invalid target).
- 4 context channels [4, 101, 241]:
  1. `bathymetry` (m)
  2. `latitude` (°N)
  3. `sin_doy` = sin(2 * pi * doy / 365.25)
  4. `cos_doy` = cos(2 * pi * doy / 365.25)
"""
from datetime import datetime
from typing import Tuple
import numpy as np
import pandas as pd

from oceanembed_contracts import (
    DEPTH_LEVELS,
    LAT_COUNT,
    LON_COUNT,
    NUM_CONTEXT_CHANNELS,
    NUM_DEPTHS,
    SPATIAL_SHAPE,
    get_lat_coords,
    get_lon_coords,
    get_spatial_grid,
)


def build_depth_masks_from_bathymetry(
    bathymetry_m: np.ndarray,
    ocean_mask: np.ndarray,
) -> Tuple[np.ndarray, np.ndarray]:
    """Build 2D ocean mask and 3D depth-level validity masks.

    Args:
        bathymetry_m: 2D array [101, 241] of seafloor depths in meters.
        ocean_mask: 2D boolean array [101, 241].

    Returns:
        (valid_ocean_mask [101, 241], valid_depth_mask [15, 101, 241])
    """
    valid_ocean_mask = np.asarray(ocean_mask, dtype=bool)
    valid_depth_mask = np.zeros((NUM_DEPTHS, LAT_COUNT, LON_COUNT), dtype=bool)

    for i, z in enumerate(DEPTH_LEVELS):
        # Ocean is valid at depth z if it's ocean AND seafloor depth >= z
        valid_depth_mask[i] = valid_ocean_mask & (bathymetry_m >= z)

    return valid_ocean_mask, valid_depth_mask


def build_context_channels(
    date_str: str,
    bathymetry_m: np.ndarray,
    ocean_mask: np.ndarray,
) -> np.ndarray:
    """Build 4 context channels [4, 101, 241] for a specified calendar date.

    Channels:
        0: bathymetry (m)
        1: latitude (°N)
        2: sin(DOY)
        3: cos(DOY)
    """
    dt = pd.to_datetime(date_str)
    doy = dt.dayofyear
    lat_grid, _ = get_spatial_grid()

    context = np.empty((NUM_CONTEXT_CHANNELS, LAT_COUNT, LON_COUNT), dtype=np.float32)

    # 0: Bathymetry
    bathy = bathymetry_m.copy()
    bathy[~ocean_mask] = 0.0
    context[0] = bathy.astype(np.float32)

    # 1: Latitude coordinate
    context[1] = lat_grid.astype(np.float32)

    # 2: sin(DOY)
    sin_val = np.sin(2.0 * np.pi * doy / 365.25)
    context[2] = np.full(SPATIAL_SHAPE, sin_val, dtype=np.float32)

    # 3: cos(DOY)
    cos_val = np.cos(2.0 * np.pi * doy / 365.25)
    context[3] = np.full(SPATIAL_SHAPE, cos_val, dtype=np.float32)

    return context
