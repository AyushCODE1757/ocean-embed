from pydantic import BaseModel, Field


class Provenance(BaseModel):
    run_id: str
    model_id: str
    source_tier: str = Field(description="final | interim | nrt | unknown")


class Meta(BaseModel):
    lat: list[float]
    lon: list[float]
    depths_m: list[int]
    dates: list[str]
    data_through: str | None
    provenance: Provenance


class Slice(BaseModel):
    date: str
    depth_m: int
    field: str = "model"  # model | truth | clim | error
    lat: list[float]
    lon: list[float]
    values: list[list[float | None]]  # [lat][lon], null over land / invalid
    provenance: Provenance


class ArgoObservation(BaseModel):
    time: str
    lat: float
    lon: float
    depth_m: float
    temp_c: float
    data_mode: str
    platform: str
    cycle: int


class Profile(BaseModel):
    date: str
    lat: float
    lon: float
    depths_m: list[int]
    mean: list[float | None]
    spread: list[float | None]  # null if the run has no uncertainty output
    truth: list[float | None]  # GLORYS at the same cell (null if not in this run)
    clim: list[float | None]  # training-years climatology at the same cell
    argo: list[ArgoObservation]  # nearby QC-flagged profiles (spacetime window)
    argo_note: str | None = None
    provenance: Provenance


class MetricRow(BaseModel):
    method: str
    depth_m: int
    basin: str
    season: str
    rmse: float | None
    bias: float | None
    corr: float | None
    n: int


class Metrics(BaseModel):
    run_id: str
    test_years: list[int]
    independence_note: str | None = None
    rows: list[MetricRow]


class GapSite(BaseModel):
    rank: int
    lat: float
    lon: float
    score: float
    uncertainty: float | None = None
    dist_to_argo_km: float | None = None


class Gaps(BaseModel):
    date: str
    method_note: str | None = None
    sites: list[GapSite]


class OsseArm(BaseModel):
    name: str
    mean_rmse: float
    std_rmse: float


class Osse(BaseModel):
    run_id: str
    k: int
    n_dates: int
    n_seeds: int
    limitation_note: str | None = None
    arms: list[OsseArm]


class Section(BaseModel):
    date: str
    distance_km: list[float]
    lat: list[float]
    lon: list[float]
    depths_m: list[int]
    values: list[list[float | None]]  # [depth][point]
    provenance: Provenance


class HeatField(BaseModel):
    date: str
    metric: str
    units: str
    method: str
    lat: list[float]
    lon: list[float]
    values: list[list[float | None]]  # [lat][lon]
    provenance: Provenance


class TrackPoint(BaseModel):
    iso_time: str
    lat: float
    lon: float
    wind_kt: float | None = None
    pres_hpa: float | None = None
    dist2land_km: float | None = None
    landfall: float | None = None


class Storm(BaseModel):
    sid: str
    name: str
    basin: str
    season: int
    n_points: int
    track: list[TrackPoint]


class Cyclones(BaseModel):
    source: str | None = None
    source_url: str | None = None
    retrieved_utc: str | None = None
    note: str | None = None
    storms: list[Storm]
