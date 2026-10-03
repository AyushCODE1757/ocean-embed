
import glob
import os
import sys
import traceback

import earthaccess
import numpy as np
import pandas as pd
import xarray as xr

# ============================================================
# ARGUMENTS
# ============================================================

KIND = sys.argv[1]
Y0 = int(sys.argv[2])
Y1 = int(sys.argv[3])


# ============================================================
# DATASET CONFIG
# ============================================================

SN = {
    "oscar": "OSCAR_L4_OC_FINAL_V2.0",
    "ccmp": "CCMP_WINDS_10M6HR_L4_V3.1"
}[KIND]


VARS = {
    "oscar": [
        ("ucur", ["u"]),
        ("vcur", ["v"])
    ],
    "ccmp": [
        ("uwind", ["uwnd"]),
        ("vwind", ["vwnd"])
    ]
}[KIND]


# ============================================================
# DIRECTORIES
# ============================================================

RAW = f"/tmp/raw_{KIND}"
OUT = f"/kaggle/working/inputs/{KIND}"

os.makedirs(RAW, exist_ok=True)
os.makedirs(OUT, exist_ok=True)


# ============================================================
# TARGET GRID
# ============================================================

LAT = np.arange(5, 30.01, 0.25)
LON = np.arange(45, 105.01, 0.25)


# ============================================================
# EARTHDATA LOGIN
# ============================================================

earthaccess.login(strategy="environment")


# ============================================================
# REGRIDDING HELPERS
# ============================================================

def edges(c):

    c = np.asarray(c, dtype=np.float64).ravel()

    if len(c) < 2:
        raise ValueError(
            f"Coordinate has only {len(c)} points"
        )

    spacing = float(np.median(np.diff(c)))

    return np.append(
        c - spacing / 2,
        c[-1] + spacing / 2
    )


def weights(out_c, in_c):

    out_c = np.asarray(
        out_c,
        dtype=np.float64
    ).ravel()

    in_c = np.asarray(
        in_c,
        dtype=np.float64
    ).ravel()

    if len(out_c) < 2:
        raise ValueError(
            f"Output coordinate too short: {len(out_c)}"
        )

    if len(in_c) < 2:
        raise ValueError(
            f"Input coordinate too short: {len(in_c)}"
        )

    oe = edges(out_c)
    ie = edges(in_c)

    lo = np.maximum(
        oe[:-1, None],
        ie[None, :-1]
    )

    hi = np.minimum(
        oe[1:, None],
        ie[None, 1:]
    )

    return (
        np.clip(hi - lo, 0, None)
        / float(oe[1] - oe[0])
    ).astype(np.float32)


def regrid(x, lat, lon):

    x = np.asarray(
        x,
        dtype=np.float32
    )

    lat = np.asarray(
        lat,
        dtype=np.float64
    ).ravel()

    lon = np.asarray(
        lon,
        dtype=np.float64
    ).ravel()

    Wy = weights(LAT, lat)
    Wx = weights(LON, lon)

    valid = (
        ~np.isnan(x)
    ).astype(np.float32)

    num = (
        Wy
        @ np.nan_to_num(x)
        @ Wx.T
    )

    den = (
        Wy
        @ valid
        @ Wx.T
    )

    return np.where(
        den > 0.5,
        num / np.maximum(den, 1e-6),
        np.nan
    ).astype(np.float32)


# ============================================================
# READ ONE DOWNLOADED FILE
# ============================================================

def daily(path):

    print(
        "Reading:",
        os.path.basename(path),
        flush=True
    )

    ds = xr.open_dataset(path)

    print(
        "Original dimensions:",
        dict(ds.sizes),
        flush=True
    )

    print(
        "Coordinates:",
        list(ds.coords),
        flush=True
    )


    # ========================================================
    # FIND LATITUDE COORDINATE
    # ========================================================

    if "lat" in ds.coords:

        lat = ds["lat"]

    elif "latitude" in ds.coords:

        lat = ds["latitude"]

    else:

        raise ValueError(
            f"Latitude coordinate not found. "
            f"Coordinates: {list(ds.coords)}"
        )


    # ========================================================
    # FIND LONGITUDE COORDINATE
    # ========================================================

    if "lon" in ds.coords:

        lon = ds["lon"]

    elif "longitude" in ds.coords:

        lon = ds["longitude"]

    else:

        raise ValueError(
            f"Longitude coordinate not found. "
            f"Coordinates: {list(ds.coords)}"
        )


    # ========================================================
    # CONVERT COORDINATES TO NUMPY
    # ========================================================

    lat_values = np.asarray(
        lat.values,
        dtype=np.float64
    ).ravel()

    lon_values = np.asarray(
        lon.values,
        dtype=np.float64
    ).ravel()


    # ========================================================
    # NORMALIZE LONGITUDE
    # ========================================================

    lon_values = lon_values % 360


    # ========================================================
    # FIND TARGET REGION
    # ========================================================

    lat_mask = (
        (lat_values >= 4.5) &
        (lat_values <= 30.5)
    )

    lon_mask = (
        (lon_values >= 44.5) &
        (lon_values <= 105.5)
    )


    lat_indices = np.where(
        lat_mask
    )[0]

    lon_indices = np.where(
        lon_mask
    )[0]


    if len(lat_indices) == 0:

        raise ValueError(
            "No latitude points found "
            "inside target region."
        )


    if len(lon_indices) == 0:

        raise ValueError(
            "No longitude points found "
            "inside target region."
        )


    # ========================================================
    # SELECT USING INTEGER INDICES
    # ========================================================

    ds = ds.isel(
        latitude=lat_indices,
        longitude=lon_indices
    )


    # Keep corresponding coordinate values

    lat_values = lat_values[
        lat_indices
    ]

    lon_values = lon_values[
        lon_indices
    ]


    # ========================================================
    # SORT LONGITUDE
    # ========================================================

    lon_order = np.argsort(
        lon_values
    )

    lon_values = lon_values[
        lon_order
    ]

    ds = ds.isel(
        longitude=lon_order
    )


    print(
        "Subset dimensions:",
        dict(ds.sizes),
        flush=True
    )


    # ========================================================
    # EXTRACT VARIABLES
    # ========================================================

    out = {}


    for name, candidates in VARS:

        variable = None


        for candidate in candidates:

            if candidate in ds.data_vars:

                variable = candidate
                break


        if variable is None:

            raise ValueError(
                f"Could not find variable "
                f"{candidates}. "
                f"Available variables: "
                f"{list(ds.data_vars)}"
            )


        print(
            f"Using {variable} -> {name}",
            flush=True
        )


        da = ds[variable]


        # ----------------------------------------------------
        # Average over time
        # ----------------------------------------------------

        if "time" in da.dims:

            da = da.mean(
                "time",
                skipna=True
            )


        # ----------------------------------------------------
        # Remove singleton dimensions
        # ----------------------------------------------------

        da = da.squeeze(
            drop=True
        )


        # ----------------------------------------------------
        # Ensure correct dimension order
        # ----------------------------------------------------

        da = da.transpose(
            "latitude",
            "longitude"
        )


        # ----------------------------------------------------
        # Regrid
        # ----------------------------------------------------

        out[name] = regrid(
            da.values.astype(
                np.float32
            ),
            lat_values,
            lon_values
        )


    # ========================================================
    # GET TIME
    # ========================================================

    if "time" not in ds:

        raise ValueError(
            "Dataset does not contain "
            "a time coordinate."
        )


    t_raw = ds["time"].values.flat[0]

    if hasattr(t_raw, "year"):
        # OSCAR: cftime.DatetimeJulian
        t = pd.Timestamp(
            year=int(t_raw.year),
            month=int(t_raw.month),
            day=int(t_raw.day)
        )
    
    else:
        # CCMP: numpy.datetime64
        t = pd.Timestamp(t_raw).normalize()


    return t, out


# ============================================================
# MONTHLY PROCESSING
# ============================================================

for m in pd.period_range(
    f"{Y0}-01",
    f"{Y1}-12",
    freq="M"
):

    f = f"{OUT}/{m}.nc"


    # --------------------------------------------------------
    # Skip already completed months
    # --------------------------------------------------------

    if os.path.exists(f):

        print(
            "Skipping existing:",
            m,
            flush=True
        )

        continue


    print(
        "\n========================================",
        flush=True
    )

    print(
        "PROCESSING:",
        m,
        flush=True
    )

    print(
        "========================================",
        flush=True
    )


    try:

        # ====================================================
        # SEARCH EARTHDATA
        # ====================================================

        g = earthaccess.search_data(
            short_name=SN,
            temporal=(
                f"{m.start_time:%Y-%m-%d}",
                f"{m.end_time:%Y-%m-%d}"
            )
        )


        print(
            "Found files:",
            len(g),
            flush=True
        )


        # ====================================================
        # DOWNLOAD
        # ====================================================

        paths = earthaccess.download(
            g,
            RAW
        )


        print(
            "Downloaded:",
            len(paths),
            "files",
            flush=True
        )


        # ====================================================
        # PROCESS EACH FILE
        # ====================================================

        rows = []


        for p in paths:

            try:

                rows.append(
                    daily(p)
                )

            except Exception as ex:

                print(
                    "\nERROR processing:",
                    p,
                    flush=True
                )

                print(
                    repr(ex),
                    flush=True
                )

                traceback.print_exc()

                raise


        # ====================================================
        # SORT BY TIME
        # ====================================================

        rows = sorted(
            rows,
            key=lambda r: r[0]
        )


        times = [
            r[0]
            for r in rows
        ]


        # ====================================================
        # CREATE XARRAY DATASET
        # ====================================================

        ds = xr.Dataset(

            {
                n: (
                    (
                        "time",
                        "latitude",
                        "longitude"
                    ),

                    np.stack(
                        [
                            r[1][n]
                            for r in rows
                        ]
                    )
                )

                for n, _ in VARS
            },

            coords={
                "time": times,
                "latitude": LAT,
                "longitude": LON
            }
        )


        # ====================================================
        # ADD TIER
        # ====================================================

        ds["tier"] = (
            "time",
            np.array(
                ["final"] * len(times)
            )
        )


        # ====================================================
        # SAVE
        # ====================================================

        ds.to_netcdf(f)


        print(
            "\nDONE:",
            m,
            len(times),
            "days",
            flush=True
        )


        print(
            "Valid fraction:",
            round(
                float(
                    np.isfinite(
                        ds[VARS[0][0]].values
                    ).mean()
                ),
                3
            ),
            flush=True
        )


    except (OSError, RuntimeError, ValueError, KeyError) as exc:

        print(
            "\nFAILED",
            m,
            repr(exc),
            flush=True
        )

        traceback.print_exc()


    # ========================================================
    # CLEAN TEMPORARY RAW FILES
    # ========================================================

    for p in glob.glob(
        f"{RAW}/*"
    ):

        try:

            os.remove(p)

        except FileNotFoundError:
            pass