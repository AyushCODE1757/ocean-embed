"""OceanEmbed Pydantic Schemas for Structured Data Contracts."""

from typing import Any

from pydantic import BaseModel, Field


class DateRange(BaseModel):
    start: str
    end: str


class ManifestFileEntry(BaseModel):
    dataset_id: str
    variable: str
    source_url: str | None = None
    doi: str | None = None
    filename: str
    sha256: str
    bytes: int
    source_tier: str = Field(..., description="final, interim, nrt, fixture")
    date_range: DateRange


class IngestionManifest(BaseModel):
    version: str = "1.0.0"
    generated_at: str
    total_files: int
    total_bytes: int
    files: list[ManifestFileEntry]


class DepthMetricEntry(BaseModel):
    depth: float
    rmse: float
    mae: float
    bias: float
    pearson_r: float
    acc: float | str | None = None
    skill_score_clim: float


class OverallMetrics(BaseModel):
    rmse: float
    mae: float
    bias: float
    pearson_r: float
    acc: float | str | None = None
    skill_score_clim: float
    std_ratio: float | None = 1.0
    d20_rmse: float | None = None
    d26_rmse: float | None = None
    ohc_rmse: float | None = None


class MetricsReport(BaseModel):
    run_id: str
    model_name: str
    test_period: str
    is_sample_slice: bool | None = False
    overall: OverallMetrics
    per_depth: list[DepthMetricEntry]
    per_basin: dict[str, dict[str, Any]]
    per_season: dict[str, dict[str, Any]]
    baselines: dict[str, dict[str, Any]] | None = None
    argo_validation: dict[str, Any] | None = None
    independence_caveat: str = (
        "GLORYS, the SSS product, and ARMOR3D assimilate Argo in-situ observations. "
        "Independent validation against Argo measures consistency with ground truth, but "
        "reanalysis targets are not fully independent of Argo."
    )


class RecommendedArgoSite(BaseModel):
    rank: int
    latitude: float
    longitude: float
    gap_score: float
    uncertainty_value: float
    distance_to_nearest_argo_km: float


class ArgoAdvisorRecommendation(BaseModel):
    date: str
    k: int
    recommended_sites: list[RecommendedArgoSite]
