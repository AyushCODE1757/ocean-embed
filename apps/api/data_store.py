from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT / "data" / "app_data"


@lru_cache(maxsize=1)
def load_meta() -> dict:
    return json.loads((DATA_DIR / "meta.json").read_text(encoding="utf-8"))


@lru_cache(maxsize=1)
def load_dates() -> list[str]:
    return json.loads((DATA_DIR / "dates.json").read_text(encoding="utf-8"))


@lru_cache(maxsize=1)
def load_results() -> dict:
    return json.loads((DATA_DIR / "results.json").read_text(encoding="utf-8"))


@lru_cache(maxsize=1)
def load_argo_validation() -> dict:
    return json.loads((DATA_DIR / "argo_validation.json").read_text(encoding="utf-8"))


@lru_cache(maxsize=1)
def load_argo() -> pd.DataFrame:
    return pd.read_parquet(DATA_DIR / "argo.parquet")


@lru_cache(maxsize=8)
def load_array(name: str) -> np.ndarray:
    return np.load(DATA_DIR / f"{name}.npy", mmap_mode="r")


def lat_grid() -> np.ndarray:
    meta = load_meta()
    lat0 = float(meta["lat0"])
    step = float(meta["step"])
    shape = tuple(meta["shape"])
    return np.linspace(lat0, lat0 + (shape[0] - 1) * step, shape[0], dtype=np.float32)


def lon_grid() -> np.ndarray:
    meta = load_meta()
    lon0 = float(meta["lon0"])
    step = float(meta["step"])
    shape = tuple(meta["shape"])
    return np.linspace(lon0, lon0 + (shape[1] - 1) * step, shape[1], dtype=np.float32)
