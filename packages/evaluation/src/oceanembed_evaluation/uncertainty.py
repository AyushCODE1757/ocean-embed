"""Uncertainty Calibration and Probabilistic Evaluation Module for OceanEmbed.

Calculates:
- Continuous Ranked Probability Score (CRPS) for Gaussian predictions
- Prediction Interval Coverage Probability (PICP) and sharpness
- Rank correlation between predicted spread and actual absolute error
- Reliability calibration curves
"""

import numpy as np
from scipy.stats import norm, spearmanr


def compute_gaussian_crps(
    y_true: np.ndarray,
    mu_pred: np.ndarray,
    sigma_pred: np.ndarray,
    mask: np.ndarray | None = None,
) -> float:
    """Compute mean CRPS for heteroscedastic Gaussian predictions N(mu, sigma^2).

    CRPS(N(mu, sigma^2), y) = sigma * [ z * (2*Phi(z) - 1) + 2*phi(z) - 1/sqrt(pi) ]
    where z = (y - mu) / sigma.
    """
    valid = (
        (~np.isnan(y_true)) & (~np.isnan(mu_pred)) & (~np.isnan(sigma_pred)) & (sigma_pred > 1e-6)
    )
    if mask is not None:
        valid &= mask
    if not np.any(valid):
        return float("nan")

    y_v = y_true[valid]
    mu_v = mu_pred[valid]
    sig_v = sigma_pred[valid]

    z = (y_v - mu_v) / sig_v
    phi = norm.pdf(z)
    Phi = norm.cdf(z)

    crps_vals = sig_v * (z * (2.0 * Phi - 1.0) + 2.0 * phi - 1.0 / np.sqrt(np.pi))
    return float(np.mean(crps_vals))


def compute_prediction_interval_coverage(
    y_true: np.ndarray,
    mu_pred: np.ndarray,
    sigma_pred: np.ndarray,
    nominal_confidence: float = 0.90,
    mask: np.ndarray | None = None,
) -> dict[str, float]:
    """Calculate empirical Prediction Interval Coverage Probability (PICP)
    and mean interval width."""
    valid = (
        (~np.isnan(y_true)) & (~np.isnan(mu_pred)) & (~np.isnan(sigma_pred)) & (sigma_pred > 1e-6)
    )
    if mask is not None:
        valid &= mask
    if not np.any(valid):
        return {
            "nominal": nominal_confidence,
            "empirical_coverage": float("nan"),
            "mean_width": float("nan"),
        }

    alpha = 1.0 - nominal_confidence
    z_crit = norm.ppf(1.0 - alpha / 2.0)

    lower = mu_pred[valid] - z_crit * sigma_pred[valid]
    upper = mu_pred[valid] + z_crit * sigma_pred[valid]

    covered = (y_true[valid] >= lower) & (y_true[valid] <= upper)
    emp_cov = float(np.mean(covered))
    mean_width = float(np.mean(upper - lower))

    return {
        "nominal": nominal_confidence,
        "empirical_coverage": round(emp_cov, 4),
        "mean_width": round(mean_width, 4),
    }


def compute_uncertainty_error_rank_correlation(
    y_true: np.ndarray,
    mu_pred: np.ndarray,
    sigma_pred: np.ndarray,
    mask: np.ndarray | None = None,
) -> float:
    """Calculate Spearman rank correlation between predicted spread and actual absolute error.

    High positive rank correlation indicates the model 'knows what it doesn't know'.
    """
    valid = (~np.isnan(y_true)) & (~np.isnan(mu_pred)) & (~np.isnan(sigma_pred))
    if mask is not None:
        valid &= mask
    if np.sum(valid) < 10:
        return float("nan")

    actual_error = np.abs(y_true[valid] - mu_pred[valid])
    spread = sigma_pred[valid]

    corr, _ = spearmanr(spread, actual_error)
    return round(float(corr), 4)
