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
