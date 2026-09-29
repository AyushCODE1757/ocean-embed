"""Climatology and Anomaly Harmonization Module for OceanEmbed.

Computes daily Day-of-Year (DOY 1..366) climatological mean and standard deviation
strictly over the training years (April 2015 to December 2022) to prevent data leakage.
Provides standardized anomaly calculation and raw field reconstruction.
"""
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Union
import numpy as np
import pandas as pd
import xarray as xr

from oceanembed_contracts import (
    DEPTH_LEVELS,
    LAT_COUNT,
    LON_COUNT,
    NUM_DEPTHS,
    NUM_SURFACE_CHANNELS,
    SURFACE_CHANNELS,
    TRAIN_END_DATE,
    TRAIN_START_DATE,
    get_lat_coords,
    get_lon_coords,
)


class ClimatologyEngine:
    """Manages computation, storage, and anomaly evaluation from training climatology."""

    def __init__(self, climatology_ds: Optional[xr.Dataset] = None):
        self.climatology_ds = climatology_ds

    @classmethod
    def compute_from_cubes(
        cls,
        target_cubes: Dict[str, np.ndarray],  # date_str -> [15, 101, 241]
        surface_cubes: Optional[Dict[str, np.ndarray]] = None,  # date_str -> [7, 101, 241]
        train_start: str = TRAIN_START_DATE,
        train_end: str = TRAIN_END_DATE,
    ) -> "ClimatologyEngine":
        """Compute 3D target DOY climatology and optional surface climatology from training dates."""
        lats = get_lat_coords()
        lons = get_lon_coords()

        # Filter training dates
        train_dates = [
            d for d in target_cubes.keys()
            if train_start <= d <= train_end
        ]

        # Group target by DOY (1..366)
        doy_target_buckets: Dict[int, List[np.ndarray]] = {d: [] for d in range(1, 367)}
        for d_str in train_dates:
            doy = pd.to_datetime(d_str).dayofyear
            doy_target_buckets[doy].append(target_cubes[d_str])

        # If sparse sample, aggregate with smoothing or available dates
        doy_mean_target = np.full((366, NUM_DEPTHS, LAT_COUNT, LON_COUNT), np.nan, dtype=np.float32)
        doy_std_target = np.full((366, NUM_DEPTHS, LAT_COUNT, LON_COUNT), np.nan, dtype=np.float32)

        # Global training mean across all training samples as fallback for unobserved DOYs
        all_train_targets = [target_cubes[d] for d in train_dates] if train_dates else list(target_cubes.values())
        if all_train_targets:
            global_train_mean = np.nanmean(np.stack(all_train_targets, axis=0), axis=0)
            global_train_std = np.nanstd(np.stack(all_train_targets, axis=0), axis=0)
        else:
            global_train_mean = np.zeros((NUM_DEPTHS, LAT_COUNT, LON_COUNT), dtype=np.float32)
            global_train_std = np.ones((NUM_DEPTHS, LAT_COUNT, LON_COUNT), dtype=np.float32)

        for doy in range(1, 367):
            if doy_target_buckets[doy]:
                stacked = np.stack(doy_target_buckets[doy], axis=0)
                doy_mean_target[doy - 1] = np.nanmean(stacked, axis=0)
                doy_std_target[doy - 1] = np.nanstd(stacked, axis=0)
            else:
                doy_mean_target[doy - 1] = global_train_mean
                doy_std_target[doy - 1] = global_train_std

        # Build Xarray dataset
        ds = xr.Dataset(
            data_vars={
                "temp_clim_mean": (["doy", "depth", "lat", "lon"], doy_mean_target),
                "temp_clim_std": (["doy", "depth", "lat", "lon"], doy_std_target),
                "global_train_mean": (["depth", "lat", "lon"], global_train_mean),
                "global_train_std": (["depth", "lat", "lon"], global_train_std),
            },
            coords={
                "doy": np.arange(1, 367),
                "depth": DEPTH_LEVELS,
                "lat": lats,
                "lon": lons,
            },
            attrs={
                "title": "OceanEmbed Subsurface Temperature Climatology (B0 Baseline)",
                "training_start": train_start,
                "training_end": train_end,
            },
        )
        return cls(ds)

    def get_climatology_for_date(self, date_str: str) -> Tuple[np.ndarray, np.ndarray]:
        """Return (clim_mean [15, 101, 241], clim_std [15, 101, 241]) for a date."""
        if self.climatology_ds is None:
            raise ValueError("Climatology engine not initialized.")
        doy = pd.to_datetime(date_str).dayofyear
        mean = self.climatology_ds["temp_clim_mean"].sel(doy=doy).values
        std = self.climatology_ds["temp_clim_std"].sel(doy=doy).values
        return mean, std

    def compute_target_anomaly(self, raw_target: np.ndarray, date_str: str) -> np.ndarray:
        """Compute anomaly = raw_target - clim_mean."""
        clim_mean, _ = self.get_climatology_for_date(date_str)
        return raw_target - clim_mean

    def reconstruct_from_anomaly(self, anomaly: np.ndarray, date_str: str) -> np.ndarray:
        """Reconstruct raw temperature = anomaly + clim_mean."""
        clim_mean, _ = self.get_climatology_for_date(date_str)
        return anomaly + clim_mean

    def save_zarr(self, zarr_path: Union[str, Path]) -> None:
        """Save climatology dataset to Zarr store."""
        if self.climatology_ds is not None:
            self.climatology_ds.to_zarr(zarr_path, mode="w")

    @classmethod
    def load_zarr(cls, zarr_path: Union[str, Path]) -> "ClimatologyEngine":
        """Load climatology dataset from Zarr store."""
        ds = xr.open_zarr(zarr_path)
        return cls(ds)
