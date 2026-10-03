"""OceanEmbed Subsurface Depths Contract.

Defines the standard 15 SIH depth levels in meters.
"""

import numpy as np

DEPTH_LEVELS: list[float] = [
    0.0,
    5.0,
    10.0,
    20.0,
    30.0,
    50.0,
    75.0,
    100.0,
    125.0,
    150.0,
    200.0,
    300.0,
    500.0,
    700.0,
    1000.0,
]

NUM_DEPTHS: int = len(DEPTH_LEVELS)  # 15
DEPTH_UNITS: str = "m"


def get_depth_levels() -> np.ndarray:
    """Return numpy array of 15 standard depth levels."""
    return np.array(DEPTH_LEVELS, dtype=np.float32)


def get_depth_index(depth_m: float, tolerance: float = 1e-2) -> int:
    """Return 0-based depth index for a given standard depth in meters."""
    for idx, d in enumerate(DEPTH_LEVELS):
        if abs(d - depth_m) < tolerance:
            return idx
    raise ValueError(f"Depth {depth_m}m is not one of the 15 standard SIH depths: {DEPTH_LEVELS}")
