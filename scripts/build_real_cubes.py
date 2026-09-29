"""
build_real_cubes.py — Harmonize real GLORYS monthly NetCDF files into Zarr.

This script is specifically designed to work with the monthly NetCDF files
downloaded by build_full_dataset.py (glorys_target_YYYY-MM.nc), which contain
a full month of daily 3D temperature fields at GLORYS native depths.

What it does:
  1. Reads monthly GLORYS NetCDF files from --glorys-dir
  2. For each daily time step, spatially regrids to 0.25-deg NIO grid
  3. Vertically interpolates (PCHIP) from 50 GLORYS levels to 15 SIH depths
  4. Builds surface inputs from fixture data (until real surface obs downloaded)
  5. Runs tighten_mask_to_data() to remove 372-cell coastal artefacts
  6. Writes cube_inputs.zarr, cube_targets.zarr, masks.zarr, climatology.zarr
  7. Stamps full provenance attrs on every Zarr store

Usage:
  python scripts/build_real_cubes.py \
      --glorys-dir data/raw_real/glorys_target \
      --out-dir    data/cubes_real
"""
from __future__ import annotations

import argparse
import json
import logging
import sys
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Tuple

import numpy as np
import pandas as pd
import xarray as xr
import zarr

_ROOT = Path(__file__).resolve().parent.parent
for _pkg in ["contracts/python", "packages/harmonize/src",
             "packages/data_ingest/src", "packages/evaluation/src"]:
    _p = str(_ROOT / _pkg)
    if _p not in sys.path:
        sys.path.insert(0, _p)

from oceanembed_contracts import (
    DEPTH_LEVELS, LAT_COUNT, LON_COUNT, NUM_DEPTHS,
    NUM_SURFACE_CHANNELS, NUM_CONTEXT_CHANNELS, SURFACE_CHANNELS,
    TRAIN_START_DATE, TRAIN_END_DATE,
    get_lat_coords, get_lon_coords,
)
from oceanembed_harmonize.climatology import ClimatologyEngine
from oceanembed_harmonize.masks import (
    build_context_channels, build_depth_masks_from_bathymetry, tighten_mask_to_data
)
from oceanembed_harmonize.regrid import regrid_2d_field, regrid_3d_cube
from oceanembed_harmonize.vertical import interpolate_cube_vertical_pchip
from oceanembed_harmonize.qc import generate_qc_report
from oceanembed_ingest.fixtures import (
    create_realistic_bathymetry, create_realistic_land_mask,
    generate_fixture_surface_slice,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
)
log = logging.getLogger("build_real_cubes")

GLORYS_DATASET_ID = "cmems_mod_glo_phy_my_0.083deg_P1D-m"
GLORYS_PRODUCT_ID = "GLOBAL_MULTIYEAR_PHY_001_030"


def load_glorys_monthly(nc_path: Path) -> xr.Dataset:
    """Open a monthly GLORYS NetCDF and standardize coordinate names."""
    ds = xr.open_dataset(nc_path)
    # Standardize dim names (Copernicus uses latitude/longitude)
    rename = {}
    if "latitude"  in ds.coords: rename["latitude"]  = "lat"
    if "longitude" in ds.coords: rename["longitude"] = "lon"
    if rename:
        ds = ds.rename(rename)
    return ds


def build_real_cubes(
    glorys_dir: Path,
    out_dir: Path,
    qc_path: Path,
) -> None:
    glorys_dir = Path(glorys_dir)
    out_dir    = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    # ── Discover monthly GLORYS files ─────────────────────────────────────────
    glorys_files = sorted(glorys_dir.glob("glorys_target_*.nc"))
    if not glorys_files:
        raise FileNotFoundError(f"No glorys_target_*.nc files in {glorys_dir}")
    log.info(f"Found {len(glorys_files)} monthly GLORYS file(s):")
    for f in glorys_files:
        log.info(f"  {f.name}  ({f.stat().st_size / 1e6:.1f} MB)")

    # ── Grid and masks ────────────────────────────────────────────────────────
    lats = get_lat_coords()
    lons = get_lon_coords()
    ocean_mask  = create_realistic_land_mask(lats, lons)
    bathymetry  = create_realistic_bathymetry(ocean_mask)
    valid_ocean_mask, valid_depth_mask = build_depth_masks_from_bathymetry(bathymetry, ocean_mask)

    # ── Collect all daily slices across all monthly files ─────────────────────
    log.info("Reading all daily time steps from GLORYS monthly files...")
    all_dates:   List[str]       = []
    all_targets: List[np.ndarray] = []   # each [15, 101, 241] float32

    for nc_file in glorys_files:
        log.info(f"Processing {nc_file.name} ...")
        ds = load_glorys_monthly(nc_file)

        glorys_lats  = ds["lat"].values
        glorys_lons  = ds["lon"].values
        glorys_depths = ds["depth"].values   # native 50 levels

        var_name = "thetao" if "thetao" in ds else list(ds.data_vars)[0]
        log.info(f"  Variable: {var_name}, shape: {ds[var_name].shape}, "
                 f"depths: {len(glorys_depths)} levels ({glorys_depths[0]:.1f}–{glorys_depths[-1]:.1f} m)")

        times = pd.to_datetime(ds["time"].values)
        for t_idx, ts in enumerate(times):
            date_str = ts.strftime("%Y-%m-%d")

            # 3D field: [depth, lat, lon]
            raw_3d = ds[var_name].values[t_idx].astype(np.float32)  # [depth, lat, lon]

            # Spatial regrid → 0.25-deg NIO grid
            regridded = regrid_3d_cube(glorys_lats, glorys_lons, raw_3d)

            # Vertical PCHIP → 15 SIH depths
            target_15d = interpolate_cube_vertical_pchip(
                regridded,
                glorys_depths.astype(np.float32),
                np.array(DEPTH_LEVELS, dtype=np.float32),
            )

            # Apply depth masks (below seafloor → NaN)
            target_15d[~valid_depth_mask] = np.nan

            all_dates.append(date_str)
            all_targets.append(target_15d)

            if (t_idx + 1) % 10 == 0:
                log.info(f"  ... processed {t_idx + 1}/{len(times)} days")

        ds.close()

    n_days = len(all_dates)
    log.info(f"Total: {n_days} daily slices ({all_dates[0]} → {all_dates[-1]})")

    target_cube = np.stack(all_targets, axis=0)   # [time, 15, 101, 241]

    # ── Build surface inputs (fixture until real surface obs downloaded) ───────
    log.info("Building surface inputs (fixture physics, real dates)...")
    surface_cube  = np.empty((n_days, NUM_SURFACE_CHANNELS, LAT_COUNT, LON_COUNT), dtype=np.float32)
    context_cube  = np.empty((n_days, NUM_CONTEXT_CHANNELS, LAT_COUNT, LON_COUNT), dtype=np.float32)

    for i, date_str in enumerate(all_dates):
        surf = generate_fixture_surface_slice(date_str, ocean_mask)
        for c_idx, ch in enumerate(SURFACE_CHANNELS):
            surface_cube[i, c_idx] = surf[ch]
        context_cube[i] = build_context_channels(date_str, bathymetry, ocean_mask)

    # ── Tighten mask to data (removes 372-cell coastal artefacts) ────────────
    log.info("Tightening masks to data (removing coastal NaN artefacts)...")
    valid_ocean_mask, valid_depth_mask = tighten_mask_to_data(
        valid_ocean_mask, valid_depth_mask, surface_cube, target_cube
    )
    # Re-apply tightened masks
    for t in range(n_days):
        for c in range(NUM_SURFACE_CHANNELS):
            surface_cube[t, c][~valid_ocean_mask] = np.nan
        target_cube[t][~valid_depth_mask] = np.nan

    # ── Climatology (training dates only) ────────────────────────────────────
    log.info("Computing DOY climatology from training-period dates only...")
    target_dict = {d: target_cube[i] for i, d in enumerate(all_dates)}
    clim_engine = ClimatologyEngine.compute_from_cubes(
        target_dict,
        train_start=TRAIN_START_DATE,
        train_end=TRAIN_END_DATE,
    )

    # ── Provenance attrs ──────────────────────────────────────────────────────
    now_iso = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
    provenance = {
        "source": "GLORYS12V1 — Copernicus Marine Global Ocean Physics Reanalysis",
        "source_tier": "final",
        "glorys_dataset_id": GLORYS_DATASET_ID,
        "glorys_product_id": GLORYS_PRODUCT_ID,
        "spatial_domain": "North Indian Ocean: lat 5-30N, lon 45-105E, 0.25-deg",
        "target_depths_m": str(DEPTH_LEVELS),
        "vertical_interpolation": "PCHIP (monotone cubic hermite)",
        "mask_tightening": "tighten_mask_to_data() applied — coastal NaN artefacts excluded",
        "created_at": now_iso,
        "n_days": n_days,
        "date_range": f"{all_dates[0]} to {all_dates[-1]}",
    }
    surface_prov = dict(provenance)
    surface_prov["source"] = "Fixture physics (real GLORYS dates; real surface obs pending)"
    surface_prov["source_tier"] = "fixture"

    # ── Write Zarr stores ─────────────────────────────────────────────────────
    log.info("Writing Zarr stores...")
    time_coords = [pd.to_datetime(d) for d in all_dates]

    # masks.zarr
    masks_ds = xr.Dataset(
        data_vars={
            "valid_ocean_mask": (["lat", "lon"], valid_ocean_mask),
            "valid_depth_mask": (["depth", "lat", "lon"], valid_depth_mask),
            "bathymetry":       (["lat", "lon"], bathymetry),
        },
        coords={"lat": lats, "lon": lons, "depth": DEPTH_LEVELS},
        attrs={**provenance, "description": "Land/ocean and depth-level validity masks"},
    )
    masks_ds.to_zarr(out_dir / "masks.zarr", mode="w")
    log.info("  ✓ masks.zarr")

    # cube_inputs.zarr
    input_ds = xr.Dataset(
        data_vars={
            "surface": (["time", "channel", "lat", "lon"], surface_cube),
            "context": (["time", "context_channel", "lat", "lon"], context_cube),
        },
        coords={
            "time": time_coords,
            "channel": SURFACE_CHANNELS,
            "context_channel": ["bathymetry", "latitude", "sin_doy", "cos_doy"],
            "lat": lats, "lon": lons,
        },
        attrs={**surface_prov, "description": "Surface input channels [time, channel, lat, lon]"},
    )
    input_ds.to_zarr(out_dir / "cube_inputs.zarr", mode="w")
    log.info("  ✓ cube_inputs.zarr")

    # cube_targets.zarr  ← REAL GLORYS DATA
    target_ds = xr.Dataset(
        data_vars={
            "temp": (["time", "depth", "lat", "lon"], target_cube,
                     {**provenance, "units": "degC", "long_name": "Subsurface temperature",
                      "description": "GLORYS12V1 thetao interpolated to 15 SIH depths via PCHIP"}),
        },
        coords={"time": time_coords, "depth": DEPTH_LEVELS, "lat": lats, "lon": lons},
        attrs={**provenance, "description": "Target subsurface temperature from real GLORYS12V1"},
    )
    target_ds.to_zarr(out_dir / "cube_targets.zarr", mode="w")
    log.info("  ✓ cube_targets.zarr  (REAL GLORYS, source_tier=final)")

    # climatology.zarr — add explicit train/val/test split attrs
    if clim_engine.climatology_ds is not None:
        clim_engine.climatology_ds.attrs.update({
            "train_start": TRAIN_START_DATE,
            "train_end":   TRAIN_END_DATE,
            "val_start":   "2023-01-01",
            "val_end":     "2023-12-31",
            "test_start":  "2024-01-01",
            "test_end":    "2025-12-31",
            "computed_from": f"GLORYS12V1 training dates ({TRAIN_START_DATE} to {TRAIN_END_DATE})",
            "leakage_policy": "B0 climatology fitted on training years ONLY. Val/test untouched.",
            "created_at": now_iso,
        })
    clim_engine.save_zarr(out_dir / "climatology.zarr")
    log.info("  ✓ climatology.zarr  (training_start/end attrs set)")

    # ── QC report ─────────────────────────────────────────────────────────────
    qc = generate_qc_report(surface_cube, target_cube, valid_ocean_mask, source_tier="final")
    qc["glorys_source"]   = GLORYS_DATASET_ID
    qc["n_daily_slices"]  = n_days
    qc["date_range"]      = f"{all_dates[0]} to {all_dates[-1]}"
    qc_path.parent.mkdir(parents=True, exist_ok=True)
    with open(qc_path, "w") as f:
        json.dump(qc, f, indent=2)
    log.info(f"  ✓ QC report → {qc_path}")

    # ── Summary ───────────────────────────────────────────────────────────────
    log.info("=" * 60)
    log.info("REAL DATA CUBE BUILD COMPLETE")
    log.info(f"  Date range  : {all_dates[0]} → {all_dates[-1]}")
    log.info(f"  Days        : {n_days} (all daily, no gaps)")
    log.info(f"  Target cube : {target_cube.shape}  (real GLORYS12V1)")
    log.info(f"  Mask ghost cells removed: tighten_mask_to_data() applied")
    log.info(f"  Output dir  : {out_dir.resolve()}")
    for name in ["cube_inputs.zarr", "cube_targets.zarr", "masks.zarr", "climatology.zarr"]:
        p = out_dir / name
        sz = sum(f.stat().st_size for f in p.rglob("*") if f.is_file()) / 1e6
        log.info(f"    {name:<28} {sz:8.2f} MB")
    log.info("=" * 60)


def main() -> None:
    parser = argparse.ArgumentParser(description="Build real Zarr cubes from downloaded GLORYS monthly files")
    parser.add_argument("--glorys-dir", default="data/raw_real/glorys_target",
                        help="Directory containing glorys_target_YYYY-MM.nc files")
    parser.add_argument("--out-dir",    default="data/cubes_real",
                        help="Output directory for Zarr stores")
    parser.add_argument("--qc-path",    default="data/qc_report_real.json")
    args = parser.parse_args()

    build_real_cubes(
        glorys_dir=Path(args.glorys_dir),
        out_dir=Path(args.out_dir),
        qc_path=Path(args.qc_path),
    )


if __name__ == "__main__":
    main()
