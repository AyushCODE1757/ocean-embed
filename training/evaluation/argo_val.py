import glob
import json
import warnings

import numpy as np
import pandas as pd
import xarray as xr

warnings.filterwarnings("ignore")
R = "/kaggle/input/datasets/ayushkam"
g = lambda p: sorted(glob.glob(p, recursive=True))
DEPTHS = np.array([0,5,10,20,30,50,75,100,125,150,200,300,500,700,1000])
ds = xr.open_zarr(g(f"{R}/cube-v1/**/cube.zarr")[0])
clim = xr.open_dataset(g(f"{R}/cube-v1/**/clim.nc")[0])["clim"].values
with open(g(f"{R}/cube-v1/**/norm_splits.json")[0]) as source:
    S = json.load(source)["splits"]["test"]
t = ds.temp.sel(time=slice(*S))
tidx = {d: i for i, d in enumerate(pd.DatetimeIndex(t.time.values).normalize())}
truth = t.values
cl = clim[t.time.dt.dayofyear.values - 1]
arm = xr.open_mfdataset(g(f"{R}/armor3d/**/20*.nc"), combine="by_coords")["armor"].reindex(time=t.time).values
P = {"clim": cl, "armor3d": arm, "glorys": truth}
mp = g(f"{R}/model-v1/**/pred_test.npy")
if mp: P["model"] = np.load(mp[0])
df = pd.read_parquet(g(f"{R}/argo-dataset/**/argo_profiles.parquet")[0],
                     columns=["PLATFORM_NUMBER", "CYCLE_NUMBER", "DATA_MODE", "PRES", "TEMP", "LATITUDE", "LONGITUDE", "TIME", "TEMP_QC", "PRES_QC", "POSITION_QC", "TIME_QC"])
for c in ["TEMP_QC", "PRES_QC", "POSITION_QC", "TIME_QC"]: df[c] = pd.to_numeric(df[c], errors="coerce")
df = df[(df.TEMP_QC == 1) & (df.PRES_QC == 1) & (df.POSITION_QC == 1) & (df.TIME_QC == 1)].dropna(subset=["TEMP", "PRES"])
rows = []
for (p, c), x in df.groupby(["PLATFORM_NUMBER", "CYCLE_NUMBER"]):
    x = x.sort_values("PRES"); pr, tp = x.PRES.values, x.TEMP.values
    day = x.TIME.min().normalize()
    la, lo = float(x.LATITUDE.mean()), float(x.LONGITUDE.mean())
    i, j = round((la - 5) / 0.25), round((lo - 45) / 0.25)
    if day not in tidx or not (0 <= i < 101 and 0 <= j < 241) or len(pr) < 5: continue
    o = np.full(15, np.nan)
    for k, d in enumerate(DEPTHS):
        if d < pr[0]:
            if pr[0] - d <= 10: o[k] = tp[0]
        elif d <= pr[-1]:
            q = np.searchsorted(pr, d); gap = pr[min(q, len(pr) - 1)] - pr[max(q - 1, 0)]
            if gap <= (50 if d <= 300 else 200): o[k] = np.interp(d, pr, tp)
    rows.append((tidx[day], i, j, la, lo, day.month, x.DATA_MODE.value_counts().idxmax(), o))
di, ii, jj = (np.array([r[n] for r in rows]) for n in (0, 1, 2))
lat, lon, mon = (np.array([r[n] for r in rows]) for n in (3, 4, 5))
mode = np.array([r[6] for r in rows]); obs = np.stack([r[7] for r in rows])
pred = {k: v[di, :, ii, jj] for k, v in P.items()}
valid = ~np.isnan(obs)
for v in pred.values(): valid &= ~np.isnan(v)
basin = np.where((lat >= 8) & (lon <= 77), "ArabianSea", np.where((lat >= 8) & (lon >= 80) & (lon <= 100), "BayOfBengal", "other"))
season = np.select([np.isin(mon, [3, 4, 5]), np.isin(mon, [6, 7, 8, 9]), np.isin(mon, [10, 11])], ["premonsoon", "swmonsoon", "postmonsoon"], "winter")
print("profiles matched:", len(rows), "| modes:", dict(zip(*np.unique(mode, return_counts=True))), "| models:", list(P))
def table(sel):
    res = {k: {"rmse": [], "bias": [], "acorr": []} for k in P}; ns = []
    for d in range(15):
        m = sel & valid[:, d]; ns.append(int(m.sum()))
        for k in P:
            ok = m.sum() > 5
            e = pred[k][m, d] - obs[m, d]
            res[k]["rmse"].append(float(np.sqrt((e ** 2).mean())) if ok else np.nan)
            res[k]["bias"].append(float(e.mean()) if ok else np.nan)
            res[k]["acorr"].append(float(np.corrcoef(pred[k][m, d] - pred["clim"][m, d], obs[m, d] - pred["clim"][m, d])[0, 1]) if ok and k != "clim" else np.nan)
    return {"n": ns, **res}
def show(title, T):
    print(title); print("depth     n  " + "  ".join(f"{k:>8}" for k in P))
    for d in range(15): print(f"{DEPTHS[d]:>5} {T['n'][d]:>5}  " + "  ".join(f"{T[k]['rmse'][d]:8.3f}" for k in P))
allp = np.ones(len(rows), bool)
out = {"depth": DEPTHS.tolist(), "all": table(allp), "delayed": table(mode == "D")}
show("RMSE vs Argo, all profiles", out["all"]); show("RMSE vs Argo, delayed-mode only", out["delayed"])
for nm, arr in [("basin", basin), ("season", season)]:
    out[nm] = {u: table(arr == u) for u in np.unique(arr)}
    print(nm, "RMSE at 100 m (clim / model-or-armor3d)")
    for u in np.unique(arr): print(f"  {u:>12}", {k: round(out[nm][u][k]['rmse'][7], 3) for k in P})
with open("/kaggle/working/argo_validation.json", "w") as destination:
    json.dump(out, destination, indent=1)