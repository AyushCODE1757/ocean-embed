"""Comprehensive Oceanographic Metric Suite for OceanEmbed.

Implements all core statistical and physical metrics:
- RMSE, MAE, Mean Bias
- Pearson Correlation (Raw and Anomaly)
- Anomaly Correlation Coefficient (ACC)
- Skill Score vs Climatology (SS_clim)
- Standard Deviation Ratio (Taylor Diagram metric)
- 20°C Isotherm Depth (D20) & 26°C Isotherm Depth (D26)
- Ocean Heat Content (OHC 0-300m)
"""

from dataclasses import dataclass

import numpy as np
from oceanembed_contracts import DEPTH_LEVELS


@dataclass
class MetricSummary:
    rmse: float
    mae: float
    bias: float
    pearson_r: float
    acc: float
    skill_score_clim: float
    std_ratio: float


def _align_mask(data_shape: tuple[int, ...], mask: np.ndarray | None) -> np.ndarray | None:
    if mask is None:
        return None
    if mask.shape != data_shape:
        try:
            return np.broadcast_to(mask, data_shape)
        except ValueError:
            return mask
    return mask


def compute_rmse(pred: np.ndarray, target: np.ndarray, mask: np.ndarray | None = None) -> float:
    """Compute Root Mean Squared Error over valid cells."""
    mask_aligned = _align_mask(pred.shape, mask)
    p, t = pred.ravel(), target.ravel()
    valid = (~np.isnan(p)) & (~np.isnan(t))
    if mask_aligned is not None:
        valid &= mask_aligned.ravel()
    if not np.any(valid):
        return float("nan")
    return float(np.sqrt(np.mean((p[valid] - t[valid]) ** 2)))


def compute_mae(pred: np.ndarray, target: np.ndarray, mask: np.ndarray | None = None) -> float:
    """Compute Mean Absolute Error over valid cells."""
    mask_aligned = _align_mask(pred.shape, mask)
    p, t = pred.ravel(), target.ravel()
    valid = (~np.isnan(p)) & (~np.isnan(t))
    if mask_aligned is not None:
        valid &= mask_aligned.ravel()
    if not np.any(valid):
        return float("nan")
    return float(np.mean(np.abs(p[valid] - t[valid])))


def compute_bias(pred: np.ndarray, target: np.ndarray, mask: np.ndarray | None = None) -> float:
    """Compute Mean Error (Bias: pred - target)."""
    mask_aligned = _align_mask(pred.shape, mask)
    p, t = pred.ravel(), target.ravel()
    valid = (~np.isnan(p)) & (~np.isnan(t))
    if mask_aligned is not None:
        valid &= mask_aligned.ravel()
    if not np.any(valid):
        return float("nan")
    return float(np.mean(p[valid] - t[valid]))


def compute_pearson_r(
    pred: np.ndarray, target: np.ndarray, mask: np.ndarray | None = None
) -> float:
    """Compute Pearson correlation coefficient."""
    mask_aligned = _align_mask(pred.shape, mask)
    p, t = pred.ravel(), target.ravel()
    valid = (~np.isnan(p)) & (~np.isnan(t))
    if mask_aligned is not None:
        valid &= mask_aligned.ravel()
    if np.sum(valid) < 2:
        return float("nan")

    p_v, t_v = p[valid], t[valid]
    std_p, std_t = np.std(p_v), np.std(t_v)
    if std_p < 1e-6 or std_t < 1e-6:
        return 0.0

    return float(np.corrcoef(p_v, t_v)[0, 1])


def compute_acc(
    pred_anom: np.ndarray, target_anom: np.ndarray, mask: np.ndarray | None = None
) -> float:
    """Compute Anomaly Correlation Coefficient (ACC)."""
    mask_aligned = _align_mask(pred_anom.shape, mask)
    p, t = pred_anom.ravel(), target_anom.ravel()
    valid = (~np.isnan(p)) & (~np.isnan(t))
    if mask_aligned is not None:
        valid &= mask_aligned.ravel()
    if np.sum(valid) < 2:
        return float("nan")

    p_v, t_v = p[valid], t[valid]
    dot = np.sum(p_v * t_v)
    norm = np.sqrt(np.sum(p_v**2) * np.sum(t_v**2))
    if norm < 1e-8:
        return 0.0
    return float(dot / norm)


def compute_skill_score_clim(
    pred: np.ndarray, target: np.ndarray, clim: np.ndarray, mask: np.ndarray | None = None
) -> float:
    """Compute Skill Score vs Climatology: SS = 1 - (MSE_pred / MSE_clim)."""
    mask_aligned = _align_mask(pred.shape, mask)
    p, t, c = pred.ravel(), target.ravel(), clim.ravel()
    valid = (~np.isnan(p)) & (~np.isnan(t)) & (~np.isnan(c))
    if mask_aligned is not None:
        valid &= mask_aligned.ravel()
    if not np.any(valid):
        return float("nan")

    mse_pred = np.mean((p[valid] - t[valid]) ** 2)
    mse_clim = np.mean((c[valid] - t[valid]) ** 2)
    if mse_clim < 1e-8:
        return 1.0 if mse_pred < 1e-8 else -float("inf")

    return float(1.0 - (mse_pred / mse_clim))


def compute_all_pointwise_metrics(
    pred: np.ndarray,
    target: np.ndarray,
    clim: np.ndarray,
    mask: np.ndarray | None = None,
) -> MetricSummary:
    """Compute comprehensive metric summary."""
    mask_aligned = _align_mask(pred.shape, mask)
    p_v, t_v = pred.ravel(), target.ravel()
    valid = (~np.isnan(p_v)) & (~np.isnan(t_v))
    if mask_aligned is not None:
        valid &= mask_aligned.ravel()

    pred_anom = pred - clim
    target_anom = target - clim

    rmse = compute_rmse(pred, target, mask)
    mae = compute_mae(pred, target, mask)
    bias = compute_bias(pred, target, mask)
    r = compute_pearson_r(pred, target, mask)
    acc = compute_acc(pred_anom, target_anom, mask)
    ss = compute_skill_score_clim(pred, target, clim, mask)

    std_p = float(np.std(p_v[valid])) if np.sum(valid) > 1 else 1.0
    std_t = float(np.std(t_v[valid])) if np.sum(valid) > 1 else 1.0
    std_ratio = float(std_p / std_t) if std_t > 1e-6 else 1.0

    return MetricSummary(
        rmse=round(rmse, 4),
        mae=round(mae, 4),
        bias=round(bias, 4),
        pearson_r=round(r, 4),
        acc=round(acc, 4),
        skill_score_clim=round(ss, 4),
        std_ratio=round(std_ratio, 4),
    )


def compute_isotherm_depth_2d(
    temp_3d: np.ndarray,
    depths: np.ndarray | None = None,
    iso_temp: float = 20.0,
) -> np.ndarray:
    """Compute 2D field of isotherm depth in meters (e.g. D20 or D26).

    Args:
        temp_3d: 3D array [15, lat, lon].
        depths: 1D array of 15 standard depths.
        iso_temp: Target temperature (e.g. 20.0°C or 26.0°C).

    Returns:
        2D array [lat, lon] of depth in meters where temperature crosses iso_temp.
    """
    if depths is None:
        depths = np.array(DEPTH_LEVELS, dtype=np.float32)

    n_z, n_lat, n_lon = temp_3d.shape
    iso_depth = np.full((n_lat, n_lon), np.nan, dtype=np.float32)

    for i in range(n_lat):
        for j in range(n_lon):
            prof = temp_3d[:, i, j]
            if np.all(np.isnan(prof)):
                continue

            # Linear search down profile
            for k in range(n_z - 1):
                t1, t2 = prof[k], prof[k + 1]
                z1, z2 = depths[k], depths[k + 1]

                if np.isnan(t1) or np.isnan(t2):
                    continue

                if (t1 >= iso_temp >= t2) or (t1 <= iso_temp <= t2):
                    if abs(t2 - t1) < 1e-5:
                        iso_depth[i, j] = z1
                    else:
                        frac = (iso_temp - t1) / (t2 - t1)
                        iso_depth[i, j] = z1 + frac * (z2 - z1)
                    break

    return iso_depth


def compute_ohc_300m_2d(
    temp_3d: np.ndarray,
    depths: np.ndarray | None = None,
    t_ref: float = 0.0,
) -> np.ndarray:
    """Compute Ocean Heat Content (OHC) in the top 300 meters (GJ/m^2 or 10^9 J/m^2).

    OHC = integral_0^300 rho_0 * c_p * (T(z) - T_ref) dz
    rho_0 = 1025 kg/m^3, c_p = 3985 J/(kg K) -> rho_0 * c_p ~ 4.084e6 J/(m^3 K)
    """
    if depths is None:
        depths = np.array(DEPTH_LEVELS, dtype=np.float32)

    # Consider depths up to 300m (indices 0..11)
    d300_idx = np.where(depths <= 300.0)[0]
    z_sub = depths[d300_idx]

    rho_cp = 1025.0 * 3985.0  # J / (m^3 * K)
    n_lat, n_lon = temp_3d.shape[1], temp_3d.shape[2]
    ohc_grid = np.full((n_lat, n_lon), np.nan, dtype=np.float32)

    for i in range(n_lat):
        for j in range(n_lon):
            prof = temp_3d[d300_idx, i, j]
            valid = ~np.isnan(prof)
            if np.sum(valid) < 2:
                continue

            z_v = z_sub[valid]
            t_v = prof[valid] - t_ref
            # Trapezoidal integration along depth
            trapz_func = getattr(np, "trapezoid", getattr(np, "trapz", None))
            int_t = trapz_func(t_v, z_v)
            ohc_val_gj = (rho_cp * int_t) / 1e9  # in GJ / m^2
            ohc_grid[i, j] = float(ohc_val_gj)

    return ohc_grid
