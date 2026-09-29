"""CLI interface for OceanEmbed data ingestion and fixture generation."""
import argparse
import sys
from pathlib import Path

from oceanembed_ingest.fixtures import generate_full_test_fixtures
from oceanembed_ingest.manifest import ManifestManager


def main():
    parser = argparse.ArgumentParser(description="OceanEmbed Data Ingestion CLI")
    subparsers = parser.add_subparsers(dest="command", required=True)

    # Fixtures command
    fixture_parser = subparsers.add_parser("generate-fixtures", help="Generate realistic test fixtures")
    fixture_parser.add_argument("--raw-dir", default="data/raw", help="Output directory for raw NetCDFs")
    fixture_parser.add_argument("--argo-dir", default="data/argo", help="Output directory for Argo parquet")
    fixture_parser.add_argument("--manifest", default="data/manifest.json", help="Manifest output path")

    # Manifest command
    manifest_parser = subparsers.add_parser("verify-manifest", help="Verify checksums in manifest.json")
    manifest_parser.add_argument("--manifest", default="data/manifest.json", help="Manifest path to check")

    args = parser.parse_args()

    if args.command == "generate-fixtures":
        print(f"Generating realistic fixtures in {args.raw_dir} and {args.argo_dir}...")
        files = generate_full_test_fixtures(
            output_raw_dir=Path(args.raw_dir),
            output_argo_dir=Path(args.argo_dir),
            manifest_path=Path(args.manifest),
        )
        print(f"Generated {len(files)} fixture bundles. Manifest recorded at {args.manifest}.")

    elif args.command == "verify-manifest":
        mgr = ManifestManager(Path(args.manifest))
        print(f"Loaded manifest with {len(mgr.entries)} recorded files.")


if __name__ == "__main__":
    main()
