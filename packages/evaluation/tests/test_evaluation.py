"""Unit tests for OceanEmbed Evaluation Suite."""
from pathlib import Path
import json
import numpy as np
import pytest

from oceanembed_contracts import DEPTH_LEVELS, LAT_COUNT, LON_COUNT, NUM_DEPTHS
from oceanembed_evaluation.argo_val import ArgoInSituValidator
from oceanembed_evaluation.baselines import BaselineB0Climatology, BaselineB1EOFRegression
from oceanembed_evaluation.breakdowns import compute_basin_breakdown, compute_depth_breakdown, compute_season_breakdown
from oceanembed_evaluation.export import export_metrics_report
from oceanembed_evaluation.metrics import (
    compute_acc,
    compute_all_pointwise_metrics,
    compute_bias,
    compute_isotherm_depth_2d,
    compute_mae,
    compute_ohc_300m_2d,
    compute_pearson_r,
    compute_rmse,
    compute_skill_score_clim,
)
from oceanembed_evaluation.uncertainty import (
    compute_gaussian_crps,
    compute_prediction_interval_coverage,
    compute_uncertainty_error_rank_correlation,
)
from oceanembed_harmonize.climatology import ClimatologyEngine
from oceanembed_ingest.fixtures import generate_full_test_fixtures


def test_core_metrics():
    pred = np.array([25.0, 26.0, 27.0, 28.0])
    target = np.array([24.0, 26.0, 28.0, 30.0])
    clim = np.array([24.5, 25.5, 26.5, 27.5])

    rmse = compute_rmse(pred, target)
    mae = compute_mae(pred, target)
    bias = compute_bias(pred, target)
    r = compute_pearson_r(pred, target)

    assert np.isclose(rmse, np.sqrt(6.0 / 4.0))  # errors: +1, 0, -1, -2 -> sq: 1,0,1,4 -> mean 1.5 -> sqrt(1.5)
    assert np.isclose(mae, 1.0)                  # errors: 1, 0, 1, 2 -> mean 1.0
    assert np.isclose(bias, -0.5)                # mean of (+1 + 0 - 1 - 2)/4 = -0.5
    assert np.isclose(r, 1.0)                    # perfect linear correlation


def test_isotherm_and_ohc():
    temp_3d = np.zeros((NUM_DEPTHS, 10, 10), dtype=np.float32)
    # Profile: linearly decrease from 30°C at 0m to 10°C at 200m
    for idx, z in enumerate(DEPTH_LEVELS):
        temp_3d[idx] = max(10.0, 30.0 - 0.1 * z)

    # D20 should occur where 30 - 0.1 * z = 20 -> z = 100m
    d20 = compute_isotherm_depth_2d(temp_3d)
    assert np.allclose(d20, 100.0, atol=1e-1)

    # D26 should occur where 30 - 0.1 * z = 26 -> z = 40m
    d26 = compute_isotherm_depth_2d(temp_3d, iso_temp=26.0)
    assert np.allclose(d26, 40.0, atol=1e-1)

    # OHC 0-300m
    ohc = compute_ohc_300m_2d(temp_3d)
    assert ohc.shape == (10, 10)
    assert not np.isnan(ohc).any()
    assert np.all(ohc > 0)


def test_uncertainty_metrics():
    y_true = np.array([20.0, 22.0, 24.0, 26.0, 28.0])
    mu = np.array([20.1, 21.9, 24.2, 25.8, 28.1])
    sigma = np.array([0.5, 0.5, 0.5, 0.5, 0.5])

    crps = compute_gaussian_crps(y_true, mu, sigma)
    assert crps > 0 and crps < 1.0

    picp = compute_prediction_interval_coverage(y_true, mu, sigma, nominal_confidence=0.90)
    assert picp["empirical_coverage"] == 1.0


def test_baseline_b1_eof():
    # 5 time steps, 7 surface channels, 15 depths, 10x10 space
    n_t, n_lat, n_lon = 5, 10, 10
    surf = np.random.normal(25.0, 2.0, (n_t, 7, n_lat, n_lon)).astype(np.float32)
    tgt = np.random.normal(20.0, 4.0, (n_t, 15, n_lat, n_lon)).astype(np.float32)
    ocean_mask = np.ones((n_lat, n_lon), dtype=bool)

    b1 = BaselineB1EOFRegression(n_eofs=3)
    b1.fit(surf, tgt, ocean_mask)

    pred = b1.predict_cube(surf[0], ocean_mask)
    assert pred.shape == (15, n_lat, n_lon)
    assert not np.isnan(pred).any()


def test_full_export_metrics_report(tmp_path):
    dates = ["2024-02-15", "2024-05-15"]
    pred_cubes = np.random.normal(24.0, 3.0, (2, 15, LAT_COUNT, LON_COUNT)).astype(np.float32)
    target_cubes = pred_cubes + np.random.normal(0, 0.5, (2, 15, LAT_COUNT, LON_COUNT)).astype(np.float32)
    clim_cubes = np.full_like(target_cubes, 24.0)

    ocean_mask = np.ones((LAT_COUNT, LON_COUNT), dtype=bool)
    json_path = tmp_path / "metrics.json"

    rep = export_metrics_report(
        pred_cubes=pred_cubes,
        target_cubes=target_cubes,
        clim_cubes=clim_cubes,
        dates=dates,
        model_name="Test-Model",
        run_id="run-test",
        ocean_mask_2d=ocean_mask,
        output_json_path=json_path,
    )

    assert json_path.exists()
    assert rep["model_name"] == "Test-Model"
    assert "per_depth" in rep
    assert len(rep["per_depth"]) == 15
    assert "arabian_sea" in rep["per_basin"]
    assert "pre_monsoon_mam" in rep["per_season"]
    assert "independence_caveat" in rep
