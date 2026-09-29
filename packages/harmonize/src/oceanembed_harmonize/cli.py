"""CLI interface for OceanEmbed harmonization pipeline."""
import argparse
from pathlib import Path

from oceanembed_harmonize.builder import HarmonizePipelineBuilder


def main():
    parser = argparse.ArgumentParser(description="OceanEmbed Harmonization Pipeline")
    parser.add_argument("--raw-dir", default="data/raw", help="Path to raw ingested NetCDFs")
    parser.add_argument("--cubes-dir", default="data/cubes", help="Path to output Zarr cubes")
    parser.add_argument("--qc-report", default="data/qc_report.json", help="Path to save QC JSON report")

    args = parser.parse_args()

    builder = HarmonizePipelineBuilder(raw_dir=Path(args.raw_dir), output_cubes_dir=Path(args.cubes_dir))
    results = builder.build_all(qc_output_path=Path(args.qc_report))
    print(f"Successfully harmonized cubes to {args.cubes_dir}:")
    for k, v in results.items():
        print(f"  - {k}: {v}")


if __name__ == "__main__":
    main()
