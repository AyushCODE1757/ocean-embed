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
    lat: list[float]
    lon: list[float]
    values: list[list[float | None]]  # [lat][lon], null over land / invalid
    provenance: Provenance


class Profile(BaseModel):
    date: str
    lat: float
    lon: float
    depths_m: list[int]
    mean: list[float | None]
    spread: list[float | None]  # null if the run has no uncertainty output
    provenance: Provenance




class ReferenceProfile(BaseModel):
    date: str
    lat: float
    lon: float
    depths_m: list[int]
    values: list[float | None]
    source: str = "GLORYS (cube_targets.zarr, variable temp)"


class ArgoProfile(BaseModel):
    platform_id: str
    cycle_number: int
    timestamp: str
    latitude: float
    longitude: float
    data_mode: str
    distance_km: float
    depths_m: list[float]
    temperature: list[float | None]


class ArgoNearby(BaseModel):
    date: str
    window_days: int
    radius_km: float
    profiles: list[ArgoProfile]


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
