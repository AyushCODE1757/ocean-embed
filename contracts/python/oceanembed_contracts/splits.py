"""OceanEmbed Data Splits Contract.

Defines temporal train/val/test splits, gap days, and spatial holdout domain.
"""
from dataclasses import dataclass
from typing import Tuple


TRAIN_START_DATE: str = "2015-04-01"
TRAIN_END_DATE: str = "2022-12-31"

VAL_START_DATE: str = "2023-01-01"
VAL_END_DATE: str = "2023-12-31"

TEST_START_DATE: str = "2024-01-01"
TEST_END_DATE: str = "2025-12-31"

TEMPORAL_GAP_DAYS: int = 15

# Spatial Generalization Holdout Box
SPATIAL_HOLDOUT_LAT_MIN: float = 12.0
SPATIAL_HOLDOUT_LAT_MAX: float = 16.0
SPATIAL_HOLDOUT_LON_MIN: float = 86.0
SPATIAL_HOLDOUT_LON_MAX: float = 90.0


@dataclass(frozen=True)
class SplitSpec:
    train_range: Tuple[str, str] = (TRAIN_START_DATE, TRAIN_END_DATE)
    val_range: Tuple[str, str] = (VAL_START_DATE, VAL_END_DATE)
    test_range: Tuple[str, str] = (TEST_START_DATE, TEST_END_DATE)
    gap_days: int = TEMPORAL_GAP_DAYS
    holdout_box: Tuple[float, float, float, float] = (
        SPATIAL_HOLDOUT_LAT_MIN,
        SPATIAL_HOLDOUT_LAT_MAX,
        SPATIAL_HOLDOUT_LON_MIN,
        SPATIAL_HOLDOUT_LON_MAX,
    )


def is_in_spatial_holdout(lat: float, lon: float) -> bool:
    """Check if a coordinate falls inside the spatial generalization holdout box."""
    return (
        SPATIAL_HOLDOUT_LAT_MIN <= lat <= SPATIAL_HOLDOUT_LAT_MAX
        and SPATIAL_HOLDOUT_LON_MIN <= lon <= SPATIAL_HOLDOUT_LON_MAX
    )
