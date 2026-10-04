import os

import pandas as pd
from argopy import DataFetcher

os.makedirs("/kaggle/working/argo", exist_ok=True)
parts = []
for q in pd.period_range("2024-01", "2025-12", freq="Q"):
    try:
        ds = DataFetcher(mode="standard").region([45, 105, 5, 30, 0, 1100,
              f"{q.start_time:%Y-%m-%d}", f"{q.end_time + pd.Timedelta(days=1):%Y-%m-%d}"]).to_xarray()
        df = ds.to_dataframe().reset_index()
        parts.append(df); print("done", q, len(df), flush=True)
    except (OSError, RuntimeError, ValueError) as exc:
        print("FAILED", q, repr(exc)[:200], flush=True)
if parts:
    pd.concat(parts).to_parquet("/kaggle/working/argo/argo_profiles.parquet")