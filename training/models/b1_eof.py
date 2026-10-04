import glob
import json
import warnings

import numpy as np
import xarray as xr
from sklearn.decomposition import PCA
from sklearn.linear_model import Ridge

warnings.filterwarnings("ignore")


# ============================================================
# PATHS / DATA
# ============================================================

R = "/kaggle/input/datasets/ayushkam/cube-v1"

g = lambda n: glob.glob(
    f"{R}/**/{n}",
    recursive=True
)[0]

ds = xr.open_zarr(
    g("cube.zarr")
)

clim = xr.open_dataset(
    g("clim.nc")
)["clim"].values

with open(g("norm_splits.json")) as source:
    J = json.load(source)

CH = J["channels"]
SP = J["splits"]
NM = J["norm"]


# ============================================================
# TIME / SPLITS
# ============================================================

t = ds.time.values

doy = ds.time.dt.dayofyear.values

sel = {
    k: np.where(
        (t >= np.datetime64(a)) &
        (t <= np.datetime64(b))
    )[0]
    for k, (a, b) in SP.items()
}


# ============================================================
# MASKS / DEPTHS
# ============================================================

om = (
    ds.valid_ocean_mask.values
    .astype("float32")
)

vd = ds.valid_depth_mask.values

DEPTHS = [
    0, 5, 10, 20, 30,
    50, 75, 100, 125, 150,
    200, 300, 500, 700, 1000
]


# ============================================================
# FEATURES
# ============================================================

def feats(ix):

    f = []

    for c in CH:

        x = (
            np.nan_to_num(
                (
                    ds[c]
                    .isel(time=ix)
                    .values
                    - NM[c]["mean"]
                )
                / NM[c]["std"]
            )
            * om
        )

        f.append(
            x[:, :100, :240]
            .reshape(
                len(ix),
                25,
                4,
                60,
                4
            )
            .mean((2, 4))
            .reshape(
                len(ix),
                -1
            )
        )


    # Seasonal features

    d = doy[ix][:, None]

    f += [
        np.sin(
            2 * np.pi * d / 365.25
        ),
        np.cos(
            2 * np.pi * d / 365.25
        )
    ]


    return np.concatenate(
        f,
        1
    ).astype("float32")


# ============================================================
# TRUTH
# ============================================================

def truth(ix):

    return ds.temp.isel(
        time=ix
    ).values


# ============================================================
# PCA TRAINING
# ============================================================

tr = sel["train"]

Y = np.nan_to_num(
    truth(tr)
    - clim[doy[tr] - 1]
).reshape(
    len(tr),
    -1
)


pca = PCA(
    30,
    svd_solver="randomized",
    random_state=0
).fit(Y)


C = pca.transform(Y)

del Y


# ============================================================
# FEATURE NORMALIZATION
# ============================================================

Ftr = feats(tr)

mu = Ftr.mean(0)

sd = Ftr.std(0) + 1e-6

Ftr = (
    Ftr - mu
) / sd


# ============================================================
# PREDICTION
# ============================================================

def pred(ix, rm):

    X = (
        feats(ix) - mu
    ) / sd

    coeff = rm.predict(X)

    a = (
        pca
        .inverse_transform(coeff)
        .reshape(
            len(ix),
            15,
            101,
            241
        )
    )

    return np.where(
        vd[None],
        clim[doy[ix] - 1] + a,
        np.nan
    ).astype("float32")


# ============================================================
# ROBUST RMSE
# ============================================================

def rmse(p, T):

    m = (
        ~np.isnan(T)
        & ~np.isnan(p)
    )

    count = m.sum(
        axis=(0, 2, 3)
    )

    sq = (
        (p - T) ** 2
    )

    sq = np.where(
        m,
        sq,
        0
    )

    total = sq.sum(
        axis=(0, 2, 3)
    )

    result = np.full(
        count.shape,
        np.nan,
        dtype=np.float64
    )

    valid = count > 0

    result[valid] = np.sqrt(
        total[valid]
        / count[valid]
    )

    return result


# ============================================================
# VALIDATION
# ============================================================

Tv = truth(
    sel["val"]
)


# ============================================================
# RIDGE ALPHA SEARCH
# ============================================================

best = (
    np.inf,
    None
)


for a in [
    100,
    1000,
    10000,
    100000
]:

    rm = Ridge(
        alpha=float(a)
    ).fit(
        Ftr,
        C
    )

    scores = rmse(
        pred(
            sel["val"],
            rm
        ),
        Tv
    )

    # Ignore depths with no valid observations

    valid_scores = scores[
        np.isfinite(scores)
    ]

    if len(valid_scores) == 0:

        print(
            "alpha",
            a,
            "has NO valid validation RMSE"
        )

        continue


    s = float(
        valid_scores.mean()
    )


    print(
        "alpha",
        a,
        "val mean rmse",
        round(s, 4)
    )


    if s < best[0]:

        best = (
            s,
            a
        )


# ============================================================
# CHECK THAT ALPHA WAS FOUND
# ============================================================

if best[1] is None:

    raise RuntimeError(
        "No valid Ridge alpha was found. "
        "Validation predictions contain no "
        "finite RMSE values."
    )


print(
    "\nBest alpha:",
    best[1]
)

print(
    "Best validation mean RMSE:",
    round(
        float(best[0]),
        4
    )
)


# ============================================================
# FINAL RIDGE MODEL
# ============================================================

rm = Ridge(
    alpha=float(best[1])
).fit(
    Ftr,
    C
)


# ============================================================
# TEST PREDICTION
# ============================================================

P = pred(
    sel["test"],
    rm
)


np.save(
    "/kaggle/working/pred_b1_test.npy",
    P
)


# ============================================================
# TEST RMSE
# ============================================================

r = rmse(
    P,
    truth(sel["test"])
)


print(
    "\nB1 test RMSE vs GLORYS, alpha",
    best[1]
)


for d, x in zip(
    DEPTHS,
    r
):

    if np.isfinite(x):

        print(
            f"  {d:>5} m  {x:.3f}"
        )

    else:

        print(
            f"  {d:>5} m  NaN"
        )