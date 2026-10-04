"""Read-only access to predictions.zarr. Expected variables (contract: predictions.schema.json):
temp_mean[time, depth, lat, lon]; optional temp_spread with the same dims."""

from functools import lru_cache

import numpy as np
import xarray as xr

from ..settings import Settings


class DataNotBuilt(RuntimeError):
    pass


@lru_cache(maxsize=1)
def _open(path: str) -> xr.Dataset:
    try:
        return xr.open_zarr(path, consolidated=None)
    except Exception as exc:  # missing store or unreadable
        raise DataNotBuilt(f"predictions store not available at {path}") from exc


class Store:
    def __init__(self, settings: Settings):
        self.s = settings
        self.ds = _open(str(settings.predictions_path))

    def dates(self) -> list[str]:
        return [str(np.datetime_as_string(t, unit="D")) for t in self.ds["time"].values]

    def _tidx(self, date: str) -> int:
        d = self.dates()
        if date not in d:
            raise KeyError(f"date {date} not in store")
        return d.index(date)

    def _didx(self, depth_m: int) -> int:
        if depth_m not in self.s.depths_m:
            raise KeyError(f"depth {depth_m} not in contract depths")
        return self.s.depths_m.index(depth_m)

    @staticmethod
    def _clean(arr: np.ndarray) -> list:
        return np.where(np.isfinite(arr), arr, None).tolist()

    def slice(self, date: str, depth_m: int, field: str = "model") -> dict:
        t, d = self._tidx(date), self._didx(depth_m)
        if field == "model":
            a = self.ds["temp_mean"].isel(time=t, depth=d).values
        elif field == "truth":
            a = self.ds["temp_truth"].isel(time=t, depth=d).values
        elif field == "clim":
            a = self.ds["temp_clim"].isel(time=t, depth=d).values
        elif field == "error":
            a = (
                self.ds["temp_mean"].isel(time=t, depth=d)
                - self.ds["temp_truth"].isel(time=t, depth=d)
            ).values
        else:
            raise KeyError(f"unknown field {field}")
        return {
            "lat": self.ds["lat"].values.tolist(),
            "lon": self.ds["lon"].values.tolist(),
            "values": self._clean(np.round(a.astype("float64"), 3)),
        }

    def profile(self, date: str, lat: float, lon: float) -> dict:
        if not (
            self.s.lat_min <= lat <= self.s.lat_max and self.s.lon_min <= lon <= self.s.lon_max
        ):
            raise ValueError("point outside the contract domain")
        pt = self.ds.isel(time=self._tidx(date)).sel(lat=lat, lon=lon, method="nearest")
        mean = np.round(pt["temp_mean"].values.astype("float64"), 3)
        truth = (
            np.round(pt["temp_truth"].values.astype("float64"), 3)
            if "temp_truth" in self.ds
            else np.full_like(mean, np.nan)
        )
        clim = (
            np.round(pt["temp_clim"].values.astype("float64"), 3)
            if "temp_clim" in self.ds
            else np.full_like(mean, np.nan)
        )
        spread = (
            np.round(pt["temp_spread"].values.astype("float64"), 3)
            if "temp_spread" in self.ds
            else np.full_like(mean, np.nan)
        )
        return {
            "mean": self._clean(mean),
            "spread": self._clean(spread),
            "truth": self._clean(truth),
            "clim": self._clean(clim),
        }

    def spread_slice(self, date: str, depth_m: int) -> dict:
        if "temp_spread" not in self.ds:
            raise LookupError("this run has no uncertainty output")
        a = self.ds["temp_spread"].isel(time=self._tidx(date), depth=self._didx(depth_m)).values
        return {
            "lat": self.ds["lat"].values.tolist(),
            "lon": self.ds["lon"].values.tolist(),
            "values": self._clean(np.round(a.astype("float64"), 3)),
        }

    def column_stack(self, date: str) -> np.ndarray:
        """temp_mean for one date as [depth, lat, lon] float64."""
        return self.ds["temp_mean"].isel(time=self._tidx(date)).values.astype("float64")

    def section(self, date: str, lats: np.ndarray, lons: np.ndarray) -> np.ndarray:
        """temp_mean along points, [depth, point], nearest grid cell."""
        pts = (
            self.ds["temp_mean"]
            .isel(time=self._tidx(date))
            .sel(
                lat=xr.DataArray(lats, dims="p"), lon=xr.DataArray(lons, dims="p"), method="nearest"
            )
        )
        return pts.transpose("depth", "p").values.astype("float64")
