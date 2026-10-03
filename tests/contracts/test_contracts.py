import numpy as np

from contracts.channels import CONTEXT_CHANNELS, INPUT_CHANNELS
from contracts.depths import DEPTHS_M
from contracts.grid import LAT_MAX, LAT_MIN, LON_MAX, LON_MIN, SHAPE, STEP, lat, lon


def test_grid_shape():
    assert SHAPE == (101, 241)


def test_channel_order_and_context_channels():
    assert INPUT_CHANNELS == ["sst", "sss", "sla", "ucur", "vcur", "uwind", "vwind"]
    assert CONTEXT_CHANNELS == ["bathymetry", "lat", "sin_doy", "cos_doy"]


def test_depths_length():
    assert len(DEPTHS_M) == 15
    assert DEPTHS_M == [0, 5, 10, 20, 30, 50, 75, 100, 125, 150, 200, 300, 500, 700, 1000]


def test_lat_lon_ascending_and_step():
    lats = lat()
    lons = lon()
    assert np.all(np.diff(lats) > 0)
    assert np.all(np.diff(lons) > 0)
    assert lats[0] == LAT_MIN
    assert lats[-1] == LAT_MAX
    assert lons[0] == LON_MIN
    assert lons[-1] == LON_MAX
    assert np.isclose(STEP, 0.25)
