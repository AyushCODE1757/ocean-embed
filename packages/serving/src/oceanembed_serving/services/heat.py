import numpy as np

RHO = 1025.0  # kg m-3, reference seawater density (stated convention)
CP = 3985.0  # J kg-1 K-1, reference specific heat (stated convention)


def ohc_gj_m2(temp: np.ndarray, depths_m: list[int] | tuple[int, ...], max_depth: int = 300) -> np.ndarray:
    """rho*cp*integral of T dz over 0..max_depth (trapezoid on the standard levels).
    temp: [depth, lat, lon]. NaN if any level up to max_depth is missing. Units: GJ m-2."""
    d = np.asarray(depths_m, dtype=float)
    keep = d <= max_depth
    if d[keep][-1] != max_depth:
        raise ValueError(f"max_depth {max_depth} m is not one of the standard levels")
    integral = np.trapezoid(temp[keep], d[keep], axis=0)  # NaN propagates
    return RHO * CP * integral / 1e9


def isotherm_depth(temp: np.ndarray, depths_m: list[int] | tuple[int, ...], level: float) -> np.ndarray:
    """Depth (m) of the first downward crossing of `level` degC, linear between levels.
    NaN where the surface is already colder, or the isotherm is deeper than the last level."""
    d = np.asarray(depths_m, dtype=float)
    out = np.full(temp.shape[1:], np.nan)
    found = np.zeros(temp.shape[1:], dtype=bool)
    for k in range(len(d) - 1):
        a, b = temp[k], temp[k + 1]
        with np.errstate(invalid="ignore", divide="ignore"):
            cross = ~found & np.isfinite(a) & np.isfinite(b) & (a >= level) & (b < level)
            frac = (a - level) / (a - b)
        out = np.where(cross, d[k] + frac * (d[k + 1] - d[k]), out)
        found |= cross
    return out
