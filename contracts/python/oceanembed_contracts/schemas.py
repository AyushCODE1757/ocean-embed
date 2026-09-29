"""OceanEmbed Pydantic Schemas for Structured Data Contracts."""
from typing import Dict, List, Optional
from pydantic import BaseModel, Field


class DateRange(BaseModel):
    start: str
    end: str


class ManifestFileEntry(BaseModel):
    dataset_id: str
    variable: str
    source_url: Optional[str] = None
    doi: Optional[str] = None
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
    files: List[ManifestFileEntry]


class DepthMetricEntry(BaseModel):
    depth: float
    rmse: float
    mae: float
    bias: float
    pearson_r: float
    acc: float
    skill_score_clim: float


class OverallMetrics(BaseModel):
    rmse: float
    mae: float
    bias: float
    pearson_r: float
    acc: float
    skill_score_clim: float
    std_ratio: Optional[float] = 1.0
    d20_rmse: Optional[float] = None
    d26_rmse: Optional[float] = None
    ohc_rmse: Optional[float] = None


class MetricsReport(BaseModel):
    run_id: str
    model_name: str
    test_period: str
    overall: OverallMetrics
    per_depth: List[DepthMetricEntry]
    per_basin: Dict[str, Dict[str, float]]
    per_season: Dict[str, Dict[str, float]]
    baselines: Optional[Dict[str, Dict[str, float]]] = None
    argo_validation: Optional[Dict[str, Dict[str, float]]] = None
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
    recommended_sites: List[RecommendedArgoSite]
