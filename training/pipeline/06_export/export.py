import glob
import json
import os
import shutil

import numpy as np
import pandas as pd
import xarray as xr

R = "/kaggle/input/datasets/ayushkam"
g = lambda p: sorted(glob.glob(f"{R}/{p}", recursive=True))
ds = xr.open_zarr(g("cube-v1/**/cube.zarr")[0]); clim = xr.open_dataset(g("cube-v1/**/clim.nc")[0])["clim"].values
with open(g("cube-v1/**/norm_splits.json")[0]) as source:
    S = json.load(source)["splits"]["test"]
t = ds.temp.sel(time=slice(*S)); k = np.arange(0, t.time.size, 2); tt = t.isel(time=k)
doy = tt.time.dt.dayofyear.values
q = lambda a: np.where(np.isnan(a), -32768, np.round(a * 100)).astype("int16")
O = "/kaggle/working/app_data"; os.makedirs(O, exist_ok=True)
np.save(f"{O}/pred_model.npy", q(np.load(g("model-v1/**/pred_test.npy")[0])[k]))
np.save(f"{O}/truth_glorys.npy", q(tt.values)); np.save(f"{O}/clim.npy", q(clim[doy - 1]))
np.save(f"{O}/ocean_mask.npy", ds.valid_ocean_mask.values.astype("uint8"))
with open(f"{O}/dates.json", "w") as destination:
    json.dump([str(d)[:10] for d in tt.time.values], destination)
meta = {"lat0": 5, "lon0": 45, "step": 0.25, "shape": [101, 241], "scale": 0.01, "nodata": -32768, "units": "degC",
 "depths": [0,5,10,20,30,50,75,100,125,150,200,300,500,700,1000], "split": "test", "every_n_days": 2,
 "train_years": "2019-2022", "val_year": 2023, "test_years": "2024-2025",
 "notes": "SSS 2025 is near-real-time; ARMOR3D 2025 is NRT; Argo 2024-2025 mixes real-time and delayed-mode"}
with open(f"{O}/meta.json", "w") as destination:
    json.dump(meta, destination, indent=1)
for n in ["model-v1/**/results.json", "val-v1/**/argo_validation.json"]:
    f = g(n)
    if f: shutil.copy(f[0], O)
a = pd.read_parquet(g("argo-dataset/**/argo_profiles.parquet")[0],
    columns=["PLATFORM_NUMBER", "CYCLE_NUMBER", "DATA_MODE", "PRES", "TEMP", "LATITUDE", "LONGITUDE", "TIME", "TEMP_QC", "PRES_QC"])
a = a[(pd.to_numeric(a.TEMP_QC, errors="coerce") == 1) & (pd.to_numeric(a.PRES_QC, errors="coerce") == 1)].drop(columns=["TEMP_QC", "PRES_QC"])
a.to_parquet(f"{O}/argo.parquet"); print(os.listdir(O), round(sum(os.path.getsize(f"{O}/{x}") for x in os.listdir(O)) / 1e6), "MB")
