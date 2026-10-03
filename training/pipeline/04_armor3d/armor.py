import glob
import os
import traceback
import warnings

import copernicusmarine as cm
import numpy as np
import pandas as pd
import xarray as xr

RAW, OUT = "/tmp/raw_armor", "/kaggle/working/armor3d"
os.makedirs(RAW, exist_ok=True); os.makedirs(OUT, exist_ok=True)
DEPTHS = [0,5,10,20,30,50,75,100,125,150,200,300,500,700,1000]
LAT = np.arange(5, 30.01, 0.25); LON = np.arange(45, 105.01, 0.25)
SRC = [("cmems_obs-mob_glo_phy_my_0.125deg_P1D-m", "2024-01-01", "2024-12-31", "final"),
       ("cmems_obs-mob_glo_phy_nrt_0.125deg_P1D-m", "2025-01-01", "2025-12-31", "nrt")]

def edges(c):
    s = float(np.median(np.diff(c))); return np.append(c - s/2, c[-1] + s/2)
def weights(out_c, in_c):
    oe, ie = edges(out_c), edges(in_c)
    lo = np.maximum(oe[:-1, None], ie[None, :-1]); hi = np.minimum(oe[1:, None], ie[None, 1:])
    return (np.clip(hi - lo, 0, None) / (oe[1] - oe[0])).astype("float32")
def regrid4(x, lat, lon):
    Wy, Wx = weights(LAT, lat), weights(LON, lon)
    v = (~np.isnan(x)).astype("float32"); xf = np.nan_to_num(x)
    num = Wy @ (xf @ Wx.T); den = Wy @ (v @ Wx.T)
    return np.where(den > 0.5, num / np.maximum(den, 1e-6), np.nan).astype("float32")

def vert(arr, dep, times):
    da = xr.DataArray(arr, dims=("time", "depth", "latitude", "longitude"),
        coords={"time": times, "depth": dep, "latitude": LAT, "longitude": LON})
    ok = ~np.isnan(arr)
    idx = np.where(ok, np.arange(arr.shape[1])[None, :, None, None], 0)
    np.maximum.accumulate(idx, axis=1, out=idx)
    filled = np.nan_to_num(np.take_along_axis(arr, idx, axis=1), nan=0.0)
    dfill = da.copy(data=filled); dmask = da.copy(data=ok.astype("float32"))
    tgt = DEPTHS[1:]
    rest = dfill.interp(depth=tgt, method="pchip").where(dmask.interp(depth=tgt, method="linear") > 0.999)
    top = da.isel(depth=0).expand_dims(depth=[0.0])
    out = xr.concat([top, rest], dim="depth").astype("float32")
    return out.transpose("time", "depth", "latitude", "longitude")

for m in pd.period_range("2024-01", "2025-12", freq="M"):
    f = f"{OUT}/{m}.nc"
    if os.path.exists(f): continue
    ds_id, a, b, tier = SRC[0] if m.year == 2024 else SRC[1]
    try:
        cm.subset(dataset_id=ds_id, variables=["to"],
            minimum_longitude=44.5, maximum_longitude=105.5,
            minimum_latitude=4.5, maximum_latitude=30.5,
            minimum_depth=0, maximum_depth=1100,
            start_datetime=f"{m.start_time:%Y-%m-%d}T00:00:00", end_datetime=f"{m.end_time:%Y-%m-%d}T23:59:59",
            output_directory=RAW, output_filename=f"{m}.nc", overwrite=True)
        d = xr.open_dataset(f"{RAW}/{m}.nc")["to"].load()
        d = d.sortby("latitude").sortby("longitude")
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            y = regrid4(d.values.astype("float32"), d.latitude.values, d.longitude.values)
        out = vert(y, d.depth.values, d.time.dt.floor("D").values)
        ds = out.rename("armor").to_dataset()
        ds["tier"] = ("time", np.array([tier] * out.time.size))
        ds.to_netcdf(f)
        print("done", m, out.shape, "tier", tier, "| valid surf", round(float(out.isel(depth=0).notnull().mean()), 3),
              "| valid 1000m", round(float(out.isel(depth=14).notnull().mean()), 3), flush=True)
    except (OSError, RuntimeError, ValueError) as exc:
        print("FAILED", m, exc, flush=True)
        traceback.print_exc()
    for p in glob.glob(f"{RAW}/*"): os.remove(p)