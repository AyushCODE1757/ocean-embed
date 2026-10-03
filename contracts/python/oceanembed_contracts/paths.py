"""OceanEmbed Canonical Storage Paths Contract."""

from pathlib import Path

DEFAULT_DATA_DIR = Path("data")
DEFAULT_RAW_DIR = DEFAULT_DATA_DIR / "raw"
DEFAULT_INTERMEDIATE_DIR = DEFAULT_DATA_DIR / "intermediate"
DEFAULT_CUBES_DIR = DEFAULT_DATA_DIR / "cubes"
DEFAULT_ARGO_DIR = DEFAULT_DATA_DIR / "argo"
DEFAULT_METRICS_DIR = DEFAULT_DATA_DIR / "metrics"
DEFAULT_ARTIFACTS_DIR = DEFAULT_DATA_DIR / "artifacts"

# Standard Zarr Cube Files
CUBE_INPUTS_ZARR = DEFAULT_CUBES_DIR / "cube_inputs.zarr"
CUBE_TARGETS_ZARR = DEFAULT_CUBES_DIR / "cube_targets.zarr"
MASKS_ZARR = DEFAULT_CUBES_DIR / "masks.zarr"
CLIMATOLOGY_ZARR = DEFAULT_CUBES_DIR / "climatology.zarr"

# Standard In-situ Argo Parquet File
ARGO_PROFILES_PARQUET = DEFAULT_ARGO_DIR / "argo_profiles.parquet"
ARGO_GRIDDED_ZARR = DEFAULT_ARGO_DIR / "argo_gridded.zarr"

# Standard Manifest File
MANIFEST_JSON = DEFAULT_DATA_DIR / "manifest.json"
METRICS_JSON = DEFAULT_METRICS_DIR / "metrics.json"
