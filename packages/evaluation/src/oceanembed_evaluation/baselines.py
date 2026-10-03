"""Baseline Oceanographic Models (B0 Climatology, B1 EOF Regression, B4 ARMOR3D).

Provides implementations for benchmarking neural models against classical approaches:
- B0: Daily DOY Climatology
- B1: Vertical Empirical Orthogonal Function (EOF) Regression
- B4: ARMOR3D Reanalysis Benchmark
"""

import numpy as np
import xarray as xr
from oceanembed_contracts import NUM_DEPTHS
from oceanembed_harmonize.climatology import ClimatologyEngine


class BaselineB0Climatology:
    """Baseline B0: Predicts daily day-of-year climatological mean."""

    def __init__(self, climatology_engine: ClimatologyEngine):
        self.clim = climatology_engine

    def predict(self, date_str: str) -> np.ndarray:
        """Predict 3D temperature [15, 101, 241] for a date."""
        clim_mean, _ = self.clim.get_climatology_for_date(date_str)
        return clim_mean.copy()


class BaselineB1EOFRegression:
    """Baseline B1: Linear / EOF Regression of subsurface vertical profile EOFs
    on surface features."""

    def __init__(self, n_eofs: int = 4):
        self.n_eofs = n_eofs
        self.eof_basis: np.ndarray | None = None  # [15, n_eofs]
        self.weights: np.ndarray | None = None  # [n_eofs, n_surface_features]
        self.intercept: np.ndarray | None = None  # [n_eofs]
        self.mean_profile: np.ndarray | None = None  # [15]

    def fit(
        self,
        surface_inputs: np.ndarray,  # [N, 7, lat, lon]
        target_temps: np.ndarray,  # [N, 15, lat, lon]
        ocean_mask: np.ndarray,  # [lat, lon]
    ) -> "BaselineB1EOFRegression":
        """Fit EOF decomposition on vertical profiles and ridge regression from surface features."""
        # 1. Flatten spatial and temporal dimensions over valid ocean cells
        n_samples, n_channels, n_lat, n_lon = surface_inputs.shape
        valid_mask_4d = np.broadcast_to(ocean_mask, (n_samples, n_lat, n_lon))

        # Extract target profiles over ocean: [M, 15]
        target_flat = np.moveaxis(target_temps, 1, -1)[valid_mask_4d]
        surface_flat = np.moveaxis(surface_inputs, 1, -1)[valid_mask_4d]

        # Filter NaNs
        finite_mask = ~np.isnan(target_flat).any(axis=-1) & ~np.isnan(surface_flat).any(axis=-1)
        t_clean = target_flat[finite_mask]  # [M_clean, 15]
        s_clean = surface_flat[finite_mask]  # [M_clean, 7]

        if len(t_clean) < 10:
            return self

        # 2. Compute Mean Profile and PCA/SVD for EOF basis
        self.mean_profile = np.mean(t_clean, axis=0)
        t_centered = t_clean - self.mean_profile

        # SVD: t_centered = U * S * Vt -> Vt[:n_eofs] are EOF spatial vertical modes
        _, _, vt = np.linalg.svd(t_centered, full_matrices=False)
        self.eof_basis = vt[: self.n_eofs].T  # [15, n_eofs]

        # Project training targets to EOF coefficients: [M_clean, n_eofs]
        eof_coeffs = t_centered @ self.eof_basis

        # 3. Ridge Regression: s_clean -> eof_coeffs
        # W = (X^T X + alpha I)^(-1) X^T Y
        alpha = 1.0
        x_design = np.hstack([s_clean, np.ones((len(s_clean), 1))])
        xtx = x_design.T @ x_design + alpha * np.eye(x_design.shape[1])
        xty = x_design.T @ eof_coeffs
        beta = np.linalg.solve(xtx, xty)  # [8, n_eofs]

        self.weights = beta[:-1].T  # [n_eofs, 7]
        self.intercept = beta[-1]  # [n_eofs]

        return self

    def predict_cube(self, surface_input: np.ndarray, ocean_mask: np.ndarray) -> np.ndarray:
        """Predict 3D subsurface temperature field [15, lat, lon] from 2D surface
        inputs [7, lat, lon]."""
        n_lat, n_lon = ocean_mask.shape
        if self.eof_basis is None or self.weights is None:
            # Fallback
            return np.zeros((NUM_DEPTHS, n_lat, n_lon), dtype=np.float32)

        pred_3d = np.full((NUM_DEPTHS, n_lat, n_lon), np.nan, dtype=np.float32)

        # Regress EOF coefficients per ocean pixel
        surf_t = np.moveaxis(surface_input, 0, -1)  # [lat, lon, 7]
        ocean_surf = surf_t[ocean_mask]  # [N_ocean, 7]

        pred_coeffs = ocean_surf @ self.weights.T + self.intercept  # [N_ocean, n_eofs]
        # Reconstruct vertical temperature profile: mean + coeffs @ EOF^T
        pred_profs = self.mean_profile + pred_coeffs @ self.eof_basis.T  # [N_ocean, 15]

        # Place back into 3D grid
        pred_3d_t = np.zeros((n_lat, n_lon, NUM_DEPTHS), dtype=np.float32)
        pred_3d_t[ocean_mask] = pred_profs
        pred_3d = np.moveaxis(pred_3d_t, -1, 0)
        pred_3d[:, ~ocean_mask] = np.nan

        return pred_3d


class BaselineB4ARMOR3D:
    """Baseline B4: ARMOR3D Reanalysis comparison benchmark."""

    def __init__(self, armor3d_ds: xr.Dataset | None = None):
        self.armor3d_ds = armor3d_ds

    def predict(self, date_str: str) -> np.ndarray:
        """Fetch ARMOR3D regridded temperature field for date."""
        if self.armor3d_ds is None:
            raise ValueError("ARMOR3D dataset not loaded.")
        var_name = "to" if "to" in self.armor3d_ds else list(self.armor3d_ds.data_vars.keys())[0]
        return self.armor3d_ds[var_name].sel(time=date_str).values.squeeze()
