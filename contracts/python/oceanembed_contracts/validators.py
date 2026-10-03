"""OceanEmbed Contract Validators.

Validates shapes, physical ranges, and NaN constraints against M0 contracts.
"""

import numpy as np

from oceanembed_contracts.channels import CHANNEL_REGISTRY, NUM_SURFACE_CHANNELS, SURFACE_CHANNELS
from oceanembed_contracts.depths import NUM_DEPTHS
from oceanembed_contracts.grid import LAT_COUNT, LON_COUNT, SPATIAL_SHAPE


class ContractValidationError(ValueError):
    """Raised when data violates OceanEmbed M0 contracts."""

    pass


def validate_spatial_shape(arr: np.ndarray, name: str = "array") -> None:
    """Validate that the last two dimensions of an array match (101, 241)."""
    if arr.ndim < 2:
        raise ContractValidationError(
            f"{name} must have at least 2 dimensions, got ndim={arr.ndim}"
        )
    if arr.shape[-2:] != SPATIAL_SHAPE:
        raise ContractValidationError(
            f"{name} spatial shape {arr.shape[-2:]} does not match contract "
            f"(lat={LAT_COUNT}, lon={LON_COUNT})"
        )


def validate_surface_input_cube(arr: np.ndarray, name: str = "surface_inputs") -> None:
    """Validate 4D input surface tensor [batch/time, 7, 101, 241]."""
    if arr.ndim != 4:
        raise ContractValidationError(
            f"{name} must be 4D [N, channels, lat, lon], got shape={arr.shape}"
        )
    if arr.shape[1] != NUM_SURFACE_CHANNELS:
        raise ContractValidationError(
            f"{name} channels dim={arr.shape[1]} must match 7 surface channels: {SURFACE_CHANNELS}"
        )
    if arr.shape[2:] != SPATIAL_SHAPE:
        raise ContractValidationError(
            f"{name} spatial dims {arr.shape[2:]} must be ({LAT_COUNT}, {LON_COUNT})"
        )


def validate_target_temp_cube(arr: np.ndarray, name: str = "target_temp") -> None:
    """Validate 4D target temperature tensor [batch/time, 15, 101, 241]."""
    if arr.ndim != 4:
        raise ContractValidationError(
            f"{name} must be 4D [N, depths, lat, lon], got shape={arr.shape}"
        )
    if arr.shape[1] != NUM_DEPTHS:
        raise ContractValidationError(
            f"{name} depth dim={arr.shape[1]} must match 15 standard depths"
        )
    if arr.shape[2:] != SPATIAL_SHAPE:
        raise ContractValidationError(
            f"{name} spatial dims {arr.shape[2:]} must be ({LAT_COUNT}, {LON_COUNT})"
        )


def validate_physical_ranges(
    field: np.ndarray,
    channel_name: str,
    mask: np.ndarray | None = None,
    tolerance_margin: float = 0.05,
) -> None:
    """Validate that physical values of a surface channel stay within bounds
    over valid ocean cells."""
    if channel_name not in CHANNEL_REGISTRY:
        return
    info = CHANNEL_REGISTRY[channel_name]
    valid_data = field if mask is None else field[mask]
    valid_data = valid_data[~np.isnan(valid_data)]
    if valid_data.size == 0:
        return

    min_val, max_val = float(np.min(valid_data)), float(np.max(valid_data))
    if min_val < info.min_val - tolerance_margin or max_val > info.max_val + tolerance_margin:
        raise ContractValidationError(
            f"Channel '{channel_name}' values [{min_val:.2f}, {max_val:.2f}] exceed "
            f"allowed range [{info.min_val}, {info.max_val}]"
        )


def validate_masks(ocean_mask: np.ndarray, depth_mask: np.ndarray | None = None) -> None:
    """Validate ocean and depth masks."""
    validate_spatial_shape(ocean_mask, "valid_ocean_mask")
    if ocean_mask.dtype != bool:
        raise ContractValidationError("valid_ocean_mask must be boolean")
    if depth_mask is not None:
        if depth_mask.shape != (NUM_DEPTHS, LAT_COUNT, LON_COUNT):
            raise ContractValidationError(
                f"valid_depth_mask shape {depth_mask.shape} must be "
                f"({NUM_DEPTHS}, {LAT_COUNT}, {LON_COUNT})"
            )
        if depth_mask.dtype != bool:
            raise ContractValidationError("valid_depth_mask must be boolean")
