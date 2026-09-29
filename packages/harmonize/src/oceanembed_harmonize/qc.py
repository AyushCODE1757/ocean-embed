"""Quality Control and Validation Module for OceanEmbed Harmonization.

Performs:
- Physical range validation across channels
- Missing-data fraction auditing per variable and year
- Source-tier auditing (final vs interim vs NRT vs fixture)
- Generation of the Data QC Report used to verify and freeze training splits
"""
from dataclasses import dataclass
from typing import Any, Dict, List, Optional
import numpy as np

from oceanembed_contracts import CHANNEL_REGISTRY, SURFACE_CHANNELS


@dataclass
class QCVariableReport:
    variable: str
    total_samples: int
    missing_fraction: float
    min_observed: float
    max_observed: float
    range_valid: bool
    status: str


def run_qc_check_on_array(
    data: np.ndarray,
    channel_name: str,
    ocean_mask: Optional[np.ndarray] = None,
) -> QCVariableReport:
    """Run physical range and missingness audit on a 2D or 3D field."""
    valid_ocean = ocean_mask if ocean_mask is not None else np.ones(data.shape[-2:], dtype=bool)
    
    # Extract only ocean cells
    if data.ndim == 2:
        ocean_data = data[valid_ocean]
    elif data.ndim == 3:
        # [depth/channel, lat, lon]
        ocean_data = data[:, valid_ocean].ravel()
    elif data.ndim == 4:
        ocean_data = data[:, :, valid_ocean].ravel()
    else:
        ocean_data = data.ravel()

    total_cells = ocean_data.size
    nan_cells = int(np.sum(np.isnan(ocean_data)))
    missing_frac = float(nan_cells / total_cells) if total_cells > 0 else 1.0

    valid_vals = ocean_data[~np.isnan(ocean_data)]
    if valid_vals.size == 0:
        return QCVariableReport(
            variable=channel_name,
            total_samples=total_cells,
            missing_fraction=1.0,
            min_observed=float("nan"),
            max_observed=float("nan"),
            range_valid=False,
            status="FAILED_ALL_MISSING",
        )

    min_obs = float(np.min(valid_vals))
    max_obs = float(np.max(valid_vals))

    range_valid = True
    if channel_name in CHANNEL_REGISTRY:
        info = CHANNEL_REGISTRY[channel_name]
        if min_obs < info.min_val - 0.1 or max_obs > info.max_val + 0.1:
            range_valid = False

    status = "PASSED" if (range_valid and missing_frac < 0.20) else "WARNING_OR_OUT_OF_BOUNDS"

    return QCVariableReport(
        variable=channel_name,
        total_samples=total_cells,
        missing_fraction=missing_frac,
        min_observed=min_obs,
        max_observed=max_obs,
        range_valid=range_valid,
        status=status,
    )


def generate_qc_report(
    surface_cube: np.ndarray,
    target_cube: np.ndarray,
    ocean_mask: np.ndarray,
    source_tier: str = "final",
) -> Dict[str, Any]:
    """Generate complete QC report for a daily slice or sequence of observations."""
    channel_reports = {}
    for idx, name in enumerate(SURFACE_CHANNELS):
        channel_data = surface_cube[idx] if surface_cube.ndim == 3 else surface_cube[:, idx]
        rep = run_qc_check_on_array(channel_data, name, ocean_mask)
        channel_reports[name] = rep.__dict__

    # Target temperature QC
    target_rep = run_qc_check_on_array(target_cube, "subsurface_temp", ocean_mask)
    channel_reports["subsurface_temp"] = target_rep.__dict__

    all_passed = all(r["range_valid"] for r in channel_reports.values())

    return {
        "source_tier": source_tier,
        "qc_passed": all_passed,
        "variables": channel_reports,
    }
