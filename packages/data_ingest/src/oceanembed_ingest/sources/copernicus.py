"""Copernicus Marine Data Ingestion Module.

Handles downloading and subsetting of:
- OSTIA SST (0.05° daily)        → surface_obs_<date>.nc  (channel: sst)
- DUACS SLA / SSH (0.25° daily)  → surface_obs_<date>.nc  (channels: sla, ucur, vcur)
- GLORYS12V1 (1/12° 50-level)   → glorys_target_<date>.nc (variable: thetao)
- ARMOR3D 3D T benchmark (1/8°) → armor3d_benchmark_<date>.nc (variable: to)

All subsets are spatially clipped to the North Indian Ocean domain:
  lat 5–30°N, lon 45–105°E.

Credentials are loaded from the environment (COPERNICUS_USERNAME / COPERNICUS_PASSWORD)
or from the `~/.copernicusmarine/credentials` file written by `copernicusmarine login`.
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional

import numpy as np

from oceanembed_contracts import LAT_MAX, LAT_MIN, LON_MAX, LON_MIN
from oceanembed_ingest.sources.base import BaseSourceDownloader

logger = logging.getLogger(__name__)

# ── Copernicus Marine Official Product & Variable IDs ────────────────────────
# IDs verified against the Copernicus Marine catalogue (v2 toolbox, 2024).
# Run `copernicusmarine describe --dataset-id <id>` to check availability.
COPERNICUS_DATASETS: Dict[str, Dict] = {
    "ostia_sst": {
        # OSTIA SST L4 NRT (0.05° daily)
        "dataset_id": "SST_GLO_SST_L4_NRT_OBSERVATIONS_010_001",
        "variables": ["analysed_sst"],
        "out_prefix": "surface_sst",
    },
    "duacs_sla": {
        # DUACS Multimission SLA (0.25° daily, MY reprocessed)
        "dataset_id": "SEALEVEL_GLO_PHY_L4_MY_008_047",
        "variables": ["sla", "ugosa", "vgosa"],
        "out_prefix": "surface_sla",
    },
    "glorys_target": {
        # GLORYS12V1 — Global Ocean Physics Reanalysis (1/12°, 50 levels, 1993–present)
        # Product ID confirmed: GLOBAL_REANALYSIS_PHY_001_030
        # dataset_id inside the product: cmems_mod_glo_phy_my_0.083deg_P1D-m
        "dataset_id": "cmems_mod_glo_phy_my_0.083deg_P1D-m",
        "variables": ["thetao"],
        "out_prefix": "glorys_target",
        "min_depth": 0.0,
        "max_depth": 1100.0,
    },
    "armor3d_benchmark": {
        # ARMOR3D — 3D Global Multidisciplinary Ocean product (1/4°)
        # Product: MULTIOBS_GLO_PHY_TSUV_3D_MYNRT_015_012
        "dataset_id": "dataset-armor-3d-rep-weekly",
        "variables": ["to"],
        "out_prefix": "armor3d_benchmark",
        "min_depth": 0.0,
        "max_depth": 1100.0,
    },
}


class CopernicusDownloader(BaseSourceDownloader):
    """Downloads and spatially subsets Copernicus Marine Service products.

    Credentials are resolved in this order:
      1. `username` / `password` constructor args (explicit override)
      2. COPERNICUS_USERNAME / COPERNICUS_PASSWORD environment variables
      3. ~/.copernicusmarine/credentials  (written by `copernicusmarine login`)

    Usage
    -----
    >>> dl = CopernicusDownloader(output_dir=Path("data/raw"), product_key="glorys_target")
    >>> files = dl.download("2023-01-01", "2023-01-31")
    """

    def __init__(
        self,
        output_dir: Path,
        product_key: str = "glorys_target",
        username: Optional[str] = None,
        password: Optional[str] = None,
    ):
        super().__init__(output_dir)
        if product_key not in COPERNICUS_DATASETS:
            raise ValueError(
                f"Unknown product_key '{product_key}'. "
                f"Choose from: {list(COPERNICUS_DATASETS.keys())}"
            )
        self.product_key = product_key
        self.cfg = COPERNICUS_DATASETS[product_key]
        self.dataset_id: str = self.cfg["dataset_id"]

        # Credential resolution
        self.username = (
            username
            or os.environ.get("COPERNICUS_USERNAME")
        )
        self.password = (
            password
            or os.environ.get("COPERNICUS_PASSWORD")
        )

    def get_dataset_id(self) -> str:
        return self.dataset_id

    # ── Public API ────────────────────────────────────────────────────────────

    def download(
        self,
        start_date: str,
        end_date: str,
        chunk_mode: str = "monthly",
        **kwargs,
    ) -> List[Path]:
        """Download Copernicus Marine subset for the NIO domain.

        Args:
            start_date:  First date to download, 'YYYY-MM-DD'.
            end_date:    Last date to download,  'YYYY-MM-DD'.
            chunk_mode:  How to split the download into files:
                         - 'monthly'  (default) — 1 NetCDF per calendar month (~450 MB).
                           Best for production: few files, easy to retry a month.
                         - 'daily'    — 1 NetCDF per calendar day (~15 MB).
                           Fine-grained retry, but creates ~3,900 files for 2015-2025.
                         - 'yearly'   — 1 NetCDF per year (~5.4 GB).
                           Fewest files; one failure = re-download a whole year.

        Returns:
            Sorted list of downloaded NetCDF paths.
        """
        try:
            import copernicusmarine
        except ImportError as exc:
            raise RuntimeError(
                "copernicusmarine package is not installed. "
                "Run: pip install copernicusmarine"
            ) from exc

        if chunk_mode == "monthly":
            chunks = _month_chunks(start_date, end_date)
            label = "monthly chunks"
        elif chunk_mode == "yearly":
            chunks = _year_chunks(start_date, end_date)
            label = "yearly chunks"
        elif chunk_mode == "daily":
            chunks = [(d, d) for d in _date_range(start_date, end_date)]
            label = "daily slices"
        else:
            raise ValueError(f"chunk_mode must be 'daily', 'monthly', or 'yearly', got '{chunk_mode}'")

        logger.info(
            f"[{self.product_key}] Downloading {len(chunks)} {label} "
            f"({start_date} → {end_date}), "
            f"domain lat=[{LAT_MIN},{LAT_MAX}] lon=[{LON_MIN},{LON_MAX}]"
        )

        downloaded: List[Path] = []
        for chunk_start, chunk_end in chunks:
            path = self._download_chunk(copernicusmarine, chunk_start, chunk_end, chunk_mode)
            if path is not None:
                downloaded.append(path)

        logger.info(
            f"[{self.product_key}] Done — {len(downloaded)}/{len(chunks)} files downloaded."
        )
        return sorted(downloaded)


    # ── Internal helpers ──────────────────────────────────────────────────────

    def _download_chunk(
        self,
        cm,
        chunk_start: str,
        chunk_end: str,
        chunk_mode: str,
    ) -> Optional[Path]:
        """Subset and save one chunk (day / month / year). Returns path or None on skip."""
        prefix = self.cfg["out_prefix"]

        # Build a descriptive filename based on chunk mode
        if chunk_mode == "monthly":
            tag = chunk_start[:7]           # '2023-01'
        elif chunk_mode == "yearly":
            tag = chunk_start[:4]           # '2023'
        else:
            tag = chunk_start               # '2023-01-15'

        out_file = self.output_dir / f"{prefix}_{tag}.nc"

        if out_file.exists():
            logger.debug(f"  [skip] {out_file.name} already exists.")
            return out_file

        start_dt = f"{chunk_start}T00:00:00"
        end_dt   = f"{chunk_end}T23:59:59"

        # Base kwargs for copernicusmarine.subset() v2.x
        subset_kwargs: Dict = dict(
            dataset_id=self.dataset_id,
            variables=self.cfg["variables"],
            minimum_latitude=float(LAT_MIN),
            maximum_latitude=float(LAT_MAX),
            minimum_longitude=float(LON_MIN),
            maximum_longitude=float(LON_MAX),
            start_datetime=start_dt,
            end_datetime=end_dt,
            output_filename=str(out_file.name),
            output_directory=str(self.output_dir),
        )

        # Depth range (3D products only)
        if "min_depth" in self.cfg:
            subset_kwargs["minimum_depth"] = self.cfg["min_depth"]
            subset_kwargs["maximum_depth"] = self.cfg["max_depth"]

        # Credentials — only pass if explicitly set; otherwise the toolbox
        # reads ~/.copernicusmarine/credentials written by `copernicusmarine login`
        if self.username:
            subset_kwargs["username"] = self.username
        if self.password:
            subset_kwargs["password"] = self.password

        try:
            logger.info(f"  → Fetching {self.dataset_id} [{chunk_start} → {chunk_end}] ...")
            cm.subset(**subset_kwargs)
            logger.info(f"  ✓ Saved: {out_file.name}")
            return out_file

        except Exception as exc:
            logger.error(
                f"  ✗ Failed to download {self.dataset_id} [{chunk_start} → {chunk_end}]: {exc}"
            )
            return None



# ── Convenience multi-product downloader ─────────────────────────────────────

class AllProductsDownloader:
    """Downloads all four required Copernicus products for a date range.

    Products downloaded:
      - GLORYS12V1 subsurface reanalysis  (target temperatures)
      - OSTIA SST                         (surface temperature channel)
      - DUACS SLA                         (sea-level anomaly + geostrophic currents)
      - ARMOR3D                           (benchmark / alternative product)

    Each product is saved to a separate sub-directory under `output_dir`.
    """

    PRODUCTS = ["glorys_target", "ostia_sst", "duacs_sla", "armor3d_benchmark"]

    def __init__(
        self,
        output_dir: Path,
        username: Optional[str] = None,
        password: Optional[str] = None,
    ):
        self.output_dir = Path(output_dir)
        self.downloaders: Dict[str, CopernicusDownloader] = {}
        for key in self.PRODUCTS:
            sub_dir = self.output_dir / key
            sub_dir.mkdir(parents=True, exist_ok=True)
            self.downloaders[key] = CopernicusDownloader(
                output_dir=sub_dir,
                product_key=key,
                username=username,
                password=password,
            )

    def download_all(self, start_date: str, end_date: str) -> Dict[str, List[Path]]:
        """Download all products for the date range. Returns dict of {product_key: [paths]}."""
        results: Dict[str, List[Path]] = {}
        for key, dl in self.downloaders.items():
            logger.info(f"=== Starting download: {key} ===")
            results[key] = dl.download(start_date, end_date)
        return results


# ── Utilities ─────────────────────────────────────────────────────────────────

def _date_range(start_date: str, end_date: str) -> List[str]:
    """Return list of 'YYYY-MM-DD' strings from start to end inclusive."""
    start = datetime.strptime(start_date, "%Y-%m-%d")
    end   = datetime.strptime(end_date,   "%Y-%m-%d")
    n_days = (end - start).days + 1
    return [(start + timedelta(days=i)).strftime("%Y-%m-%d") for i in range(n_days)]


def _month_chunks(start_date: str, end_date: str) -> List[tuple]:
    """Split date range into (month_start, month_end) pairs.

    Example: '2023-01-15' → '2023-03-10' yields:
        [('2023-01-15', '2023-01-31'),
         ('2023-02-01', '2023-02-28'),
         ('2023-03-01', '2023-03-10')]
    """
    import calendar
    start = datetime.strptime(start_date, "%Y-%m-%d")
    end   = datetime.strptime(end_date,   "%Y-%m-%d")

    chunks = []
    cur = start
    while cur <= end:
        # Last day of current month
        last_day = calendar.monthrange(cur.year, cur.month)[1]
        month_end = cur.replace(day=last_day)
        chunk_end = min(month_end, end)
        chunks.append((cur.strftime("%Y-%m-%d"), chunk_end.strftime("%Y-%m-%d")))
        # Move to first day of next month
        if cur.month == 12:
            cur = cur.replace(year=cur.year + 1, month=1, day=1)
        else:
            cur = cur.replace(month=cur.month + 1, day=1)

    return chunks


def _year_chunks(start_date: str, end_date: str) -> List[tuple]:
    """Split date range into (year_start, year_end) pairs.

    Example: '2022-06-01' → '2024-03-31' yields:
        [('2022-06-01', '2022-12-31'),
         ('2023-01-01', '2023-12-31'),
         ('2024-01-01', '2024-03-31')]
    """
    start = datetime.strptime(start_date, "%Y-%m-%d")
    end   = datetime.strptime(end_date,   "%Y-%m-%d")

    chunks = []
    cur_year = start.year
    while cur_year <= end.year:
        year_start = max(start, datetime(cur_year, 1, 1))
        year_end   = min(end,   datetime(cur_year, 12, 31))
        chunks.append((year_start.strftime("%Y-%m-%d"), year_end.strftime("%Y-%m-%d")))
        cur_year += 1

    return chunks

