"""Metrics Exporter and JSON Report Generator for OceanEmbed."""

import json
from pathlib import Path
from typing import Any

import numpy as np
from oceanembed_contracts import METRICS_JSON
from oceanembed_contracts.schemas import MetricsReport

from oceanembed_evaluation.argo_val import ARGO_INDEPENDENCE_CAVEAT
from oceanembed_evaluation.breakdowns import (
    compute_basin_breakdown,
    compute_depth_breakdown,
    compute_season_breakdown,
)
from oceanembed_evaluation.metrics import (
    compute_all_pointwise_metrics,
    compute_isotherm_depth_2d,
    compute_ohc_300m_2d,
    compute_rmse,
)


def export_metrics_report(
    pred_cubes: np.ndarray,  # [N, 15, 101, 241]
    target_cubes: np.ndarray,  # [N, 15, 101, 241]
    clim_cubes: np.ndarray,  # [N, 15, 101, 241]
    dates: list[str],
    model_name: str = "OceanEmbed-E1-ConvNeXt",
    run_id: str = "run-001",
    ocean_mask_2d: np.ndarray | None = None,
    depth_mask_3d: np.ndarray | None = None,
    baselines_dict: dict[str, dict[str, float]] | None = None,
    argo_validation_dict: dict[str, Any] | None = None,
    output_json_path: Path = METRICS_JSON,
) -> dict[str, Any]:
    """Calculate all metrics and export standardized metrics.json artifact."""
    output_json_path = Path(output_json_path)
    output_json_path.parent.mkdir(parents=True, exist_ok=True)

    # 1. Overall Pointwise Metrics
    mask_4d = (
        np.broadcast_to(ocean_mask_2d, pred_cubes.shape) if ocean_mask_2d is not None else None
    )
    overall_summary = compute_all_pointwise_metrics(
        pred_cubes, target_cubes, clim_cubes, mask=mask_4d
    )

    # Physical oceanography diagnostic errors: D20, D26, OHC
    d20_rmses, d26_rmses, ohc_rmses = [], [], []
    for i in range(len(pred_cubes)):
        pred_3d = pred_cubes[i]
        tgt_3d = target_cubes[i]

        d20_pred = compute_isotherm_depth_2d(pred_3d, iso_temp=20.0)
        d20_tgt = compute_isotherm_depth_2d(tgt_3d, iso_temp=20.0)
        d20_rmses.append(compute_rmse(d20_pred, d20_tgt, mask=ocean_mask_2d))

        d26_pred = compute_isotherm_depth_2d(pred_3d, iso_temp=26.0)
        d26_tgt = compute_isotherm_depth_2d(tgt_3d, iso_temp=26.0)
        d26_rmses.append(compute_rmse(d26_pred, d26_tgt, mask=ocean_mask_2d))

        ohc_pred = compute_ohc_300m_2d(pred_3d)
        ohc_tgt = compute_ohc_300m_2d(tgt_3d)
        ohc_rmses.append(compute_rmse(ohc_pred, ohc_tgt, mask=ocean_mask_2d))

    overall_dict = overall_summary.__dict__.copy()
    overall_dict["d20_rmse"] = round(float(np.nanmean(d20_rmses)), 3)
    overall_dict["d26_rmse"] = round(float(np.nanmean(d26_rmses)), 3)
    overall_dict["ohc_rmse"] = round(float(np.nanmean(ohc_rmses)), 3)

    # 2. Breakdowns
    per_depth = compute_depth_breakdown(pred_cubes, target_cubes, clim_cubes, depth_mask_3d)
    per_basin = compute_basin_breakdown(pred_cubes, target_cubes, clim_cubes, ocean_mask_2d)
    per_season = compute_season_breakdown(
        pred_cubes, target_cubes, clim_cubes, dates, ocean_mask_2d
    )

    test_period = f"{dates[0]} to {dates[-1]}" if dates else "Test Period"

    report_payload = {
        "run_id": run_id,
        "model_name": model_name,
        "test_period": test_period,
        "overall": overall_dict,
        "per_depth": per_depth,
        "per_basin": per_basin,
        "per_season": per_season,
        "baselines": baselines_dict or {},
        "argo_validation": argo_validation_dict or {},
        "independence_caveat": ARGO_INDEPENDENCE_CAVEAT,
    }

    # Validate against Pydantic schema
    validated_model = MetricsReport(**report_payload)

    with open(output_json_path, "w", encoding="utf-8") as f:
        json.dump(validated_model.model_dump(), f, indent=2)

    return validated_model.model_dump()
