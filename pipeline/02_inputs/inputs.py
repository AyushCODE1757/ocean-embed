import glob
import os
import sys

import copernicusmarine as cm
import numpy as np
import pandas as pd
import xarray as xr

VAR, Y0, Y1 = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
CFG = {
 "sst": ("analysed_sst", [("METOFFICE-GLO-SST-L4-REP-OBS-SST", "1981-10-01", "2026-03-31", "final")]),
 "sss": ("sos", [("cmems_obs-mob_glo_phy-sss_my_multi_P1D", "1993-01-01", "2024-12-15", "final"),
                 ("cmems_obs-mob_glo_phy-sss_nrt_multi_P1D", "2024-12-16", "2026-09-24", "nrt")]),
 "sla": ("sla", [("cmems_obs-sl_glo_phy-ssh_my_allsat-l4-duacs-0.125deg_P1D", "1993-01-01", "2026-01-16", "final")]),
}
NAME, SRC = CFG[VAR]
RAW, OUT = f"/tmp/raw_{VAR}", f"/kaggle/working/inputs/{VAR}"
os.makedirs(RAW, exist_ok=True); os.makedirs(OUT, exist_ok=True)
LAT = np.arange(5, 30.01, 0.25); LON = np.arange(45, 105.01, 0.25)

def edges(c):
    s = float(np.median(np.diff(c)))
    return np.append(c - s / 2, c[-1] + s / 2)

def weights(out_c, in_c):
    oe, ie = edges(out_c), edges(in_c)
    lo = np.maximum(oe[:-1, None], ie[None, :-1])
    hi = np.minimum(oe[1:, None], ie[None, 1:])
    return (np.clip(hi - lo, 0, None) / (oe[1] - oe[0])).astype("float32")

def regrid(x, lat, lon):
    Wy, Wx = weights(LAT, lat), weights(LON, lon)
    valid = (~np.isnan(x)).astype("float32")
    num = Wy @ np.nan_to_num(x) @ Wx.T
    den = Wy @ valid @ Wx.T
    return np.where(den > 0.5, num / np.maximum(den, 1e-6), np.nan).astype("float32")

for m in pd.period_range(f"{Y0}-01", f"{Y1}-12", freq="M"):
    f = f"{OUT}/{m}.nc"
    if os.path.exists(f): continue
    parts, tiers, want = [], [], 0
    try:
        for ds_id, a, b, tier in SRC:
            s = max(m.start_time.normalize(), pd.Timestamp(a))
            e = min(m.end_time.normalize(), pd.Timestamp(b))
            if s > e: continue
            want += (e - s).days + 1
            fn = f"{m}_{tier}.nc"
            cm.subset(dataset_id=ds_id, variables=[NAME],
                minimum_longitude=44.5, maximum_longitude=105.5,
                minimum_latitude=4.5, maximum_latitude=30.5,
                start_datetime=f"{s:%Y-%m-%d}T00:00:00", end_datetime=f"{e:%Y-%m-%d}T23:59:59",
                output_directory=RAW, output_filename=fn, overwrite=True)
            da = xr.open_dataset(f"{RAW}/{fn}")[NAME].load()
            if "depth" in da.dims: da = da.isel(depth=0, drop=True)
            x = da.values.astype("float32")
            if VAR == "sst" and np.nanmean(x) > 100: x = x - 273.15
            y = regrid(x, da.latitude.values, da.longitude.values)
            parts.append(xr.DataArray(y, dims=("time", "latitude", "longitude"),
                coords={"time": da.time.dt.floor("D").values, "latitude": LAT, "longitude": LON}))
            tiers += [tier] * da.time.size
        out = xr.concat(parts, dim="time")
        assert out.shape[1:] == (101, 241), out.shape
        ds = out.to_dataset(name=VAR); ds["tier"] = ("time", np.array(tiers))
        ds.to_netcdf(f)
        print("done", m, out.shape[0], "of", want, "days | valid frac", round(float(np.isfinite(out.values).mean()), 3), flush=True)
    except (OSError, RuntimeError, ValueError) as exc:
        print("FAILED", m, exc, flush=True)
    for p in glob.glob(f"{RAW}/*"): os.remove(p)