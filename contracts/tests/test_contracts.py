"""Unit and contract tests for OceanEmbed M0 contracts."""
import numpy as np
import pytest

from oceanembed_contracts import (
    GridSpec,
    LAT_COUNT,
    LON_COUNT,
    SPATIAL_SHAPE,
    get_lat_coords,
    get_lon_coords,
    get_spatial_grid,
    DEPTH_LEVELS,
    NUM_DEPTHS,
    get_depth_levels,
    get_depth_index,
    SURFACE_CHANNELS,
    CONTEXT_CHANNELS,
    NUM_SURFACE_CHANNELS,
    NUM_CONTEXT_CHANNELS,
    TRAIN_START_DATE,
    TRAIN_END_DATE,
    VAL_START_DATE,
    VAL_END_DATE,
    TEST_START_DATE,
    TEST_END_DATE,
    is_in_spatial_holdout,
    ContractValidationError,
    validate_spatial_shape,
    validate_surface_input_cube,
    validate_target_temp_cube,
    validate_physical_ranges,
    validate_masks,
)


def test_grid_spec():
    lats = get_lat_coords()
    lons = get_lon_coords()
    assert len(lats) == 101
    assert len(lons) == 241
    assert lats[0] == 5.0
    assert lats[-1] == 30.0
    assert lons[0] == 45.0
    assert lons[-1] == 105.0

    lat_g, lon_g = get_spatial_grid()
    assert lat_g.shape == (101, 241)
    assert lon_g.shape == (101, 241)


def test_depth_spec():
    assert NUM_DEPTHS == 15
    assert len(DEPTH_LEVELS) == 15
    assert DEPTH_LEVELS[0] == 0.0
    assert DEPTH_LEVELS[-1] == 1000.0
    assert get_depth_index(100.0) == 7
    with pytest.raises(ValueError):
        get_depth_index(45.0)


def test_channels_spec():
    assert NUM_SURFACE_CHANNELS == 7
    assert SURFACE_CHANNELS == ["sst", "sss", "sla", "ucur", "vcur", "uwind", "vwind"]
    assert NUM_CONTEXT_CHANNELS == 4
    assert CONTEXT_CHANNELS == ["bathymetry", "latitude", "sin_doy", "cos_doy"]


def test_splits_spec():
    assert TRAIN_START_DATE == "2015-04-01"
    assert TRAIN_END_DATE == "2022-12-31"
    assert VAL_START_DATE == "2023-01-01"
    assert VAL_END_DATE == "2023-12-31"
    assert TEST_START_DATE == "2024-01-01"
    assert TEST_END_DATE == "2025-12-31"

    assert is_in_spatial_holdout(14.0, 88.0) is True
    assert is_in_spatial_holdout(20.0, 65.0) is False


def test_tensor_validators():
    # Valid surface input tensor: [batch=2, channels=7, lat=101, lon=241]
    valid_inputs = np.zeros((2, 7, 101, 241), dtype=np.float32)
    validate_surface_input_cube(valid_inputs)

    # Invalid channel count
    with pytest.raises(ContractValidationError):
        validate_surface_input_cube(np.zeros((2, 6, 101, 241)))

    # Valid target tensor: [batch=2, depths=15, lat=101, lon=241]
    valid_targets = np.zeros((2, 15, 101, 241), dtype=np.float32)
    validate_target_temp_cube(valid_targets)

    # Invalid depths count
    with pytest.raises(ContractValidationError):
        validate_target_temp_cube(np.zeros((2, 10, 101, 241)))


def test_physical_range_validator():
    # Valid SST field
    sst = np.full((101, 241), 28.5, dtype=np.float32)
    validate_physical_ranges(sst, "sst")

    # Invalid SST field (e.g. 50 degC)
    invalid_sst = np.full((101, 241), 50.0, dtype=np.float32)
    with pytest.raises(ContractValidationError):
        validate_physical_ranges(invalid_sst, "sst")


def test_mask_validators():
    ocean_mask = np.ones((101, 241), dtype=bool)
    depth_mask = np.ones((15, 101, 241), dtype=bool)
    validate_masks(ocean_mask, depth_mask)
