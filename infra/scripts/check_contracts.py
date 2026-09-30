"""Check A's and B's delivered files against what serving assumes. Read-only; prints PASS/FAIL.
Usage:
  uv run --package oceanembed-serving python infra/scripts/check_contracts.py \
      --predictions artifacts/predictions/current/predictions.zarr \
      --metrics data/metrics/metrics.json \
      --gaps artifacts/advisor/gaps/2024-01-01.json --osse artifacts/advisor/osse.json \
      --argo data/argo/argo_profiles.parquet --targets data/cubes/cube_targets.zarr
Exit code is 1 if any check fails."""
import argparse
import json
import sys
from pathlib import Path

import numpy as np
import xarray as xr

from oceanembed_serving.schemas import Gaps, Osse
from oceanembed_serving.settings import Settings

FAILS: list[str] = []


def check(ok: bool, msg: str) -> None:
    print(("PASS  " if ok else "FAIL  ") + msg)
    if not ok:
        FAILS.append(msg)


def describe(obj, depth: int = 2, indent: str = "      ") -> None:
    """Print the real structure of a JSON value so we learn A's inner shapes."""
    if isinstance(obj, dict):
        for k, v in list(obj.items())[:12]:
            kind = type(v).__name__
            extra = f" len={len(v)}" if isinstance(v, (list, dict)) else f" = {v!r}"
            print(f"{indent}{k}: {kind}{extra}")
            if depth > 1 and isinstance(v, (dict, list)) and v:
                describe(v if isinstance(v, dict) else v[0], depth - 1, indent + "  ")


def predictions(path: Path, s: Settings) -> None:
    try:
        ds = xr.open_zarr(str(path), consolidated=None)
    except Exception as exc:
        check(False, f"predictions: cannot open {path}: {exc}")
        return
    check("temp_mean" in ds, "predictions: variable temp_mean exists")
    if "temp_mean" not in ds:
        return
    check(
        ds["temp_mean"].dims == ("time", "depth", "lat", "lon"),
        f"predictions: temp_mean dims are (time, depth, lat, lon); found {ds['temp_mean'].dims}",
    )
    check(
        "temp_spread" in ds,
        "predictions: temp_spread exists (optional; uncertainty endpoint needs it)",
    )
    check(
        list(ds["depth"].values.astype(int)) == list(s.depths_m),
        "predictions: depth values are the 15 SIH depths in metres",
    )
    lat, lon = ds["lat"].values, ds["lon"].values
    check(
        np.allclose(lat, np.arange(s.lat_min, s.lat_max + 1e-9, s.step)),
        "predictions: lat is 5..30 step 0.25 ascending",
    )
    check(
        np.allclose(lon, np.arange(s.lon_min, s.lon_max + 1e-9, s.step)),
        "predictions: lon is 45..105 step 0.25 ascending",
    )
    check(np.issubdtype(ds["time"].dtype, np.datetime64), "predictions: time is datetime64")
    sample = ds["temp_mean"].isel(time=0, depth=0).values
    check(bool(np.isfinite(sample).any()), "predictions: first slice has ocean values")
    finite = sample[np.isfinite(sample)]
    check(
        finite.size == 0 or (-3 < finite.min() and finite.max() < 40),
        "predictions: surface values look like degC (-3..40)",
    )
    check(bool(np.isnan(sample).any()), "predictions: land/invalid cells are NaN")


def metrics(path: Path, s: Settings) -> None:
    from oceanembed_serving.routers.evidence import REQUIRED_KEYS

    try:
        raw = json.loads(path.read_text())
    except Exception as exc:
        check(False, f"metrics: cannot read {path}: {exc}")
        return
    missing = REQUIRED_KEYS - set(raw)
    check(not missing, f"metrics: all required top-level keys present (missing: {sorted(missing)})")
    check(isinstance(raw.get("is_sample_slice"), bool), "metrics: is_sample_slice is a boolean")
    print("      inner structure (send this to C if the UI needs a specific shape):")
    describe(raw)


def argo(path: Path) -> None:
    import pandas as pd

    try:
        df = pd.read_parquet(path)
    except Exception as exc:
        check(False, f"argo: cannot open {path}: {exc}")
        return
    need = {
        "platform_id", "cycle_number", "timestamp", "latitude", "longitude",
        "depth", "temperature", "temp_qc", "data_mode",
    }
    check(
        need <= set(df.columns),
        f"argo: required columns present (missing: {sorted(need - set(df.columns))})",
    )
    if need <= set(df.columns):
        check(set(df["temp_qc"].unique()) <= {1, 2}, "argo: temp_qc only contains 1 or 2")
        check(
            set(df["data_mode"].unique()) <= {"D", "A", "R"},
            "argo: data_mode in D/A/R",
        )
        check(
            bool(pd.to_datetime(df["timestamp"], utc=True, errors="coerce").notna().all()),
            "argo: every timestamp parses as ISO8601",
        )


def targets(path: Path, s: Settings) -> None:
    try:
        ds = xr.open_zarr(str(path), consolidated=None)
    except Exception as exc:
        check(False, f"targets: cannot open {path}: {exc}")
        return
    check("temp" in ds, "targets: variable temp exists")
    if "temp" in ds:
        check(
            ds["temp"].dims == ("time", "depth", "lat", "lon"),
            f"targets: temp dims (time, depth, lat, lon); found {ds['temp'].dims}",
        )
        check(
            ds["temp"].shape[1:] == (15, 101, 241),
            f"targets: temp spatial shape is (15, 101, 241); found {ds['temp'].shape[1:]}",
        )
        check(
            np.allclose(ds["depth"].values, s.depths_m),
            "targets: depth values are the 15 SIH depths",
        )


def model_file(path: Path, model, name: str) -> None:
    try:
        model(**json.loads(path.read_text()))
        check(True, f"{name}: file matches the assumed shape")
    except Exception as exc:
        check(False, f"{name}: {path} does not match the assumed shape: {exc}")


def main() -> None:
    ap = argparse.ArgumentParser()
    for name in ("predictions", "metrics", "gaps", "osse", "argo", "targets"):
        ap.add_argument(f"--{name}", type=Path)
    a = ap.parse_args()
    s = Settings()
    if a.predictions:
        predictions(a.predictions, s)
    if a.metrics:
        metrics(a.metrics, s)
    if a.argo:
        argo(a.argo)
    if a.targets:
        targets(a.targets, s)
    if a.gaps:
        model_file(a.gaps, Gaps, "gaps")
    if a.osse:
        model_file(a.osse, Osse, "osse")
    print(f"\n{len(FAILS)} check(s) failed")
    sys.exit(1 if FAILS else 0)


if __name__ == "__main__":
    main()
