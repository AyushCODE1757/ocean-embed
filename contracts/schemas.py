from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

Array4D = list[list[list[list[float]]]]


class ManifestEntry(BaseModel):
    model_config = ConfigDict(extra="forbid")

    dataset_id: str = Field(..., min_length=1)
    version: str = Field(..., min_length=1)
    doi: str | None = None
    checksum: str = Field(..., min_length=1)
    source_tier: Literal["final", "NRT", "mixed", "delayed", "reanalysis"] = Field(...)


class ModelBundle(BaseModel):
    model_config = ConfigDict(extra="forbid")

    config: dict[str, Any] = Field(default_factory=dict)
    norm_stats: dict[str, Any] = Field(default_factory=dict)
    model_card: dict[str, Any] = Field(default_factory=dict)
    contract_version: str = Field(default="0.1.0")


class PredictionFile(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mean: Array4D = Field(..., description="Shape [time, 15, 101, 241].")
    spread: Array4D = Field(..., description="Shape [time, 15, 101, 241].")
    gap_score: Array4D = Field(..., description="Shape [time, 15, 101, 241].")
    ohc: Array4D = Field(..., description="Shape [time, 15, 101, 241].")
    d20: Array4D = Field(..., description="Shape [time, 15, 101, 241].")
    d26: Array4D = Field(..., description="Shape [time, 15, 101, 241].")
