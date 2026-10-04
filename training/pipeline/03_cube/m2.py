import glob
import json

import numpy as np
import xarray as xr
from scipy.ndimage import uniform_filter1d

R = "/kaggle/input/datasets/ayushkam"
def op(pats, drop=("tier",)):
    fs = sorted(f for p in pats for f in glob.glob(p, recursive=True))
    assert fs, pats
    d = xr.open_mfdataset(fs, combine="by_coords", chunks={"time": 31})
    return d.drop_vars([v for v in drop if v in d])
g = op([f"{R}/glorys-a/**/glorys_025/*.nc", f"{R}/glorys-b/**/glorys_025/*.nc"])
sss = op([f"{R}/inputs-sssla/**/sss/*.nc"], drop=()).rename({"tier": "tier_sss"})
rest = [op([f"{R}/inputs-sst/**/sst/*.nc"]), op([f"{R}/inputs-sssla/**/sla/*.nc"]),
        op([f"{R}/inputs-uvcur-wind/**/oscar/*.nc"]), op([f"{R}/inputs-uvcur-wind/**/ccmp/*.nc"])]
ds = xr.merge([g, sss] + rest, join="inner")
CH = ["sst", "sss", "sla", "ucur", "vcur", "uwind", "vwind"]
ds = ds[CH + ["tier_sss", "temp"]].chunk({"time": 31})
ds["valid_ocean_mask"] = ds.temp.isel(depth=0).notnull().any("time").compute()
ds["valid_depth_mask"] = ds.temp.notnull().any("time").compute()
SPL = {"train": ("2019-01-01", "2022-12-15"), "val": ("2023-01-01", "2023-12-15"), "test": ("2024-01-01", "2025-12-31")}
tr = ds.sel(time=slice(*SPL["train"]))
clim = tr.temp.groupby("time.dayofyear").mean("time").compute()
clim.values = uniform_filter1d(clim.values, size=15, axis=0, mode="wrap")
clim.astype("float32").to_dataset(name="clim").to_netcdf("/kaggle/working/clim.nc")
om = ds.valid_ocean_mask
ns = {c: {"mean": float(tr[c].where(om).mean()), "std": float(tr[c].where(om).std())} for c in CH}
ns["temp_per_depth"] = {"mean": tr.temp.mean(["time", "latitude", "longitude"]).values.tolist(),
                        "std": tr.temp.std(["time", "latitude", "longitude"]).values.tolist()}
with open("/kaggle/working/norm_splits.json", "w") as destination:
    json.dump({"channels": CH, "splits": SPL, "norm": ns}, destination, indent=1)
ds.to_zarr("/kaggle/working/cube.zarr", mode="w")
print("channels:", CH, "| time", ds.time.size, str(ds.time.values[0])[:10], str(ds.time.values[-1])[:10])
for k, v in SPL.items(): print(k, ds.sel(time=slice(*v)).time.size, "days")
print("ocean frac", float(om.mean()), "| tier_sss counts", dict(zip(*np.unique(ds.tier_sss.values, return_counts=True))))