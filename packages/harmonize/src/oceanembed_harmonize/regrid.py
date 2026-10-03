"""Spatial Regridding Engine for OceanEmbed.

Standardizes diverse raw satellite and reanalysis grids (OSTIA 0.05°, SMOS+SMAP 0.125°,
GLORYS 1/12°, ARMOR3D 1/8°, CCMP 0.25°) to the target 0.25° ascending coordinate grid
(lat 5.0 to 30.0, lon 45.0 to 105.0; 101 x 241 cells).
"""

import numpy as np
from oceanembed_contracts import (
    get_lat_coords,
    get_lon_coords,
)
from scipy.interpolate import RegularGridInterpolator


def regrid_2d_field(
    src_lats: np.ndarray,
    src_lons: np.ndarray,
    src_data: np.ndarray,
    target_lats: np.ndarray | None = None,
    target_lons: np.ndarray | None = None,
    method: str = "linear",
    fill_value: float = np.nan,
) -> np.ndarray:
    """Regrid a 2D scalar field to the OceanEmbed target grid.

    Args:
        src_lats: 1D source latitude array (monotonically increasing or decreasing).
        src_lons: 1D source longitude array (monotonically increasing).
        src_data: 2D array [len(src_lats), len(src_lons)].
        target_lats: Target latitude coordinates (defaults to 101 points 5..30°N).
        target_lons: Target longitude coordinates (defaults to 241 points 45..105°E).
        method: 'linear' or 'nearest'.
        fill_value: Value for out-of-bounds cells (np.nan).

    Returns:
        2D regridded array of shape (101, 241).
    """
    if target_lats is None:
        target_lats = get_lat_coords()
    if target_lons is None:
        target_lons = get_lon_coords()

    src_lats = np.asarray(src_lats, dtype=np.float64)
    src_lons = np.asarray(src_lons, dtype=np.float64)
    src_data = np.asarray(src_data, dtype=np.float64)

    # Ensure source latitudes are strictly ascending
    if src_lats[0] > src_lats[-1]:
        src_lats = src_lats[::-1]
        src_data = src_data[::-1, :]

    # Ensure source longitudes are strictly ascending
    if src_lons[0] > src_lons[-1]:
        src_lons = src_lons[::-1]
        src_data = src_data[:, ::-1]

    # Target meshgrid
    tgt_lat_grid, tgt_lon_grid = np.meshgrid(target_lats, target_lons, indexing="ij")
    eval_points = np.stack([tgt_lat_grid.ravel(), tgt_lon_grid.ravel()], axis=-1)

    interpolator = RegularGridInterpolator(
        (src_lats, src_lons),
        src_data,
        method=method,
        bounds_error=False,
        fill_value=fill_value,
    )

    regridded = interpolator(eval_points).reshape(len(target_lats), len(target_lons))
    return np.asarray(regridded, dtype=np.float32)


def regrid_3d_cube(
    src_lats: np.ndarray,
    src_lons: np.ndarray,
    src_cube: np.ndarray,
    target_lats: np.ndarray | None = None,
    target_lons: np.ndarray | None = None,
    method: str = "linear",
) -> np.ndarray:
    """Regrid a 3D volume [depth/channel, src_lat, src_lon] to target spatial grid."""
    if target_lats is None:
        target_lats = get_lat_coords()
    if target_lons is None:
        target_lons = get_lon_coords()

    n_levels = src_cube.shape[0]
    out = np.empty((n_levels, len(target_lats), len(target_lons)), dtype=np.float32)

    for k in range(n_levels):
        out[k] = regrid_2d_field(
            src_lats,
            src_lons,
            src_cube[k],
            target_lats=target_lats,
            target_lons=target_lons,
            method=method,
        )
    return out
