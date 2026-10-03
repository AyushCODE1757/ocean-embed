import math

import numpy as np

EARTH_R_KM = 6371.0088


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_R_KM * math.asin(math.sqrt(a))


def parse_path(text: str, max_vertices: int = 20) -> list[tuple[float, float]]:
    """'lat,lon;lat,lon;...' -> [(lat, lon), ...]. Raises ValueError on bad input."""
    try:
        pts = [tuple(float(x) for x in seg.split(",")) for seg in text.split(";") if seg]
    except ValueError as exc:
        raise ValueError("path must be 'lat,lon;lat,lon;...'") from exc
    if any(len(p) != 2 for p in pts):
        raise ValueError("each path vertex needs exactly lat,lon")
    if not 2 <= len(pts) <= max_vertices:
        raise ValueError(f"path needs 2 to {max_vertices} vertices")
    return pts  # type: ignore[return-value]


def sample_path(
    vertices: list[tuple[float, float]], n: int
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Evenly spaced points along the polyline. Returns lat, lon, cumulative distance (km)."""
    seg_km = [haversine_km(*a, *b) for a, b in zip(vertices[:-1], vertices[1:])]  # noqa: RUF007
    total = sum(seg_km)
    if total == 0:
        raise ValueError("path has zero length")
    cum_vertex = np.concatenate([[0.0], np.cumsum(seg_km)])
    dist = np.linspace(0.0, total, n)
    lats = np.interp(dist, cum_vertex, [v[0] for v in vertices])
    lons = np.interp(dist, cum_vertex, [v[1] for v in vertices])
    return lats, lons, dist
