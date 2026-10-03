"""IBTrACS best-track reference data for the cyclone case study.

Loaded from the packaged reference JSON (built by scripts/fetch_cyclones.py,
source: NOAA NCEI IBTrACS v04r01, public domain) or from OE_CYCLONES_PATH.
No track points are ever synthesised.
"""

import json
from functools import lru_cache
from importlib import resources
from pathlib import Path

from ..schemas import Cyclones, Storm, TrackPoint
from ..settings import Settings


class CyclonesNotBuilt(RuntimeError):
    pass


@lru_cache(maxsize=2)
def _load_ref(override: str | None) -> dict:
    try:
        if override:
            return json.loads(Path(override).read_text(encoding="utf-8"))
        ref = resources.files("oceanembed_serving").joinpath("reference/cyclones_2024.json")
        return json.loads(ref.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise CyclonesNotBuilt(
            "cyclone reference not available; run scripts/fetch_cyclones.py"
        ) from exc
    except OSError as exc:  # unreadable drive/dir given as override
        raise CyclonesNotBuilt(f"cyclone reference unreadable: {exc}") from exc


def load(settings: Settings) -> Cyclones:
    override = str(settings.cyclones_path) if settings.cyclones_path else None
    if override in ("", "."):
        override = None
    raw = _load_ref(override)
    storms = []
    for s in raw.get("storms", []):
        track = [
            TrackPoint(
                iso_time=p["iso_time"], lat=p["lat"], lon=p["lon"], wind_kt=p.get("wind_kt"),
                pres_hpa=p.get("pres_hpa"), dist2land_km=p.get("dist2land_km"),
                landfall=p.get("landfall"),
            )
            for p in s.get("track", [])
        ]
        storms.append(
            Storm(
                sid=s["sid"], name=s["name"], basin=s["basin"], season=s["season"],
                n_points=s.get("n_points", len(track)), track=track,
            )
        )
    return Cyclones(
        source=raw.get("source"), source_url=raw.get("source_url"),
        retrieved_utc=raw.get("retrieved_utc"), note=raw.get("note"), storms=storms,
    )
