import glob
import json
import warnings

import numpy as np
import xarray as xr

warnings.filterwarnings("ignore")
R = "/kaggle/input/datasets/ayushkam/cube-v1"
z = glob.glob(f"{R}/**/cube.zarr", recursive=True)[0]
clim = xr.open_dataset(glob.glob(f"{R}/**/clim.nc", recursive=True)[0])["clim"].load()
with open(glob.glob(f"{R}/**/norm_splits.json", recursive=True)[0]) as source:
    S = json.load(source)["splits"]
ds = xr.open_zarr(z)
DEPTHS = [0,5,10,20,30,50,75,100,125,150,200,300,500,700,1000]
out = {}
for name in ["val", "test"]:
    t = ds.temp.sel(time=slice(*S[name]))
    tv = t.values
    pv = clim.sel(dayofyear=t.time.dt.dayofyear.values).values
    e = pv - tv
    out[name] = {"depth": DEPTHS,
                 "rmse": np.sqrt(np.nanmean(e**2, axis=(0, 2, 3))).round(3).tolist(),
                 "bias": np.nanmean(e, axis=(0, 2, 3)).round(3).tolist()}
    print(name, "days", t.time.size)
    for d, r, b in zip(DEPTHS, out[name]["rmse"], out[name]["bias"]):
        print(f"  {d:>5} m  rmse {r:6.3f}  bias {b:7.3f}")
with open("/kaggle/working/b0_scores.json", "w") as destination:
    json.dump(out, destination, indent=1)