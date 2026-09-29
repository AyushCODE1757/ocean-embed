"""
verify_pipeline.py — Person A delivery verification script.

Addresses all 7 points from Person B's CR:
  1. Labels the 131-sample store as 'subsample' (step_days=30).
  2. Verifies daily timestamps in a real-data Zarr store.
  3. Checks the 372-cell mask mismatch and reports dropped cells.
  4. Prints a real GLORYS temperature profile at all 15 SIH depths.
  5. Confirms target provenance from GLORYS attrs.
  6. Lists all 6 ML-ready artifacts with sizes.
  7. Confirms B0 climatology is fitted only on 2015-2022 training data.

Run:
    python scripts/verify_pipeline.py --zarr-dir data/cubes
    python scripts/verify_pipeline.py --zarr-dir data/cubes_real   # after real-data pipeline
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np

_ROOT = Path(__file__).resolve().parent.parent
for _pkg in ["contracts/python", "packages/harmonize/src",
             "packages/data_ingest/src", "packages/evaluation/src"]:
    _p = str(_ROOT / _pkg)
    if _p not in sys.path:
        sys.path.insert(0, _p)

import xarray as xr
from oceanembed_contracts import DEPTH_LEVELS, LAT_COUNT, LON_COUNT, NUM_DEPTHS

SEP = "=" * 64


def section(title: str) -> None:
    print(f"\n{SEP}\n  {title}\n{SEP}")


# ── 1. Label subsample store ──────────────────────────────────────────────────
def check_subsample_store(zarr_dir: Path) -> None:
    section("1. Subsample store (step_days=30, ~131 samples)")
    targets_path = zarr_dir / "cube_targets.zarr"
    if not targets_path.exists():
        print("  ✗ cube_targets.zarr not found at", zarr_dir)
        return

    ds = xr.open_zarr(targets_path)
    n_times = len(ds.time)
    times = ds.time.values
    print(f"  ✓ cube_targets.zarr has {n_times} time steps")
    print(f"    First: {str(times[0])[:10]}   Last: {str(times[-1])[:10]}")

    # Compute median step
    if n_times > 1:
        deltas = np.diff(times.astype("datetime64[D]").astype(int))
        median_step = int(np.median(deltas))
        label = "subsample (step~30 days)" if median_step >= 14 else "daily"
        print(f"    Median time step: {median_step} days → labelled as [{label}]")
    ds.close()


# ── 2. Daily timestamp verification ──────────────────────────────────────────
def check_daily_timestamps(zarr_dir: Path) -> None:
    section("2. Daily timestamp integrity")
    targets_path = zarr_dir / "cube_targets.zarr"
    if not targets_path.exists():
        print("  ✗ cube_targets.zarr not found"); return

    ds = xr.open_zarr(targets_path)
    times = ds.time.values
    n = len(times)
    if n < 2:
        print(f"  ⚠ Only {n} time step(s) — cannot verify daily continuity")
        ds.close(); return

    deltas = np.diff(times.astype("datetime64[D]").astype(int))
    expected_step = int(deltas[0])
    gaps = np.where(deltas != expected_step)[0]

    if len(gaps) == 0:
        print(f"  ✓ All {n-1} time gaps = {expected_step} day(s) — no missing dates")
    else:
        print(f"  ✗ {len(gaps)} irregular gap(s) found at indices: {gaps[:5]}")
        for g in gaps[:3]:
            print(f"    {str(times[g])[:10]} → {str(times[g+1])[:10]} = {deltas[g]} days")

    ds.close()


# ── 3. Mask mismatch audit ────────────────────────────────────────────────────
def check_mask_mismatch(zarr_dir: Path) -> None:
    section("3. Mask vs data mismatch (372-cell audit)")
    masks_path   = zarr_dir / "masks.zarr"
    targets_path = zarr_dir / "cube_targets.zarr"
    inputs_path  = zarr_dir / "cube_inputs.zarr"

    if not masks_path.exists() or not targets_path.exists():
        print("  ✗ masks.zarr or cube_targets.zarr not found"); return

    masks  = xr.open_zarr(masks_path)
    tgts   = xr.open_zarr(targets_path)
    inputs = xr.open_zarr(inputs_path) if inputs_path.exists() else None

    valid_ocean = masks["valid_ocean_mask"].values.astype(bool)   # [lat, lon]
    target_arr  = tgts["temp"].values                              # [time, depth, lat, lon]

    # Cells inside valid_ocean that are NaN on every date at every depth
    any_valid_target = np.any(~np.isnan(target_arr), axis=(0, 1))  # [lat, lon]
    ghost_cells = valid_ocean & ~any_valid_target
    n_ghost = int(ghost_cells.sum())

    if n_ghost == 0:
        print(f"  ✓ No ghost cells — mask and data are consistent")
    else:
        print(f"  ⚠ {n_ghost} 'ghost' cells: inside valid_ocean but NaN on every date")
        print(f"    These are coastal regridding artefacts.")
        print(f"    tighten_mask_to_data() will remove them — re-run builder to fix.")

    if inputs is not None:
        surf_arr = inputs["surface"].values   # [time, channel, lat, lon]
        any_valid_surf = np.any(~np.isnan(surf_arr), axis=(0, 1))  # [lat, lon]
        ghost_surf = valid_ocean & ~any_valid_surf
        print(f"    Surface ghost cells: {int(ghost_surf.sum())}")

    masks.close(); tgts.close()
    if inputs: inputs.close()


# ── 4. Vertical profile verification ─────────────────────────────────────────
def check_vertical_profile(zarr_dir: Path, raw_glorys_nc: Path | None = None) -> None:
    section("4. GLORYS vertical temperature profile (0–1000 m)")

    if raw_glorys_nc and raw_glorys_nc.exists():
        # Read directly from a raw GLORYS NetCDF (has native 50 levels)
        ds = xr.open_dataset(raw_glorys_nc)
        depths = ds["depth"].values if "depth" in ds else ds["depth"].values
        # Pick a mid-ocean point: ~15°N, 65°E (Arabian Sea centre)
        lat_idx = int(np.argmin(np.abs(ds.latitude.values - 15.0)))
        lon_idx = int(np.argmin(np.abs(ds.longitude.values - 65.0)))
        time_idx = 0
        temp_native = ds["thetao"].values[time_idx, :, lat_idx, lon_idx]
        valid = ~np.isnan(temp_native)
        print(f"  Source: {raw_glorys_nc.name}  (native {len(depths)}-level GLORYS)")
        print(f"  Point : lat≈{ds.latitude.values[lat_idx]:.2f}°N, "
              f"lon≈{ds.longitude.values[lon_idx]:.2f}°E")
        print()
        print(f"  {'Depth (m)':>12}  {'Temp (°C)':>12}  {'Source':>10}")
        print(f"  {'-'*40}")
        for z, t in zip(depths[valid][:20], temp_native[valid][:20]):
            print(f"  {z:12.2f}  {t:12.4f}  {'GLORYS native'}")

        # Now interpolate to our 15 SIH targets
        from oceanembed_harmonize.vertical import interpolate_profile_pchip
        sih_temps = interpolate_profile_pchip(
            depths[valid].astype(np.float32),
            temp_native[valid].astype(np.float32),
            np.array(DEPTH_LEVELS, dtype=np.float32),
        )
        print()
        print(f"  After PCHIP → 15 SIH target depths:")
        print(f"  {'SIH Depth (m)':>14}  {'Interp T (°C)':>14}  {'Δ from prev':>12}")
        prev = None
        all_distinct = True
        for z, t in zip(DEPTH_LEVELS, sih_temps):
            delta = f"{t - prev:+.4f}" if prev is not None else "    —"
            if prev is not None and abs(t - prev) < 0.001:
                all_distinct = False
                delta += "  ← ⚠ NEARLY IDENTICAL"
            print(f"  {z:14.1f}  {t:14.4f}  {delta:>12}")
            prev = t
        print()
        print(f"  {'✓ All 15 levels numerically distinct' if all_distinct else '✗ Some levels identical — check interpolation'}")
        ds.close()

    else:
        # Fall back to reading from Zarr
        targets_path = zarr_dir / "cube_targets.zarr"
        if not targets_path.exists():
            print("  ✗ No GLORYS NetCDF or cube_targets.zarr found"); return

        ds = xr.open_zarr(targets_path)
        depths = np.array(DEPTH_LEVELS)
        # Pick ocean point [lat~15N, lon~65E]
        lat_vals = ds.lat.values
        lon_vals = ds.lon.values
        li = int(np.argmin(np.abs(lat_vals - 15.0)))
        lo = int(np.argmin(np.abs(lon_vals - 65.0)))
        temp_profile = ds["temp"].values[0, :, li, lo]

        print(f"  Source: cube_targets.zarr  (harmonized)")
        print(f"  Point : lat≈{lat_vals[li]:.2f}°N, lon≈{lon_vals[lo]:.2f}°E, t=0")
        print()
        print(f"  {'SIH Depth (m)':>14}  {'Temp (°C)':>12}  {'Δ from prev':>12}")
        print(f"  {'-'*44}")
        prev = None
        all_distinct = True
        for z, t in zip(depths, temp_profile):
            if np.isnan(t):
                print(f"  {z:14.1f}  {'NaN':>12}")
                continue
            delta = f"{t - prev:+.4f}" if prev is not None else "    —"
            if prev is not None and abs(t - prev) < 0.001:
                all_distinct = False
                delta += "  ← ⚠"
            print(f"  {z:14.1f}  {t:12.4f}  {delta:>12}")
            prev = t
        print()
        print(f"  {'✓ All levels distinct' if all_distinct else '✗ Some levels identical'}")
        ds.close()


# ── 5. Target provenance ──────────────────────────────────────────────────────
def check_target_provenance(zarr_dir: Path) -> None:
    section("5. Target provenance (must be real GLORYS, not synthetic)")
    targets_path = zarr_dir / "cube_targets.zarr"
    if not targets_path.exists():
        print("  ✗ cube_targets.zarr not found"); return

    ds = xr.open_zarr(targets_path)
    attrs = dict(ds.attrs)
    print(f"  Global attrs: {json.dumps(attrs, indent=4, default=str)}")

    temp_attrs = dict(ds["temp"].attrs) if "temp" in ds else {}
    print(f"  temp attrs  : {json.dumps(temp_attrs, indent=4, default=str)}")

    source = attrs.get("source", temp_attrs.get("source", "NOT SET"))
    source_tier = attrs.get("source_tier", temp_attrs.get("source_tier", "NOT SET"))
    dataset_id  = attrs.get("glorys_dataset_id", "NOT SET")

    if source_tier == "fixture":
        print("\n  ✗ PROVENANCE FAIL: source_tier='fixture' — this is SYNTHETIC data, not real GLORYS!")
    elif "glorys" in source.lower() or dataset_id != "NOT SET":
        print(f"\n  ✓ PROVENANCE OK: source='{source}', tier='{source_tier}'")
    else:
        print(f"\n  ⚠ PROVENANCE UNCLEAR: source='{source}', tier='{source_tier}'")
        print("    Re-run builder on real GLORYS data to set correct provenance attrs.")

    ds.close()


# ── 6. Artifact inventory ─────────────────────────────────────────────────────
def check_artifacts(zarr_dir: Path, argo_dir: Path, manifest_path: Path) -> None:
    section("6. ML-ready artifact inventory")

    artifacts = {
        "cube_inputs.zarr":  zarr_dir / "cube_inputs.zarr",
        "cube_targets.zarr": zarr_dir / "cube_targets.zarr",
        "masks.zarr":        zarr_dir / "masks.zarr",
        "climatology.zarr":  zarr_dir / "climatology.zarr",
        "manifest.json":     manifest_path,
        "argo_profiles.parquet": argo_dir / "argo_profiles.parquet",
    }

    all_ok = True
    for name, path in artifacts.items():
        if path.exists():
            size_mb = sum(f.stat().st_size for f in path.rglob("*") if f.is_file()) / 1e6 \
                      if path.is_dir() else path.stat().st_size / 1e6
            print(f"  ✓ {name:<30}  {size_mb:8.2f} MB   {path}")
        else:
            print(f"  ✗ {name:<30}  MISSING              {path}")
            all_ok = False

    print(f"\n  {'All artifacts present ✓' if all_ok else 'Some artifacts missing ✗'}")


# ── 7. Climatology train/val/test split ───────────────────────────────────────
def check_climatology_split(zarr_dir: Path) -> None:
    section("7. B0 Climatology — train/val/test split audit")
    clim_path = zarr_dir / "climatology.zarr"
    if not clim_path.exists():
        print("  ✗ climatology.zarr not found"); return

    ds = xr.open_zarr(clim_path)
    attrs = dict(ds.attrs)

    train_start = attrs.get("train_start", "NOT SET")
    train_end   = attrs.get("train_end",   "NOT SET")
    computed_from = attrs.get("computed_from", "NOT SET")

    print(f"  Train period : {train_start}  →  {train_end}")
    print(f"  Computed from: {computed_from}")

    if "2015" in str(train_start) and "2022" in str(train_end):
        print("\n  ✓ SPLIT OK: climatology fitted on 2015-2022 only")
        print("    Val (2023) and Test (2024-2025) are untouched by climatology computation.")
    elif train_start == "NOT SET":
        print("\n  ⚠ No train period attrs set — add them in ClimatologyEngine.save_zarr()")
    else:
        print(f"\n  ✗ SPLIT WRONG: expected train 2015-01-01 → 2022-12-31, got {train_start} → {train_end}")

    doy = ds["doy"].values if "doy" in ds else []
    print(f"\n  DOY levels : {len(doy)} (expected 366 for leap-year aware)")
    ds.close()


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="OceanEmbed pipeline verification (Person B CR response)")
    parser.add_argument("--zarr-dir",    default="data/cubes",   help="Path to Zarr stores")
    parser.add_argument("--argo-dir",    default="data/argo",    help="Path to Argo parquet")
    parser.add_argument("--manifest",    default="data/manifest.json")
    parser.add_argument("--glorys-nc",   default=None,           help="Path to a raw GLORYS NetCDF for profile check")
    args = parser.parse_args()

    zarr_dir  = Path(args.zarr_dir)
    argo_dir  = Path(args.argo_dir)
    manifest  = Path(args.manifest)
    glorys_nc = Path(args.glorys_nc) if args.glorys_nc else None

    check_subsample_store(zarr_dir)
    check_daily_timestamps(zarr_dir)
    check_mask_mismatch(zarr_dir)
    check_vertical_profile(zarr_dir, glorys_nc)
    check_target_provenance(zarr_dir)
    check_artifacts(zarr_dir, argo_dir, manifest)
    check_climatology_split(zarr_dir)

    print(f"\n{SEP}")
    print("  Verification complete. Address any ✗ items above.")
    print(SEP)


if __name__ == "__main__":
    main()
