import glob
import os
import sys
import warnings

import copernicusmarine as cm
import numpy as np
import pandas as pd
import xarray as xr

Y0, Y1 = int(sys.argv[1]), int(sys.argv[2])
DS = "cmems_mod_glo_phy_my_0.083deg_P1D-m"
RAW, OUT = "/tmp/raw", "/kaggle/working/glorys_025"
os.makedirs(RAW, exist_ok=True); os.makedirs(OUT, exist_ok=True)
DEPTHS = [0,5,10,20,30,50,75,100,125,150,200,300,500,700,1000]
LAT = np.arange(5, 30.01, 0.25); LON = np.arange(45, 105.01, 0.25)

def process(path):
    da = xr.open_dataset(path)["thetao"].load()
    a = da.values
    t, d, ny, nx = a.shape
    assert (ny, nx) == (303, 723), (ny, nx)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        m = np.nanmean(a.reshape(t, d, 101, 3, 241, 3), axis=(3, 5))
    da = xr.DataArray(m, dims=da.dims, coords={"time": da.time, "depth": da.depth,
                      "latitude": LAT, "longitude": LON})
    arr = da.values
    ok = ~np.isnan(arr)
    idx = np.where(ok, np.arange(arr.shape[1])[None, :, None, None], 0)
    np.maximum.accumulate(idx, axis=1, out=idx)
    filled = np.nan_to_num(np.take_along_axis(arr, idx, axis=1), nan=0.0)
    dfill = da.copy(data=filled)
    dmask = da.copy(data=ok.astype("float32"))
    tgt = DEPTHS[1:]
    rest = dfill.interp(depth=tgt, method="pchip")
    rmask = dmask.interp(depth=tgt, method="linear")
    rest = rest.where(rmask > 0.999)
    top = da.isel(depth=0).expand_dims(depth=[0.0])
    out = xr.concat([top, rest], dim="depth").astype("float32")
    out["time"] = out.time.dt.floor("D")
    return out.transpose("time", "depth", "latitude", "longitude").rename("temp")

for m in pd.period_range("2015-04", "2025-12", freq="M"):
    if not (Y0 <= m.year <= Y1): continue
    f = f"{OUT}/{m}.nc"
    if os.path.exists(f): continue
    try:
        cm.subset(dataset_id=DS, variables=["thetao"],
            minimum_longitude=44.90, maximum_longitude=105.10,
            minimum_latitude=4.90, maximum_latitude=30.10,
            minimum_depth=0, maximum_depth=1100,
            start_datetime=f"{m.start_time:%Y-%m-%d}T00:00:00",
            end_datetime=f"{m.end_time:%Y-%m-%d}T23:59:59",
            output_directory=RAW, output_filename=f"{m}.nc", overwrite=True)
        process(f"{RAW}/{m}.nc").to_netcdf(f)
    except (OSError, RuntimeError, ValueError) as exc:
        print("FAILED", m, exc, flush=True)
    for p in glob.glob(f"{RAW}/*"): os.remove(p)
    print("done", m, flush=True)