"""OceanEmbed Grid Contract Specification.

Defines spatial boundaries, resolution, and coordinate arrays for the North Indian Ocean domain (5-30°N, 45-105°E).
"""
from dataclasses import dataclass
from typing import Tuple
import numpy as np


LAT_MIN: float = 5.0
LAT_MAX: float = 30.0
LAT_STEP: float = 0.25
LAT_COUNT: int = 101  # np.arange(5.0, 30.0 + 0.25, 0.25) -> 101 elements

LON_MIN: float = 45.0
LON_MAX: float = 105.0
LON_STEP: float = 0.25
LON_COUNT: int = 241  # np.arange(45.0, 105.0 + 0.25, 0.25) -> 241 elements

SPATIAL_SHAPE: Tuple[int, int] = (LAT_COUNT, LON_COUNT)
CRS: str = "EPSG:4326"
REGION_NAME: str = "North Indian Ocean (Arabian Sea, Bay of Bengal, Equatorial Indian Ocean)"


def get_lat_coords() -> np.ndarray:
    """Return 1D array of latitude coordinates (ascending from 5.0 to 30.0)."""
    return np.round(np.linspace(LAT_MIN, LAT_MAX, LAT_COUNT), decimals=4)


def get_lon_coords() -> np.ndarray:
    """Return 1D array of longitude coordinates (ascending from 45.0 to 105.0)."""
    return np.round(np.linspace(LON_MIN, LON_MAX, LON_COUNT), decimals=4)


def get_spatial_grid() -> Tuple[np.ndarray, np.ndarray]:
    """Return 2D meshgrid of (lat, lon) coordinates each of shape (101, 241)."""
    lats = get_lat_coords()
    lons = get_lon_coords()
    lon_grid, lat_grid = np.meshgrid(lons, lats)
    return lat_grid, lon_grid


@dataclass(frozen=True)
class GridSpec:
    lat_min: float = LAT_MIN
    lat_max: float = LAT_MAX
    lat_step: float = LAT_STEP
    lat_count: int = LAT_COUNT
    lon_min: float = LON_MIN
    lon_max: float = LON_MAX
    lon_step: float = LON_STEP
    lon_count: int = LON_COUNT
    crs: str = CRS
    region: str = REGION_NAME
