"""Configuration and credentials for OceanEmbed data ingestion."""
from pathlib import Path
from typing import Optional
from pydantic import BaseModel, Field


class IngestConfig(BaseModel):
    raw_dir: Path = Path("data/raw")
    argo_dir: Path = Path("data/argo")
    manifest_path: Path = Path("data/manifest.json")
    
    # Copernicus Marine Credentials
    copernicus_username: Optional[str] = Field(None)
    copernicus_password: Optional[str] = Field(None)
    
    # Earthdata / PO.DAAC Credentials
    earthdata_username: Optional[str] = Field(None)
    earthdata_password: Optional[str] = Field(None)
    
    # Target Spatial Domain (North Indian Ocean)
    lat_min: float = 5.0
    lat_max: float = 30.0
    lon_min: float = 45.0
    lon_max: float = 105.0

    class Config:
        arbitrary_types_allowed = True
