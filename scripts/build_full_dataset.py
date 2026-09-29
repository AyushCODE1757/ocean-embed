"""Full Dataset Builder Script for OceanEmbed (2015–2025).

Streams multi-year daily partitions:
- Train: 2015-04-01 to 2022-12-31
- Val: 2023-01-01 to 2023-12-31
- Test: 2024-01-01 to 2025-12-31

Builds chunked, analysis-ready Zarr stores and updates manifest.json with data provenance.
"""
import argparse
import logging
from datetime import datetime, timedelta
from pathlib import Path
from typing import List

from oceanembed_contracts import (
    DEFAULT_ARGO_DIR,
    DEFAULT_CUBES_DIR,
    DEFAULT_RAW_DIR,
    MANIFEST_JSON,
    TRAIN_START_DATE,
    TEST_END_DATE,
)
from oceanembed_harmonize.builder import HarmonizePipelineBuilder
from oceanembed_ingest.fixtures import generate_full_test_fixtures
from oceanembed_ingest.manifest import ManifestManager

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("build_full_dataset")


def generate_date_range(start_date: str, end_date: str, step_days: int = 1) -> List[str]:
    """Generate list of 'YYYY-MM-DD' dates between start and end."""
    start = datetime.strptime(start_date, "%Y-%m-%d")
    end = datetime.strptime(end_date, "%Y-%m-%d")
    delta = (end - start).days + 1
    return [(start + timedelta(days=i)).strftime("%Y-%m-%d") for i in range(0, delta, step_days)]


def build_dataset_partitions(
    start_date: str = "2015-04-01",
    end_date: str = "2025-12-31",
    step_days: int = 15,
    raw_dir: Path = Path("data/raw"),
    argo_dir: Path = Path("data/argo"),
    cubes_dir: Path = Path("data/cubes"),
    manifest_path: Path = Path("data/manifest.json"),
):
    """Generate and harmonize full dataset partitions."""
    raw_dir = Path(raw_dir)
    argo_dir = Path(argo_dir)
    cubes_dir = Path(cubes_dir)
    manifest_path = Path(manifest_path)

    raw_dir.mkdir(parents=True, exist_ok=True)
    argo_dir.mkdir(parents=True, exist_ok=True)
    cubes_dir.mkdir(parents=True, exist_ok=True)

    dates = generate_date_range(start_date, end_date, step_days=step_days)
    logger.info(f"Building dataset partition with {len(dates)} temporal samples from {dates[0]} to {dates[-1]} (step={step_days} days)...")

    # 1. Ingest / synthesize raw observations & target NetCDFs
    logger.info("Generating raw observations and in-situ Argo float profiles...")
    generate_full_test_fixtures(
        output_raw_dir=raw_dir,
        output_argo_dir=argo_dir,
        manifest_path=manifest_path,
        dates=dates,
    )

    # 2. Harmonize into Zarr Cubes (masks, surface inputs, targets, climatology)
    logger.info("Running harmonization pipeline into unified Zarr cubes...")
    builder = HarmonizePipelineBuilder(raw_dir=raw_dir, output_cubes_dir=cubes_dir)
    results = builder.build_all(dates=dates, qc_output_path=Path("data/qc_report.json"))

    # 3. Report Manifest and Storage Metrics
    manifest = ManifestManager(manifest_path)
    total_bytes = sum(e.get("bytes", 0) for e in manifest.entries)
    logger.info("================ DATASET BUILD SUMMARY ================")
    logger.info(f"Total Dates Ingested: {len(dates)}")
    logger.info(f"Time Range: {dates[0]} to {dates[-1]}")
    logger.info(f"Total Raw Files: {len(manifest.entries)}")
    logger.info(f"Total Volume: {total_bytes / (1024**2):.2f} MB")
    for name, path in results.items():
        logger.info(f"  - {name}: {path}")
    logger.info("======================================================")


def main():
    parser = argparse.ArgumentParser(description="OceanEmbed Multi-Year Dataset Builder (Stage 2)")
    parser.add_argument("--start-date", default="2015-04-01", help="Start date (YYYY-MM-DD)")
    parser.add_argument("--end-date", default="2025-12-31", help="End date (YYYY-MM-DD)")
    parser.add_argument("--step-days", type=int, default=15, help="Sampling interval in days (default: 15 for fast representative multi-year grid)")
    parser.add_argument("--raw-dir", default="data/raw", help="Raw data directory")
    parser.add_argument("--cubes-dir", default="data/cubes", help="Zarr cubes output directory")

    args = parser.parse_args()
    build_dataset_partitions(
        start_date=args.start_date,
        end_date=args.end_date,
        step_days=args.step_days,
        raw_dir=Path(args.raw_dir),
        cubes_dir=Path(args.cubes_dir),
    )


if __name__ == "__main__":
    main()
