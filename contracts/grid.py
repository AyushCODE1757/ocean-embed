import numpy as np

LAT_MIN = 5.0
LAT_MAX = 30.0
LON_MIN = 45.0
LON_MAX = 105.0
STEP = 0.25
SHAPE = (101, 241)


def lat() -> np.ndarray:
    return np.linspace(LAT_MIN, LAT_MAX, int((LAT_MAX - LAT_MIN) / STEP) + 1, dtype=float)


def lon() -> np.ndarray:
    return np.linspace(LON_MIN, LON_MAX, int((LON_MAX - LON_MIN) / STEP) + 1, dtype=float)
