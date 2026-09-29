"""Realistic Data Fixtures Generator for OceanEmbed.

Generates physically consistent small slices of ocean data for testing the pipeline:
- Accurate land-sea geography for North Indian Ocean (5-30°N, 45-105°E)
- Realistic ocean physics: Bay of Bengal freshwater pool (lower SSS), thermocline structure (50-150m)
- 7 surface channels, 15 subsurface depth levels, and co-located in-situ Argo float profiles
- Adheres strictly to the Truth Policy: all synthetic/test data are explicitly marked as source_tier='fixture'.
"""
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional, Tuple
import numpy as np
import pandas as pd
import xarray as xr

from oceanembed_contracts import (
    DEPTH_LEVELS,
    LAT_COUNT,
    LAT_MAX,
    LAT_MIN,
    LON_COUNT,
    LON_MAX,
    LON_MIN,
    NUM_DEPTHS,
    NUM_SURFACE_CHANNELS,
    SURFACE_CHANNELS,
    get_lat_coords,
    get_lon_coords,
    get_spatial_grid,
)
from oceanembed_ingest.manifest import ManifestManager


def create_realistic_land_mask(lats: np.ndarray, lons: np.ndarray) -> np.ndarray:
    """Generate boolean ocean mask (True=Ocean, False=Land) for North Indian Ocean."""
    lat_grid, lon_grid = np.meshgrid(lats, lons, indexing="ij")
    ocean_mask = np.ones_like(lat_grid, dtype=bool)

    # Indian subcontinent (approximate triangle: 8-28°N, 68-88°E)
    india_mask = (
        (lat_grid >= 8.0)
        & (lat_grid <= 28.0)
        & (lon_grid >= 68.0)
        & (lon_grid <= 88.0)
        & ((lat_grid - 8.0) >= 0.8 * np.abs(lon_grid - 78.0))
    )
    ocean_mask[india_mask] = False

    # Arabian Peninsula (approx 12-30°N, 45-60°E)
    arabia_mask = (
        (lat_grid >= 12.0)
        & (lon_grid <= 58.0)
        & ((lat_grid - 12.0) >= 0.4 * (lon_grid - 45.0))
    )
    ocean_mask[arabia_mask] = False

    # Southeast Asia / Indochina / Myanmar / Thailand (approx 5-30°N, 95-105°E)
    se_asia_mask = (
        (lat_grid >= 6.0)
        & (lon_grid >= 96.0)
        & ((lon_grid >= 99.0) | (lat_grid >= 15.0))
    )
    ocean_mask[se_asia_mask] = False

    # Iran / Pakistan coast (approx > 24°N, 58-68°E)
    iran_pak_mask = (lat_grid >= 24.0) & (lon_grid >= 58.0) & (lon_grid <= 68.0)
    ocean_mask[iran_pak_mask] = False

    return ocean_mask


def create_realistic_bathymetry(ocean_mask: np.ndarray) -> np.ndarray:
    """Generate realistic bathymetry in meters (negative=elevation, positive=ocean depth)."""
    lat_grid, lon_grid = get_spatial_grid()
    # Deep ocean basins: 3000 - 4500 m deep
    depths = 3800.0 - 500.0 * np.sin(lat_grid / 10.0) + 300.0 * np.cos(lon_grid / 15.0)
    # Coastal shelf shallowing
    depths = np.clip(depths, 50.0, 5000.0)
    # Land cells set to 0 or elevation
    depths[~ocean_mask] = 0.0
    return depths.astype(np.float32)


def generate_fixture_surface_slice(
    date_str: str,
    ocean_mask: np.ndarray,
) -> Dict[str, np.ndarray]:
    """Generate physically plausible 7 surface variables for a given calendar date."""
    dt = datetime.strptime(date_str, "%Y-%m-%d")
    doy = dt.timetuple().tm_yday
    lat_grid, lon_grid = get_spatial_grid()

    # Seasonal temperature variation (warmer in pre-monsoon May, cooler in winter Jan)
    season_factor = np.cos(2 * np.pi * (doy - 135) / 365.25)
    
    # 0: SST (°C) - 27-31°C in tropical Indian ocean
    sst = 28.5 + 1.5 * season_factor - 0.25 * (lat_grid - 15.0) + 0.5 * np.sin(lon_grid / 8.0)
    sst[~ocean_mask] = np.nan

    # 1: SSS (PSU) - Bay of Bengal (80-95°E) is fresher (31-33 PSU) than Arabian Sea (35-37 PSU)
    sss = 35.5 - 2.5 * (1.0 / (1.0 + np.exp(-(lon_grid - 82.0) / 3.0)))
    sss[~ocean_mask] = np.nan

    # 2: SLA (m) - mesoscale eddies ± 0.15 m
    sla = 0.08 * np.sin((lon_grid - 60.0) / 2.5) * np.cos((lat_grid - 10.0) / 2.0)
    sla[~ocean_mask] = np.nan

    # 3, 4: Surface Currents (m/s)
    ucur = 0.25 * np.cos(lat_grid / 4.0) * np.sin(season_factor)
    vcur = 0.15 * np.sin(lon_grid / 5.0)
    ucur[~ocean_mask] = np.nan
    vcur[~ocean_mask] = np.nan

    # 5, 6: Surface Winds (m/s) - Monsoon reversals (SW monsoon vs NE monsoon)
    monsoon_u = 7.0 * np.sin(2 * np.pi * (doy - 100) / 365.25)
    monsoon_v = 5.0 * np.sin(2 * np.pi * (doy - 100) / 365.25)
    uwind = monsoon_u + 1.2 * np.cos(lat_grid / 6.0)
    vwind = monsoon_v + 0.8 * np.sin(lon_grid / 6.0)
    uwind[~ocean_mask] = np.nan
    vwind[~ocean_mask] = np.nan

    return {
        "sst": sst.astype(np.float32),
        "sss": sss.astype(np.float32),
        "sla": sla.astype(np.float32),
        "ucur": ucur.astype(np.float32),
        "vcur": vcur.astype(np.float32),
        "uwind": uwind.astype(np.float32),
        "vwind": vwind.astype(np.float32),
    }


def generate_fixture_target_3d_temp(
    date_str: str,
    surface_sst: np.ndarray,
    ocean_mask: np.ndarray,
    bathymetry: np.ndarray,
) -> np.ndarray:
    """Generate 3D temperature field [15, 101, 241] with realistic vertical structure.

    Vertical model (from surface downward):
      - 0 m  : SST (skin, top-of-mixed-layer)
      - 5 m  : SST - skin_delta   (≈ 0.6 °C diurnal skin cooling removed)
      - 10 m : SST - skin_delta - ml_rate * 5   (mixed layer lapse ≈ 0.08 °C/m)
      - 20 m : SST - skin_delta - ml_rate * 15  (still mixed layer but warming from below)
      - ≥30 m: thermocline exponential decay to deep-ocean temperature (~4.2 °C)

    The gradient across 0–20 m is intentionally ≥ 0.5 °C so that per-depth metrics
    differ at every level (avoids the "identical RMSE to 4 d.p." artefact).

    NOTE: This fixture stores data **already at the 15 SIH depth levels**, not at
    native GLORYS levels.  The PCHIP vertical interpolation in `builder.py` is
    therefore a no-op (source == target depths), which is correct and expected for
    fixtures.  In the production pipeline the source depths are GLORYS native levels
    (75 levels) and interpolation is non-trivial.

    Returns:
        float32 array [15, 101, 241] with NaN on land and below seafloor.
    """
    dt = datetime.strptime(date_str, "%Y-%m-%d")
    doy = dt.timetuple().tm_yday

    lat_grid, lon_grid = get_spatial_grid()
    temp_3d = np.zeros((NUM_DEPTHS, LAT_COUNT, LON_COUNT), dtype=np.float32)

    # Deep-ocean baseline (abyssal temperature)
    t_deep = 4.2

    # Thermocline centre depth: 80–120 m, varies with longitude (eddy-like)
    z0 = 100.0 + 20.0 * np.sin(lon_grid / 10.0)

    # Seasonal modulation of mixed-layer depth: deeper in winter (NE monsoon)
    season_ml = np.cos(2 * np.pi * (doy - 135) / 365.25)  # +1 in May, -1 in Nov

    # Diurnal skin cooling below the surface skin layer (~0.4–0.8 °C)
    # This is the difference between the "bulk SST at 5m" and the skin measurement at 0m
    skin_delta = 0.55 + 0.15 * season_ml  # [101, 241] ~0.4–0.7 °C

    # Mixed-layer lapse rate (°C / m): ~0.07–0.10 °C per metre in top 30 m
    ml_rate = 0.075 + 0.02 * np.sin(lat_grid / 8.0)  # [101, 241]

    for i, z in enumerate(DEPTH_LEVELS):
        if z == 0.0:
            # Skin / surface measurement
            temp_z = surface_sst.copy()

        elif z <= 5.0:
            # Below the skin: remove diurnal warming, slightly cooler
            temp_z = surface_sst - skin_delta

        elif z <= 20.0:
            # Mixed layer with a modest but real lapse rate
            # z goes 10 → 20 m; offset from 5 m level
            temp_z = (surface_sst - skin_delta) - ml_rate * (z - 5.0)

        elif z <= 50.0:
            # Transition zone: faster cooling approaching thermocline
            # lapse rate accelerates to ~0.3 °C/m
            base = (surface_sst - skin_delta) - ml_rate * 15.0  # value at 20 m
            accel = 0.25 + 0.05 * np.abs(np.sin(lon_grid / 8.0))
            temp_z = base - accel * (z - 20.0)

        else:
            # Below thermocline: PCHIP-like exponential decay
            decay = 1.0 / (1.0 + (z / z0) ** 1.8)
            temp_z = t_deep + (surface_sst - t_deep) * decay

        # Clamp to physically plausible range [1.5, 33] °C
        temp_z = np.clip(temp_z, 1.5, 33.0).astype(np.float32)

        # Mask seafloor and land cells
        seafloor_mask = bathymetry < z
        temp_z[seafloor_mask] = np.nan
        temp_z[~ocean_mask] = np.nan
        temp_3d[i] = temp_z

    return temp_3d


def generate_fixture_argo_profiles(
    dates: List[str],
    target_temps: Dict[str, np.ndarray],
    ocean_mask: np.ndarray,
    num_floats: int = 15,
) -> pd.DataFrame:
    """Generate synthetic in-situ Argo float profiles with realistic QC flags and coordinates."""
    lats = get_lat_coords()
    lons = get_lon_coords()
    lat_grid, lon_grid = get_spatial_grid()

    # Find valid ocean indices
    valid_lat_idx, valid_lon_idx = np.where(ocean_mask)
    np.random.seed(42)
    selected_indices = np.random.choice(len(valid_lat_idx), size=num_floats, replace=False)

    rows = []
    for float_id, idx in enumerate(selected_indices, start=1001):
        plat_lat = float(lats[valid_lat_idx[idx]])
        plat_lon = float(lons[valid_lon_idx[idx]])
        wmo_id = f"290{float_id}"

        for cycle, d_str in enumerate(dates, start=1):
            if d_str not in target_temps:
                continue
            cube = target_temps[d_str]  # [15, 101, 241]

            # Float drifts slightly
            curr_lat = plat_lat + 0.02 * cycle + np.random.normal(0, 0.01)
            curr_lon = plat_lon + 0.02 * cycle + np.random.normal(0, 0.01)

            # Sample profile at this point
            for d_idx, z in enumerate(DEPTH_LEVELS):
                base_temp = cube[d_idx, valid_lat_idx[idx], valid_lon_idx[idx]]
                if np.isnan(base_temp):
                    continue
                # Add tiny sensor noise (~0.05°C)
                meas_temp = float(base_temp + np.random.normal(0, 0.03))
                # Salinity proxy
                meas_sal = float(34.8 - 0.002 * z + np.random.normal(0, 0.02))

                rows.append({
                    "platform_id": wmo_id,
                    "cycle_number": cycle,
                    "timestamp": f"{d_str}T12:00:00Z",
                    "latitude": round(curr_lat, 4),
                    "longitude": round(curr_lon, 4),
                    "depth": float(z),
                    "temperature": round(meas_temp, 3),
                    "salinity": round(meas_sal, 3),
                    "temp_qc": 1,  # Good quality flag
                    "sal_qc": 1,
                    "data_mode": "D",  # Delayed mode
                })

    return pd.DataFrame(rows)


def generate_full_test_fixtures(
    output_raw_dir: Path = Path("data/raw"),
    output_argo_dir: Path = Path("data/argo"),
    manifest_path: Path = Path("data/manifest.json"),
    dates: Optional[List[str]] = None,
) -> Dict[str, Path]:
    """Generate complete offline fixture bundle for development and testing."""
    output_raw_dir = Path(output_raw_dir)
    output_argo_dir = Path(output_argo_dir)
    output_raw_dir.mkdir(parents=True, exist_ok=True)
    output_argo_dir.mkdir(parents=True, exist_ok=True)

    if dates is None:
        dates = [
            "2023-01-15",
            "2023-04-15",
            "2023-07-15",
            "2023-10-15",
            "2024-02-15",
            "2024-05-15",
            "2024-08-15",
            "2024-11-15",
        ]

    lats = get_lat_coords()
    lons = get_lon_coords()
    ocean_mask = create_realistic_land_mask(lats, lons)
    bathymetry = create_realistic_bathymetry(ocean_mask)

    manifest = ManifestManager(manifest_path)
    created_files = {}

    # 1. Save Bathymetry NetCDF
    bathy_ds = xr.Dataset(
        data_vars={
            "elevation": (["lat", "lon"], -bathymetry),
            "depth": (["lat", "lon"], bathymetry),
            "ocean_mask": (["lat", "lon"], ocean_mask.astype(np.int8)),
        },
        coords={"lat": lats, "lon": lons},
        attrs={"title": "GEBCO Bathymetry and Ocean Mask Fixture"},
    )
    bathy_path = output_raw_dir / "gebco_bathymetry_fixture.nc"
    bathy_ds.to_netcdf(bathy_path)
    manifest.add_file(
        bathy_path,
        dataset_id="gebco_fixture",
        variable="bathymetry",
        source_tier="fixture",
        start_date="static",
        end_date="static",
        source_url="local://fixtures/gebco",
    )
    created_files["bathymetry"] = bathy_path

    # 2. Generate daily Surface & GLORYS/ARMOR3D Target files
    target_cubes = {}
    for d_str in dates:
        surf = generate_fixture_surface_slice(d_str, ocean_mask)
        target_3d = generate_fixture_target_3d_temp(d_str, surf["sst"], ocean_mask, bathymetry)
        target_cubes[d_str] = target_3d

        # Surface NetCDF
        surf_ds = xr.Dataset(
            data_vars={var: (["lat", "lon"], surf[var]) for var in SURFACE_CHANNELS},
            coords={"lat": lats, "lon": lons, "time": [pd.to_datetime(d_str)]},
        )
        surf_file = output_raw_dir / f"surface_obs_{d_str}.nc"
        surf_ds.to_netcdf(surf_file)
        manifest.add_file(
            surf_file,
            dataset_id="surface_obs_fixture",
            variable="surface_inputs",
            source_tier="fixture",
            start_date=d_str,
            end_date=d_str,
        )

        # GLORYS 3D Target NetCDF
        target_ds = xr.Dataset(
            data_vars={"thetao": (["depth", "lat", "lon"], target_3d)},
            coords={"depth": DEPTH_LEVELS, "lat": lats, "lon": lons, "time": [pd.to_datetime(d_str)]},
        )
        target_file = output_raw_dir / f"glorys_target_{d_str}.nc"
        target_ds.to_netcdf(target_file)
        manifest.add_file(
            target_file,
            dataset_id="glorys_reanalysis_fixture",
            variable="subsurface_temp",
            source_tier="fixture",
            start_date=d_str,
            end_date=d_str,
        )

        # ARMOR3D Benchmark NetCDF (slightly offset for realistic benchmark comparison)
        armor_3d = target_3d + np.random.normal(0, 0.2, size=target_3d.shape).astype(np.float32)
        armor_3d[np.isnan(target_3d)] = np.nan
        armor_ds = xr.Dataset(
            data_vars={"to": (["depth", "lat", "lon"], armor_3d)},
            coords={"depth": DEPTH_LEVELS, "lat": lats, "lon": lons, "time": [pd.to_datetime(d_str)]},
        )
        armor_file = output_raw_dir / f"armor3d_benchmark_{d_str}.nc"
        armor_ds.to_netcdf(armor_file)
        manifest.add_file(
            armor_file,
            dataset_id="armor3d_benchmark_fixture",
            variable="armor3d_temp",
            source_tier="fixture",
            start_date=d_str,
            end_date=d_str,
        )

    # 3. Generate Argo In-situ Profiles Parquet
    argo_df = generate_fixture_argo_profiles(dates, target_cubes, ocean_mask)
    argo_parquet = output_argo_dir / "argo_profiles.parquet"
    argo_df.to_parquet(argo_parquet, index=False)
    manifest.add_file(
        argo_parquet,
        dataset_id="argo_profiles_fixture",
        variable="argo_profiles",
        source_tier="fixture",
        start_date=dates[0],
        end_date=dates[-1],
    )
    created_files["argo"] = argo_parquet

    manifest.save()
    return created_files
