"""Unit tests for OceanEmbed Ingest and Manifest Module."""

from pathlib import Path

from oceanembed_contracts import LAT_COUNT, LON_COUNT, get_lat_coords, get_lon_coords
from oceanembed_ingest.fixtures import (
    create_realistic_bathymetry,
    create_realistic_land_mask,
    generate_full_test_fixtures,
)
from oceanembed_ingest.manifest import ManifestManager


def test_realistic_mask_and_bathymetry():
    lats = get_lat_coords()
    lons = get_lon_coords()
    ocean_mask = create_realistic_land_mask(lats, lons)
    assert ocean_mask.shape == (LAT_COUNT, LON_COUNT)
    # India interior should be False (Land)
    lat_idx = int((20.0 - 5.0) / 0.25)
    lon_idx = int((78.0 - 45.0) / 0.25)
    assert not ocean_mask[lat_idx, lon_idx]

    bathy = create_realistic_bathymetry(ocean_mask)
    assert bathy.shape == (LAT_COUNT, LON_COUNT)
    assert float(bathy[ocean_mask].min()) >= 50.0


def test_fixture_generation(tmp_path):
    raw_dir = tmp_path / "raw"
    argo_dir = tmp_path / "argo"
    manifest_path = tmp_path / "manifest.json"

    test_dates = ["2023-05-15", "2023-08-15"]
    _files = generate_full_test_fixtures(
        output_raw_dir=raw_dir,
        output_argo_dir=argo_dir,
        manifest_path=manifest_path,
        dates=test_dates,
    )

    assert manifest_path.exists()
    mgr = ManifestManager(manifest_path)
    assert len(mgr.entries) > 0
    # Check that all recorded files exist on disk
    for entry in mgr.entries:
        p = Path(entry["relative_path"])
        assert p.exists()
        assert entry["source_tier"] == "fixture"
