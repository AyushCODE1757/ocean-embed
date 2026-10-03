"""Masks and Static Context Field Generation Module for OceanEmbed.

Generates:
- `valid_ocean_mask` [101, 241]: 2D boolean mask (True=Ocean, False=Land).
- `valid_depth_mask` [15, 101, 241]: 3D boolean mask (seafloor shallower than
  level means invalid target).
- 4 context channels [4, 101, 241]:
  1. `bathymetry` (m)
  2. `latitude` (°N)
  3. `sin_doy` = sin(2 * pi * doy / 365.25)
  4. `cos_doy` = cos(2 * pi * doy / 365.25)

Key function `tighten_mask_to_data` post-processes the geometry-derived masks by
removing any cells that are inside valid_ocean but carry NaN data on every date.
These are coastal regridding artefacts (cells that barely passed the 0.5 threshold
but lie in a source-grid land cell). We never silently fill them — we exclude them.
"""

import numpy as np
import pandas as pd
from oceanembed_contracts import (
    DEPTH_LEVELS,
    LAT_COUNT,
    LON_COUNT,
    NUM_CONTEXT_CHANNELS,
    NUM_DEPTHS,
    SPATIAL_SHAPE,
    get_spatial_grid,
)


def build_depth_masks_from_bathymetry(
    bathymetry_m: np.ndarray,
    ocean_mask: np.ndarray,
) -> tuple[np.ndarray, np.ndarray]:
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


def tighten_mask_to_data(
    valid_ocean_mask: np.ndarray,
    valid_depth_mask: np.ndarray,
    surface_cube: np.ndarray,
    target_cube: np.ndarray,
) -> tuple[np.ndarray, np.ndarray]:
    """Remove cells that are inside the geometry-derived mask but have no valid data.

    Coastal cells that survive the 0.5-threshold regrid step but sit entirely over land
    in the source grid will be NaN on every date for every variable.  We detect them
    by asking: does ANY time step have at least one non-NaN surface value at this cell?
    If not, the cell is excluded from both valid_ocean and valid_depth.

    This is the authoritative mask-tightening step.  It MUST be run after the full
    surface and target arrays are built, before writing the Zarr stores.

    Args:
        valid_ocean_mask: 2D bool [lat, lon] from build_depth_masks_from_bathymetry.
        valid_depth_mask: 3D bool [depth, lat, lon] from build_depth_masks_from_bathymetry.
        surface_cube: 4D float32 [time, channel, lat, lon] — full harmonized surface inputs.
        target_cube:  4D float32 [time, depth, lat, lon] — full harmonized targets.

    Returns:
        (tightened_ocean_mask [lat, lon], tightened_depth_mask [depth, lat, lon])
    """
    # A cell has valid surface data if at least 1 time step has ≥1 non-NaN surface channel
    # surface_cube: [time, channel, lat, lon]
    # any_surface_valid: [lat, lon]
    any_surface_valid = np.any(~np.isnan(surface_cube), axis=(0, 1))  # over time & channel

    # A cell has valid target data if at least 1 time step × depth level is non-NaN
    # target_cube: [time, depth, lat, lon]
    any_target_valid = np.any(~np.isnan(target_cube), axis=(0, 1))  # over time & depth

    # Combined: must have BOTH surface and target data to be considered ocean
    data_supported = any_surface_valid & any_target_valid

    n_dropped = int(np.sum(valid_ocean_mask & ~data_supported))
    if n_dropped > 0:
        import logging

        logging.getLogger(__name__).warning(
            f"tighten_mask_to_data: dropping {n_dropped} cells from valid_ocean_mask "
            f"that are in the geometry mask but have no data on any date "
            f"(coastal regridding artefacts)."
        )

    tight_ocean = valid_ocean_mask & data_supported
    # Per-depth tightening: a depth level at a cell is valid only if the ocean cell itself
    # is valid AND at least one time step has non-NaN target at that depth.
    # target_cube: [time, depth, lat, lon] -> any_target_per_depth: [depth, lat, lon]
    any_target_per_depth = np.any(~np.isnan(target_cube), axis=0)  # [depth, lat, lon]
    tight_depth = valid_depth_mask & any_target_per_depth

    return tight_ocean, tight_depth


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
