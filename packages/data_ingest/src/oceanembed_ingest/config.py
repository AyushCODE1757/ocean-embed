"""Configuration and credentials for OceanEmbed data ingestion.

Credentials are loaded from environment variables (set via .env file).
Never hardcode credentials here — .env is in .gitignore.
"""
import os
from pathlib import Path
from typing import Optional
from pydantic import BaseModel, Field


class IngestConfig(BaseModel):
    raw_dir: Path = Path("data/raw")
    argo_dir: Path = Path("data/argo")
    manifest_path: Path = Path("data/manifest.json")

    # Copernicus Marine Credentials — read from environment
    copernicus_username: Optional[str] = Field(
        default_factory=lambda: os.environ.get("COPERNICUS_USERNAME")
    )
    copernicus_password: Optional[str] = Field(
        default_factory=lambda: os.environ.get("COPERNICUS_PASSWORD")
    )

    # Earthdata / PO.DAAC Credentials — read from environment
    earthdata_username: Optional[str] = Field(
        default_factory=lambda: os.environ.get("EARTHDATA_USERNAME")
    )
    earthdata_password: Optional[str] = Field(
        default_factory=lambda: os.environ.get("EARTHDATA_PASSWORD")
    )

    # Target Spatial Domain (North Indian Ocean)
    lat_min: float = 5.0
    lat_max: float = 30.0
    lon_min: float = 45.0
    lon_max: float = 105.0

    class Config:
        arbitrary_types_allowed = True
