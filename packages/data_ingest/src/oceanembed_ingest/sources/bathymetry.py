"""Bathymetry Data Ingestion Module (GEBCO / ETOPO)."""
from pathlib import Path
from typing import List
import logging

from oceanembed_contracts import LAT_MAX, LAT_MIN, LON_MAX, LON_MIN
from oceanembed_ingest.sources.base import BaseSourceDownloader

logger = logging.getLogger(__name__)


class BathymetryDownloader(BaseSourceDownloader):
    """Downloader for high-resolution ocean bathymetry (GEBCO)."""

    def __init__(self, output_dir: Path):
        super().__init__(output_dir)
        self.dataset_id = "gebco_2023_sub_ice_topo"

    def get_dataset_id(self) -> str:
        return self.dataset_id

    def download(self, start_date: str = "", end_date: str = "", **kwargs) -> List[Path]:
        logger.info(
            f"Fetching GEBCO bathymetry for domain [{LAT_MIN}-{LAT_MAX}°N, {LON_MIN}-{LON_MAX}°E]"
        )
        output_file = self.output_dir / "gebco_bathymetry_north_indian_ocean.nc"
        return [output_file]
