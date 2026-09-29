"""OceanEmbed Evaluation Package."""
from oceanembed_evaluation.metrics import (
    MetricSummary,
    compute_rmse,
    compute_mae,
    compute_bias,
    compute_pearson_r,
    compute_acc,
    compute_skill_score_clim,
    compute_all_pointwise_metrics,
    compute_isotherm_depth_2d,
    compute_ohc_300m_2d,
)
from oceanembed_evaluation.breakdowns import (
    compute_depth_breakdown,
    compute_basin_breakdown,
    compute_season_breakdown,
    get_basin_mask,
)
from oceanembed_evaluation.baselines import (
    BaselineB0Climatology,
    BaselineB1EOFRegression,
    BaselineB4ARMOR3D,
)
from oceanembed_evaluation.argo_val import (
    ArgoInSituValidator,
    ArgoCollocationMatch,
    ARGO_INDEPENDENCE_CAVEAT,
)
from oceanembed_evaluation.uncertainty import (
    compute_gaussian_crps,
    compute_prediction_interval_coverage,
    compute_uncertainty_error_rank_correlation,
)
from oceanembed_evaluation.export import export_metrics_report

__all__ = [
    "MetricSummary",
    "compute_rmse",
    "compute_mae",
    "compute_bias",
    "compute_pearson_r",
    "compute_acc",
    "compute_skill_score_clim",
    "compute_all_pointwise_metrics",
    "compute_isotherm_depth_2d",
    "compute_ohc_300m_2d",
    "compute_depth_breakdown",
    "compute_basin_breakdown",
    "compute_season_breakdown",
    "get_basin_mask",
    "BaselineB0Climatology",
    "BaselineB1EOFRegression",
    "BaselineB4ARMOR3D",
    "ArgoInSituValidator",
    "ArgoCollocationMatch",
    "ARGO_INDEPENDENCE_CAVEAT",
    "compute_gaussian_crps",
    "compute_prediction_interval_coverage",
    "compute_uncertainty_error_rank_correlation",
    "export_metrics_report",
]
