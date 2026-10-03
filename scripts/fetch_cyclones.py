"""Fetch IBTrACS best-track data and build the packaged cyclone reference file.

Downloads the IBTrACS v04r01 last-3-years CSV (NOAA NCEI, public domain),
filters the 2024 North Indian Ocean cyclones used in the case study
(Remal, Fengal), and writes a compact JSON bundled with the serving package
so /v1/cyclones works on a clean clone and inside Docker.

Re-run to refresh:  uv run python scripts/fetch_cyclones.py [--csv PATH]
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import UTC, datetime
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
IBTRACS_URL = (
    "https://www.ncei.noaa.gov/data/international-best-track-archive-for-climate-"
    "stewardship-ibtracs/v04r01/access/csv/ibtracs.last3years.list.v04r01.csv"
)
OUT = ROOT / "packages/serving/src/oceanembed_serving/reference/cyclones_2024.json"
DEFAULT_CSV = ROOT / "data/cyclones/ibtracs.csv"
STORMS = ("REMAL", "FENGAL")  # Bay of Bengal landfalling cyclones, 2024
SEASON = "2024"


def _num(v, scale=1.0):
    try:
        f = float(v)
        return None if f != f else round(f * scale, 2)
    except (TypeError, ValueError):
        return None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", type=Path, default=DEFAULT_CSV, help="already-downloaded IBTrACS csv")
    args = ap.parse_args()
    if not args.csv.exists():
        print(f"downloading {IBTRACS_URL}")
        args.csv.parent.mkdir(parents=True, exist_ok=True)
        import urllib.request

        urllib.request.urlretrieve(IBTRACS_URL, args.csv)
    df = pd.read_csv(
        args.csv,
        usecols=[
            "SID",
            "SEASON",
            "BASIN",
            "NAME",
            "ISO_TIME",
            "LAT",
            "LON",
            "WMO_WIND",
            "WMO_PRES",
            "DIST2LAND",
            "LANDFALL",
        ],
        dtype=str,
        skiprows=[1],
    )  # row 1 holds units headers
    sel = df[(df.SEASON == SEASON) & (df.BASIN == "NI") & (df.NAME.isin(STORMS))]
    if sel.empty:
        print(f"ERROR: no {STORMS} rows for season {SEASON} basin NI in {args.csv}")
        return 1
    storms = []
    for name in STORMS:
        s = sel[sel.NAME == name].sort_values("ISO_TIME")
        if s.empty:
            print(f"WARNING: {name} not found, skipping")
            continue
        track = [
            {
                "iso_time": r.ISO_TIME,
                "lat": _num(r.LAT),
                "lon": _num(r.LON),
                "wind_kt": _num(r.WMO_WIND),
                "pres_hpa": _num(r.WMO_PRES),
                "dist2land_km": _num(r.DIST2LAND),
                "landfall": _num(r.LANDFALL),
            }
            for r in s.itertuples(index=False)
        ]
        storms.append(
            {
                "sid": str(s.SID.iloc[0]),
                "name": name.title(),
                "basin": "NI",
                "season": int(SEASON),
                "n_points": len(track),
                "track": track,
            }
        )
        print(
            f"{name.title()}: {len(track)} points {track[0]['iso_time']} .. {track[-1]['iso_time']}"
        )
    out = {
        "source": "IBTrACS v04r01 (NOAA NCEI), last3years list, basin NI",
        "source_url": IBTRACS_URL,
        "retrieved_utc": datetime.now(UTC).isoformat(timespec="seconds"),
        "license": "US public domain (NOAA)",
        "note": "Official best-track records; winds from WMO agency (RSMC New Delhi).",
        "storms": storms,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, indent=1))
    print(f"wrote {OUT} ({OUT.stat().st_size} bytes, {len(storms)} storms)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
