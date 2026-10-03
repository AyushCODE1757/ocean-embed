"""CLI interface for OceanEmbed evaluation and scoring."""

import argparse
from pathlib import Path

import numpy as np
import xarray as xr
from oceanembed_harmonize.climatology import ClimatologyEngine

from oceanembed_evaluation.baselines import BaselineB0Climatology
from oceanembed_evaluation.export import export_metrics_report


def main():
    parser = argparse.ArgumentParser(description="OceanEmbed Model & Baseline Evaluation Suite")
    parser.add_argument("--cubes-dir", default="data/cubes", help="Path to Zarr cubes")
    parser.add_argument(
        "--output-json", default="data/metrics/metrics.json", help="Path to export metrics.json"
    )

    args = parser.parse_args()

    cubes_path = Path(args.cubes_dir)
    if not (cubes_path / "cube_targets.zarr").exists():
        print(f"Error: Cube targets not found in {cubes_path}")
        return

    targets_ds = xr.open_zarr(cubes_path / "cube_targets.zarr")
    masks_ds = xr.open_zarr(cubes_path / "masks.zarr")
    clim_ds = xr.open_zarr(cubes_path / "climatology.zarr")

    target_temps = targets_ds["temp"].values
    ocean_mask = masks_ds["valid_ocean_mask"].values
    depth_mask = masks_ds["valid_depth_mask"].values
    dates = [str(d)[:10] for d in targets_ds["time"].values]

    clim_engine = ClimatologyEngine(clim_ds)
    b0 = BaselineB0Climatology(clim_engine)

    clim_cubes = np.stack([b0.predict(d) for d in dates], axis=0)

    # Score Climatology baseline against targets
    rep = export_metrics_report(
        pred_cubes=clim_cubes,
        target_cubes=target_temps,
        clim_cubes=clim_cubes,
        dates=dates,
        model_name="Baseline-B0-Climatology",
        run_id="eval-baseline-b0",
        ocean_mask_2d=ocean_mask,
        depth_mask_3d=depth_mask,
        output_json_path=Path(args.output_json),
    )
    print(f"Evaluated baseline B0 and exported metrics to {args.output_json}")
    print(f"Overall RMSE: {rep['overall']['rmse']:.3f}°C, MAE: {rep['overall']['mae']:.3f}°C")


if __name__ == "__main__":
    main()
