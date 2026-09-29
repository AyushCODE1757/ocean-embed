from fastapi import Depends, HTTPException

from .schemas import Provenance
from .services.store import DataNotBuilt, Store
from .settings import Settings, get_settings


def get_store(settings: Settings = Depends(get_settings)) -> Store:
    try:
        return Store(settings)
    except DataNotBuilt as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


def get_provenance(settings: Settings = Depends(get_settings)) -> Provenance:
    return Provenance(run_id=settings.run_id, model_id=settings.model_id, source_tier="unknown")
