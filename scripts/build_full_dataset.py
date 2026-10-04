"""Full Dataset Builder Script for OceanEmbed (2015–2025).

Downloads real Copernicus Marine data for all four products, then harmonizes
into compressed Zarr stores consumed by ML Core (Person B).

Splits:
  Train  : 2015-04-01 – 2022-12-31
  Val    : 2023-01-01 – 2023-12-31
  Test   : 2024-01-01 – 2025-12-31

Usage
-----
# Full download + harmonize (will take many hours; ~8-12 GB disk for NIO subset):
  python scripts/build_full_dataset.py

# Download only one product for a short date range (for testing):
  python scripts/build_full_dataset.py --product glorys_target \
      --start-date 2023-01-01 --end-date 2023-01-07

# Skip download, only harmonize from already-downloaded raw files:
  python scripts/build_full_dataset.py --harmonize-only

Credentials
-----------
Set COPERNICUS_USERNAME and COPERNICUS_PASSWORD in your .env file, or run:
  copernicusmarine login
to store them in ~/.copernicusmarine/credentials.
"""

from __future__ import annotations

import argparse
import logging
import os
import sys
from datetime import datetime, timedelta
from pathlib import Path

# Load .env so credentials are available as env vars before anything else
try:
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parent.parent / ".env")
except ImportError:
    pass  # python-dotenv not installed; rely on shell env or copernicusmarine login

# Make local packages importable when running as a script (not via uv)
_ROOT = Path(__file__).resolve().parent.parent
for _pkg in [
    "contracts/python",
    "packages/harmonize/src",
    "packages/data_ingest/src",
    "packages/evaluation/src",
]:
    _p = str(_ROOT / _pkg)
    if _p not in sys.path:
        sys.path.insert(0, _p)

from oceanembed_contracts import (  # noqa: E402
    TEST_END_DATE,
    TRAIN_START_DATE,
)
from oceanembed_harmonize.builder import HarmonizePipelineBuilder  # noqa: E402
from oceanembed_ingest.sources.argo import ArgoProfilesDownloader  # noqa: E402
from oceanembed_ingest.sources.copernicus import (  # noqa: E402
    AllProductsDownloader,
    CopernicusDownloader,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
)
logger = logging.getLogger("build_full_dataset")


# ── Date helpers ──────────────────────────────────────────────────────────────


def _date_range(start: str, end: str) -> list[str]:
    s = datetime.strptime(start, "%Y-%m-%d")
    e = datetime.strptime(end, "%Y-%m-%d")
    return [(s + timedelta(days=i)).strftime("%Y-%m-%d") for i in range((e - s).days + 1)]


# ── Download step ─────────────────────────────────────────────────────────────


def run_download(
    start_date: str,
    end_date: str,
    raw_dir: Path,
    argo_dir: Path,
    username: str | None = None,
    password: str | None = None,
    product: str | None = None,
) -> dict[str, list[Path]]:
    """Download Copernicus products and Argo profiles.

    Args:
        start_date, end_date : date range (inclusive).
        raw_dir              : where NetCDF files land.
        argo_dir             : where argo_profiles.parquet lands.
        username, password   : Copernicus credentials (optional; falls back to env /
            ~/.copernicusmarine/credentials).
        product              : if set, download only this product key; otherwise all four.

    Returns:
        {product_key: [Path, ...]} mapping.
    """
    creds = dict(username=username, password=password)

    if product:
        # Single product mode
        logger.info(f"Downloading single product: {product}")
        dl = CopernicusDownloader(
            output_dir=raw_dir / product,
            product_key=product,
            **creds,
        )
        results = {product: dl.download(start_date, end_date)}
    else:
        # All four products
        logger.info("Downloading all four Copernicus products...")
        all_dl = AllProductsDownloader(output_dir=raw_dir, **creds)
        results = all_dl.download_all(start_date, end_date)

    # Argo profiles (best-effort; uses argopy if installed)
    logger.info("Fetching Argo float profiles...")
    argo_dl = ArgoProfilesDownloader(output_dir=argo_dir)
    argo_files = argo_dl.download(start_date, end_date)
    results["argo"] = argo_files

    return results


# ── Harmonize step ────────────────────────────────────────────────────────────


def run_harmonize(
    raw_dir: Path,
    cubes_dir: Path,
    qc_path: Path,
) -> dict[str, Path]:
    """Run harmonization pipeline: regrid → vertical interp → mask tightening → Zarr."""
    logger.info("Starting harmonization pipeline...")
    builder = HarmonizePipelineBuilder(raw_dir=raw_dir, output_cubes_dir=cubes_dir)
    return builder.build_all(qc_output_path=qc_path)


# ── Summary ───────────────────────────────────────────────────────────────────


def _print_summary(dates: list[str], results: dict, zarr_results: dict | None = None) -> None:
    logger.info("=" * 60)
    logger.info("DATASET BUILD SUMMARY")
    logger.info("=" * 60)
    logger.info(f"Date range   : {dates[0]} → {dates[-1]}")
    logger.info(f"Total days   : {len(dates)}")
    for key, files in results.items():
        logger.info(f"  {key:30s}: {len(files)} files")
    if zarr_results:
        logger.info("Zarr stores written:")
        for name, path in zarr_results.items():
            size_mb = sum(f.stat().st_size for f in Path(path).rglob("*") if f.is_file()) / 1e6
            logger.info(f"  {name:20s}: {path}  ({size_mb:.1f} MB)")
    logger.info("=" * 60)


# ── CLI ───────────────────────────────────────────────────────────────────────


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "OceanEmbed Full Dataset Builder — downloads real Copernicus data "
            "and harmonizes to Zarr."
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "--start-date",
        default=TRAIN_START_DATE,
        help="Start date YYYY-MM-DD (default: %(default)s)",
    )
    parser.add_argument(
        "--end-date", default=TEST_END_DATE, help="End date YYYY-MM-DD (default: %(default)s)"
    )
    parser.add_argument("--raw-dir", default="data/raw", help="Output dir for raw NetCDF files")
    parser.add_argument("--cubes-dir", default="data/cubes", help="Output dir for Zarr cubes")
    parser.add_argument("--argo-dir", default="data/argo", help="Output dir for Argo parquet")
    parser.add_argument(
        "--product",
        default=None,
        choices=["glorys_target", "ostia_sst", "duacs_sla", "armor3d_benchmark"],
        help="Download only one product (default: all four)",
    )
    parser.add_argument(
        "--download-only", action="store_true", help="Skip harmonization after download"
    )
    parser.add_argument(
        "--harmonize-only",
        action="store_true",
        help="Skip download, only harmonize existing raw files",
    )
    parser.add_argument(
        "--username", default=None, help="Copernicus username (overrides env / credentials file)"
    )
    parser.add_argument(
        "--password", default=None, help="Copernicus password (overrides env / credentials file)"
    )

    args = parser.parse_args()

    raw_dir = Path(args.raw_dir)
    cubes_dir = Path(args.cubes_dir)
    argo_dir = Path(args.argo_dir)
    qc_path = Path("data/qc_report.json")

    raw_dir.mkdir(parents=True, exist_ok=True)
    cubes_dir.mkdir(parents=True, exist_ok=True)
    argo_dir.mkdir(parents=True, exist_ok=True)

    dates = _date_range(args.start_date, args.end_date)

    # ── Step 1: Download ──────────────────────────────────────────────────────
    download_results: dict = {}
    if not args.harmonize_only:
        download_results = run_download(
            start_date=args.start_date,
            end_date=args.end_date,
            raw_dir=raw_dir,
            argo_dir=argo_dir,
            username=args.username or os.environ.get("COPERNICUS_USERNAME"),
            password=args.password or os.environ.get("COPERNICUS_PASSWORD"),
            product=args.product,
        )
    else:
        logger.info("--harmonize-only: skipping download step.")

    # ── Step 2: Harmonize ─────────────────────────────────────────────────────
    zarr_results: dict | None = None
    if not args.download_only:
        zarr_results = run_harmonize(raw_dir=raw_dir, cubes_dir=cubes_dir, qc_path=qc_path)
    else:
        logger.info("--download-only: skipping harmonization step.")

    _print_summary(dates, download_results, zarr_results)


if __name__ == "__main__":
    main()
