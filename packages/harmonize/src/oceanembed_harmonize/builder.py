"""Unified Zarr Cube Pipeline Builder for OceanEmbed Harmonization.

Coordinates regridding, vertical interpolation, mask synthesis, climatology computation,
and writing of compressed Zarr stores consumed by ML Core (Person B) and Serving (Person C).
"""

import logging
from pathlib import Path

import numpy as np
import pandas as pd
import xarray as xr
from oceanembed_contracts import (
    DEFAULT_CUBES_DIR,
    DEPTH_LEVELS,
    LAT_COUNT,
    LON_COUNT,
    NUM_CONTEXT_CHANNELS,
    NUM_DEPTHS,
    NUM_SURFACE_CHANNELS,
    SURFACE_CHANNELS,
    TRAIN_END_DATE,
    TRAIN_START_DATE,
    get_lat_coords,
    get_lon_coords,
    validate_masks,
    validate_surface_input_cube,
    validate_target_temp_cube,
)

from oceanembed_harmonize.climatology import ClimatologyEngine
from oceanembed_harmonize.masks import (
    build_context_channels,
    build_depth_masks_from_bathymetry,
    tighten_mask_to_data,
)
from oceanembed_harmonize.qc import generate_qc_report
from oceanembed_harmonize.regrid import regrid_2d_field, regrid_3d_cube
from oceanembed_harmonize.vertical import interpolate_cube_vertical_pchip

logger = logging.getLogger(__name__)


class HarmonizePipelineBuilder:
    """Builds unified input, target, mask, and climatology Zarr stores."""

    def __init__(
        self, raw_dir: Path = Path("data/raw"), output_cubes_dir: Path = DEFAULT_CUBES_DIR
    ):
        self.raw_dir = Path(raw_dir)
        self.output_cubes_dir = Path(output_cubes_dir)
        self.output_cubes_dir.mkdir(parents=True, exist_ok=True)
        self.lats = get_lat_coords()
        self.lons = get_lon_coords()

    def build_all(
        self,
        dates: list[str] | None = None,
        qc_output_path: Path | None = None,
    ) -> dict[str, Path]:
        """Run full harmonization pipeline end-to-end."""
        logger.info("Starting OceanEmbed harmonization pipeline...")

        # 1. Load Bathymetry and build masks
        bathy_file = self._find_bathymetry_file()
        bathy_ds = xr.open_dataset(bathy_file)

        raw_bathy = (
            bathy_ds["depth"].values if "depth" in bathy_ds else -bathy_ds["elevation"].values
        )
        src_lats = bathy_ds["lat"].values
        src_lons = bathy_ds["lon"].values

        bathymetry_2d = regrid_2d_field(src_lats, src_lons, raw_bathy)
        ocean_mask_raw = (
            (bathy_ds["ocean_mask"].values > 0) if "ocean_mask" in bathy_ds else (raw_bathy > 0)
        )
        ocean_mask_2d = regrid_2d_field(src_lats, src_lons, ocean_mask_raw.astype(np.float32)) > 0.5

        valid_ocean_mask, valid_depth_mask = build_depth_masks_from_bathymetry(
            bathymetry_2d, ocean_mask_2d
        )
        validate_masks(valid_ocean_mask, valid_depth_mask)

        # 2. Identify available daily surface and target files
        daily_files = self._discover_daily_files(dates)
        sorted_dates = sorted(daily_files.keys())
        n_days = len(sorted_dates)
        logger.info(f"Found {n_days} daily slices to harmonize.")

        if n_days == 0:
            raise RuntimeError(f"No daily raw files found in {self.raw_dir}.")

        # Allocate cube arrays
        surface_inputs = np.empty(
            (n_days, NUM_SURFACE_CHANNELS, LAT_COUNT, LON_COUNT), dtype=np.float32
        )
        context_inputs = np.empty(
            (n_days, NUM_CONTEXT_CHANNELS, LAT_COUNT, LON_COUNT), dtype=np.float32
        )
        target_temps = np.empty((n_days, NUM_DEPTHS, LAT_COUNT, LON_COUNT), dtype=np.float32)
        target_dict_for_clim = {}

        for idx, d_str in enumerate(sorted_dates):
            pair = daily_files[d_str]
            surf_ds = xr.open_dataset(pair["surface"])
            target_ds = xr.open_dataset(pair["target"])

            # Harmonize surface channels (fixed order: sst, sss, sla, ucur, vcur, uwind, vwind)
            for c_idx, ch_name in enumerate(SURFACE_CHANNELS):
                var_data = surf_ds[ch_name].values.squeeze()
                src_l = surf_ds["lat"].values
                src_o = surf_ds["lon"].values
                regridded_surf = regrid_2d_field(src_l, src_o, var_data)
                # Apply ocean mask
                regridded_surf[~valid_ocean_mask] = np.nan
                surface_inputs[idx, c_idx] = regridded_surf

            # Context channels
            context_inputs[idx] = build_context_channels(d_str, bathymetry_2d, valid_ocean_mask)

            # Harmonize target 3D temperature
            var_name = (
                "thetao"
                if "thetao" in target_ds
                else ("temp" if "temp" in target_ds else list(target_ds.data_vars.keys())[0])
            )
            raw_tgt = target_ds[var_name].values.squeeze()
            tgt_l = target_ds["lat"].values
            tgt_o = target_ds["lon"].values
            tgt_z = target_ds["depth"].values if "depth" in target_ds else target_ds["level"].values

            # Regrid spatially
            tgt_regrid = regrid_3d_cube(tgt_l, tgt_o, raw_tgt)
            # Vertical interpolation to 15 SIH depths
            tgt_vertical = interpolate_cube_vertical_pchip(
                tgt_regrid, tgt_z, np.array(DEPTH_LEVELS)
            )
            # Apply depth masks
            tgt_vertical[~valid_depth_mask] = np.nan

            target_temps[idx] = tgt_vertical
            target_dict_for_clim[d_str] = tgt_vertical

            surf_ds.close()
            target_ds.close()

        # Validate cubes against contracts
        validate_surface_input_cube(surface_inputs)
        validate_target_temp_cube(target_temps)

        # Post-step: tighten masks to data (removes coastal regridding artefacts)
        logger.info("Tightening masks to data support (removing coastal NaN artefacts)...")
        valid_ocean_mask, valid_depth_mask = tighten_mask_to_data(
            valid_ocean_mask, valid_depth_mask, surface_inputs, target_temps
        )
        # Re-apply tightened masks so cubes don't contain valid-mask cells with NaN
        for t in range(surface_inputs.shape[0]):
            for c in range(surface_inputs.shape[1]):
                surface_inputs[t, c][~valid_ocean_mask] = np.nan
        for t in range(target_temps.shape[0]):
            target_temps[t][~valid_depth_mask] = np.nan

        # 3. Compute training climatology
        logger.info("Computing day-of-year climatology over training years...")
        clim_engine = ClimatologyEngine.compute_from_cubes(
            target_dict_for_clim,
            train_start=TRAIN_START_DATE,
            train_end=TRAIN_END_DATE,
        )

        # 4. Save Zarr Datasets
        logger.info("Writing Zarr stores...")
        time_coords = [pd.to_datetime(d) for d in sorted_dates]

        # Masks Zarr
        masks_ds = xr.Dataset(
            data_vars={
                "valid_ocean_mask": (["lat", "lon"], valid_ocean_mask),
                "valid_depth_mask": (["depth", "lat", "lon"], valid_depth_mask),
                "bathymetry": (["lat", "lon"], bathymetry_2d),
            },
            coords={"lat": self.lats, "lon": self.lons, "depth": DEPTH_LEVELS},
        )
        masks_path = self.output_cubes_dir / "masks.zarr"
        masks_ds.to_zarr(masks_path, mode="w")

        # Input Surface Cube Zarr
        input_ds = xr.Dataset(
            data_vars={
                "surface": (["time", "channel", "lat", "lon"], surface_inputs),
                "context": (["time", "context_channel", "lat", "lon"], context_inputs),
            },
            coords={
                "time": time_coords,
                "channel": SURFACE_CHANNELS,
                "context_channel": ["bathymetry", "latitude", "sin_doy", "cos_doy"],
                "lat": self.lats,
                "lon": self.lons,
            },
        )
        inputs_path = self.output_cubes_dir / "cube_inputs.zarr"
        input_ds.to_zarr(inputs_path, mode="w")

        # Target Temperature Cube Zarr
        target_ds = xr.Dataset(
            data_vars={
                "temp": (["time", "depth", "lat", "lon"], target_temps),
            },
            coords={
                "time": time_coords,
                "depth": DEPTH_LEVELS,
                "lat": self.lats,
                "lon": self.lons,
            },
        )
        targets_path = self.output_cubes_dir / "cube_targets.zarr"
        target_ds.to_zarr(targets_path, mode="w")

        # Climatology Zarr
        clim_path = self.output_cubes_dir / "climatology.zarr"
        clim_engine.save_zarr(clim_path)

        # 5. Run QC Report
        qc_rep = generate_qc_report(surface_inputs, target_temps, valid_ocean_mask)
        if qc_output_path:
            import json

            Path(qc_output_path).parent.mkdir(parents=True, exist_ok=True)
            with open(qc_output_path, "w") as f:
                json.dump(qc_rep, f, indent=2)

        logger.info("Harmonization pipeline completed successfully.")
        return {
            "masks": masks_path,
            "inputs": inputs_path,
            "targets": targets_path,
            "climatology": clim_path,
        }

    def _find_bathymetry_file(self) -> Path:
        for p in self.raw_dir.glob("*bathymetry*"):
            if p.suffix in [".nc", ".nc4"]:
                return p
        raise FileNotFoundError(f"No bathymetry file found in {self.raw_dir}")

    def _discover_daily_files(self, dates: list[str] | None) -> dict[str, dict[str, Path]]:
        pairs = {}
        for surf_file in self.raw_dir.glob("surface_obs_*.nc"):
            d_str = surf_file.stem.replace("surface_obs_", "")
            if dates and d_str not in dates:
                continue
            tgt_file = self.raw_dir / f"glorys_target_{d_str}.nc"
            if tgt_file.exists():
                pairs[d_str] = {"surface": surf_file, "target": tgt_file}
        return pairs
