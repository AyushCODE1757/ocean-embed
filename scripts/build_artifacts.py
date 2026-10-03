"""Build the serving artifact set from B's exported app_data snapshot.

Inputs (produced by training/pipeline/06_export/export.py on Kaggle):
    data/app_data/{meta,dates,results,
    argo_validation}.json
    data/app_data/{pred_model,truth_glorys,clim,ocean_mask}.npy
    data/app_data/argo.parquet

Outputs (consumed by the serving package):
    artifacts/predictions/current/predictions.zarr   temp_mean/truth/clim [time,depth,lat,lon]
    artifacts/eval/metrics.json                      contract-shaped skill tables (test years)
    runs/current/run_manifest.json                   provenance: sources, hashes, run identity

Every value written here originates from the app_data files - nothing is
synthesised. NaN tokens in the upstream JSONs become nulls.
"""

from __future__ import annotations

import hashlib
import json
import sys
from datetime import UTC, datetime
from pathlib import Path

import numpy as np
import xarray as xr

ROOT = Path(__file__).resolve().parents[1]
APP_DATA = ROOT / "data" / "app_data"
PRED_DIR = ROOT / "artifacts" / "predictions" / "current"
EVAL_DIR = ROOT / "artifacts" / "eval"
RUNS_DIR = ROOT / "runs" / "current"

INDEPENDENCE_NOTE = (
    "GLORYS is the training target; GLORYS, ARMOR3D and the SSS product all assimilate "
    "Argo, so Argo comparisons are not fully independent. GLORYS-vs-Argo and "
    "ARMOR3D-vs-Argo skill are reported alongside the model's for context."
)

METHOD_MAP = {
    "clim": "climatology",
    "armor3d": "armor3d",
    "glorys": "glorys",
    "model": "oceanembed",
}


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def decode(path: Path) -> np.ndarray:
    """int16 0.01-scale with nodata -32768 -> float32 degC with NaN."""
    raw = np.load(path, mmap_mode="r")
    out = raw.astype("float32") * np.float32(0.01)
    out[raw == -32768] = np.float32("nan")
    return out


def build_predictions(meta: dict, dates: list[str]) -> None:
    zarr_path = PRED_DIR / "predictions.zarr"
    PRED_DIR.mkdir(parents=True, exist_ok=True)
    lat = meta["lat0"] + np.arange(meta["shape"][0], dtype="float32") * meta["step"]
    lon = meta["lon0"] + np.arange(meta["shape"][1], dtype="float32") * meta["step"]
    coords = {
        "time": np.array(dates, dtype="datetime64[ns]"),
        "depth": np.array(meta["depths"], dtype="int32"),
        "lat": lat,
        "lon": lon,
    }
    mask_path = APP_DATA / "ocean_mask.npy"
    ds = xr.Dataset(
        coords=coords,
        data_vars={"valid_ocean_mask": (("lat", "lon"), np.load(mask_path).astype("bool"))},
    )
    encoding = {"valid_ocean_mask": {"chunks": [meta["shape"][0], meta["shape"][1]]}}
    ds.to_zarr(zarr_path, mode="w", encoding=encoding)
    print(f"wrote {zarr_path} (coords, ocean mask)")

    for name, fname in [
        ("temp_mean", "pred_model.npy"),
        ("temp_truth", "truth_glorys.npy"),
        ("temp_clim", "clim.npy"),
    ]:
        arr = decode(APP_DATA / fname)
        da = xr.DataArray(arr, dims=("time", "depth", "lat", "lon"), coords=coords, name=name)
        da.to_zarr(
            zarr_path,
            mode="a",
            encoding={name: {"chunks": [1, len(meta["depths"]), len(lat), len(lon)]}},
        )
        del arr
        print(f"wrote {name} from {fname}")

    try:  # consolidated metadata speeds the serving-side open
        xr.open_zarr(zarr_path).consolidate().to_zarr(zarr_path, mode="a", consolidated=True)
    except Exception as exc:  # non-fatal
        print(f"(consolidate skipped: {exc})")


def _rows_vs_glorys(results: dict, meta: dict, run_id: str) -> list[dict]:
    rows: list[dict] = []
    test = results["test"]
    for d, m, c in zip(test["depth"], test["model_rmse"], test["clim_rmse"], strict=True):
        rows.append(
            dict(
                run_id=run_id,
                method="oceanembed",
                depth_m=int(d),
                basin="all",
                season="all",
                rmse=float(m),
                bias=None,
                corr=None,
                n=0,
            )
        )
        rows.append(
            dict(
                run_id=run_id,
                method="climatology",
                depth_m=int(d),
                basin="all",
                season="all",
                rmse=float(c),
                bias=None,
                corr=None,
                n=0,
            )
        )
    return rows


def _rows_vs_argo(argo_val: dict, run_id: str) -> list[dict]:
    rows: list[dict] = []
    depth_axis = argo_val["depth"]

    def emit(table: dict, basin: str, season: str) -> None:
        n_list = table["n"]
        for src, method in METHOD_MAP.items():
            if src not in table:
                continue
            t = table[src]
            for i, d in enumerate(depth_axis):
                rows.append(
                    dict(
                        run_id=run_id,
                        method=method,
                        depth_m=int(d),
                        basin=basin,
                        season=season,
                        rmse=_f(t["rmse"][i]),
                        bias=_f(t.get("bias", [None])[i]),
                        corr=_f(t["acorr"][i]),
                        n=int(n_list[i]),
                    )
                )

    emit(argo_val["all"], "all", "all")
    if "delayed" in argo_val:
        emit(argo_val["delayed"], "all", "delayed")
    for basin, table in argo_val.get("basin", {}).items():
        emit(table, basin, "all")
    for season, table in argo_val.get("season", {}).items():
        emit(table, "all", season)
    return rows


def _f(v):
    return None if v is None else float(v)


def build_metrics(meta: dict, run_id: str) -> None:
    results = json.loads((APP_DATA / "results.json").read_text())
    argo_val = json.loads(
        (APP_DATA / "argo_validation.json").read_text(), parse_constant=lambda c: None
    )
    test_years = [int(y) for y in str(meta.get("test_years", "2024-2025")).split("-")]
    metrics = {
        "run_id": run_id,
        "test_years": test_years,
        "independence_note": INDEPENDENCE_NOTE,
        "rows": _rows_vs_glorys(results, meta, run_id) + _rows_vs_argo(argo_val, run_id),
    }
    EVAL_DIR.mkdir(parents=True, exist_ok=True)
    out = EVAL_DIR / "metrics.json"
    out.write_text(json.dumps(metrics, indent=1))
    print(f"wrote {out} ({len(metrics['rows'])} rows)")


def build_manifest(meta: dict, dates: list[str], run_id: str) -> None:
    files = {}
    for p in sorted(APP_DATA.iterdir()):
        if p.is_file():
            files[p.name] = {"bytes": p.stat().st_size, "sha256": sha256(p)}
    manifest = {
        "run_id": run_id,
        "model_id": "oceanembed-e1-mae",
        "created_utc": datetime.now(UTC).isoformat(timespec="seconds"),
        "artifact": "predictions.zarr (temp_mean/temp_truth/temp_clim, degC)",
        "source": "training/pipeline + training/models on Kaggle (see training/README.md)",
        "grid": {
            "lat0": meta["lat0"],
            "lon0": meta["lon0"],
            "step": meta["step"],
            "shape": meta["shape"],
            "depths_m": meta["depths"],
            "units": meta["units"],
        },
        "splits": {
            "train_years": meta.get("train_years"),
            "val_year": meta.get("val_year"),
            "test_years": meta.get("test_years"),
        },
        "export": {
            "dates": dates[0] + " .. " + dates[-1],
            "n_dates": len(dates),
            "every_n_days": meta.get("every_n_days"),
            "encoding": "source int16 scale 0.01, nodata -32768 -> NaN",
        },
        "source_tier": "final (2025 SSS and ARMOR3D near-real-time; see notes)",
        "notes": meta.get("notes"),
        "input_files": files,
    }
    RUNS_DIR.mkdir(parents=True, exist_ok=True)
    out = RUNS_DIR / "run_manifest.json"
    out.write_text(json.dumps(manifest, indent=1))
    print(f"wrote {out} ({len(files)} input files hashed)")


def main() -> int:
    if not (APP_DATA / "meta.json").exists():
        print(f"ERROR: {APP_DATA}/meta.json not found - drop B's app_data snapshot there first")
        return 1
    meta = json.loads((APP_DATA / "meta.json").read_text())
    dates = json.loads((APP_DATA / "dates.json").read_text())
    run_id = f"e1-mae-{meta.get('train_years', '2019-2022')}".replace(" ", "")
    build_predictions(meta, dates)
    build_metrics(meta, run_id)
    build_manifest(meta, dates, run_id)
    print("artifacts build complete")
    return 0


if __name__ == "__main__":
    sys.exit(main())
