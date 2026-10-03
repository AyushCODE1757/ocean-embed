"""Unit and integration tests for OceanEmbed Harmonization."""

import numpy as np
import xarray as xr
from oceanembed_contracts import LAT_COUNT, LON_COUNT, NUM_DEPTHS
from oceanembed_harmonize.builder import HarmonizePipelineBuilder
from oceanembed_harmonize.climatology import ClimatologyEngine
from oceanembed_harmonize.regrid import regrid_2d_field
from oceanembed_harmonize.temporal import aggregate_subdaily_to_daily_wind
from oceanembed_harmonize.vertical import interpolate_profile_pchip
from oceanembed_ingest.fixtures import generate_full_test_fixtures


def test_regrid_2d():
    # Create coarse 1 degree grid: lat 5..30 (26 pts), lon 45..105 (61 pts)
    src_lats = np.linspace(5.0, 30.0, 26)
    src_lons = np.linspace(45.0, 105.0, 61)
    lat_g, lon_g = np.meshgrid(src_lats, src_lons, indexing="ij")
    src_data = 20.0 + 0.1 * lat_g + 0.05 * lon_g

    regridded = regrid_2d_field(src_lats, src_lons, src_data)
    assert regridded.shape == (LAT_COUNT, LON_COUNT)
    assert not np.isnan(regridded).any()
    assert np.isclose(regridded[0, 0], 20.0 + 0.1 * 5.0 + 0.05 * 45.0, atol=1e-2)


def test_vertical_pchip_interpolation():
    # Source depths: 0.5, 10, 25, 60, 120, 250, 600, 1100 m
    src_z = np.array([0.5, 10.0, 25.0, 60.0, 120.0, 250.0, 600.0, 1100.0])
    # Monotonically decreasing temperature profile
    src_t = np.array([29.0, 28.5, 27.0, 22.0, 16.0, 12.0, 8.0, 4.0])

    interp_t = interpolate_profile_pchip(src_z, src_t)
    assert len(interp_t) == 15
    # Flat extrapolation to 0m should equal shallowest measurement 29.0
    assert np.isclose(interp_t[0], 29.0, atol=1e-2)
    # Monotonicity check
    assert np.all(np.diff(interp_t) <= 0)


def test_temporal_wind_aggregation():
    # 4 sub-daily steps
    u = np.full((4, 10, 10), 3.0, dtype=np.float32)
    v = np.full((4, 10, 10), 4.0, dtype=np.float32)
    u_mean, v_mean, spd_mean = aggregate_subdaily_to_daily_wind(u, v)
    assert u_mean.shape == (10, 10)
    assert np.allclose(u_mean, 3.0)
    assert np.allclose(v_mean, 4.0)
    assert np.allclose(spd_mean, 5.0)  # sqrt(3^2 + 4^2) = 5.0


def test_climatology_and_anomaly():
    # Fake targets for two training dates
    t1 = np.full((NUM_DEPTHS, LAT_COUNT, LON_COUNT), 25.0, dtype=np.float32)
    t2 = np.full((NUM_DEPTHS, LAT_COUNT, LON_COUNT), 27.0, dtype=np.float32)
    cubes = {"2018-05-15": t1, "2019-05-15": t2}

    clim = ClimatologyEngine.compute_from_cubes(
        cubes, train_start="2015-01-01", train_end="2022-12-31"
    )
    mean_doy, _ = clim.get_climatology_for_date("2023-05-15")
    assert np.allclose(mean_doy, 26.0)

    # Anomaly of 28.0 should be +2.0
    anom = clim.compute_target_anomaly(np.full_like(t1, 28.0), "2023-05-15")
    assert np.allclose(anom, 2.0)


def test_full_pipeline_builder_with_fixtures(tmp_path):
    raw_dir = tmp_path / "raw"
    argo_dir = tmp_path / "argo"
    cubes_dir = tmp_path / "cubes"
    manifest_path = tmp_path / "manifest.json"

    dates = ["2023-01-15", "2023-04-15"]
    generate_full_test_fixtures(
        output_raw_dir=raw_dir,
        output_argo_dir=argo_dir,
        manifest_path=manifest_path,
        dates=dates,
    )

    builder = HarmonizePipelineBuilder(raw_dir=raw_dir, output_cubes_dir=cubes_dir)
    _results = builder.build_all(dates=dates)

    assert (cubes_dir / "cube_inputs.zarr").exists()
    assert (cubes_dir / "cube_targets.zarr").exists()
    assert (cubes_dir / "masks.zarr").exists()
    assert (cubes_dir / "climatology.zarr").exists()

    ds_inputs = xr.open_zarr(cubes_dir / "cube_inputs.zarr")
    assert ds_inputs["surface"].shape == (2, 7, 101, 241)
    assert ds_inputs["context"].shape == (2, 4, 101, 241)

    ds_targets = xr.open_zarr(cubes_dir / "cube_targets.zarr")
    assert ds_targets["temp"].shape == (2, 15, 101, 241)
