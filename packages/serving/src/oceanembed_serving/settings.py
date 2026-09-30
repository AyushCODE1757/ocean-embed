from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="OE_", env_file=".env", extra="ignore")

    predictions_path: Path = Path("artifacts/predictions/current/predictions.zarr")
    model_id: str = "unset"
    run_id: str = "unset"
    metrics_path: Path = Path("data/metrics/metrics.json")
    argo_path: Path = Path("data/argo/argo_profiles.parquet")
    targets_path: Path = Path("data/cubes/cube_targets.zarr")
    manifest_path: Path = Path("runs/current/run_manifest.json")
    advisor_dir: Path = Path("artifacts/advisor")
    cors_origins: list[str] = ["http://localhost:3000"]
    # Fixed by contracts/depths.yaml and contracts/grid.yaml. Keep in sync.
    depths_m: tuple[int, ...] = (0, 5, 10, 20, 30, 50, 75, 100, 125, 150, 200, 300, 500, 700, 1000)
    lat_min: float = 5.0
    lat_max: float = 30.0
    lon_min: float = 45.0
    lon_max: float = 105.0
    step: float = 0.25


@lru_cache
def get_settings() -> Settings:
    return Settings()
