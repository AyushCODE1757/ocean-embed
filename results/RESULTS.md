# Results

Source files: `results.json`, `argo_validation.json`, `meta.json` | Test period (`meta.json`): 2024-2025

## Test (2024-2025) vs GLORYS

| Depth (m) | Climatology RMSE (degC) | Model RMSE (degC) | Skill vs climatology |
| --- | --- | --- | --- |
| 0 | 0.685 | 0.536 | 0.388 |
| 5 | 0.685 | 0.538 | 0.383 |
| 10 | 0.689 | 0.541 | 0.383 |
| 20 | 0.737 | 0.598 | 0.342 |
| 30 | 0.827 | 0.690 | 0.304 |
| 50 | 1.117 | 0.904 | 0.345 |
| 75 | 1.575 | 1.173 | 0.445 |
| 100 | 1.837 | 1.381 | 0.435 |
| 125 | 1.741 | 1.389 | 0.363 |
| 150 | 1.482 | 1.225 | 0.317 |
| 200 | 0.973 | 0.841 | 0.253 |
| 300 | 0.602 | 0.569 | 0.107 |
| 500 | 0.384 | 0.377 | 0.036 |
| 700 | 0.398 | 0.395 | 0.015 |
| 1000 | 0.438 | 0.441 | -0.014 |

## Validation (2023) vs GLORYS

| Depth (m) | Climatology RMSE (degC) | Model RMSE (degC) | Skill vs climatology |
| --- | --- | --- | --- |
| 0 | 0.690 | 0.511 | 0.452 |
| 5 | 0.684 | 0.508 | 0.448 |
| 10 | 0.690 | 0.519 | 0.434 |
| 20 | 0.739 | 0.586 | 0.371 |
| 30 | 0.838 | 0.693 | 0.316 |
| 50 | 1.163 | 0.893 | 0.410 |
| 75 | 1.666 | 1.127 | 0.542 |
| 100 | 1.944 | 1.345 | 0.521 |
| 125 | 1.809 | 1.341 | 0.450 |
| 150 | 1.509 | 1.166 | 0.403 |
| 200 | 0.986 | 0.833 | 0.286 |
| 300 | 0.581 | 0.553 | 0.094 |
| 500 | 0.382 | 0.375 | 0.036 |
| 700 | 0.379 | 0.378 | 0.005 |
| 1000 | 0.399 | 0.403 | -0.020 |

Skill vs climatology is computed as `1 - (model RMSE / climatology RMSE)^2`.

## Independent check vs Argo, all profiles

| Depth (m) | n | Climatology RMSE (degC) | ARMOR3D RMSE (degC) | GLORYS RMSE (degC) | Model RMSE (degC) |
| --- | --- | --- | --- | --- | --- |
| 0 | 6801 | 0.733 | 0.582 | 0.401 | 0.568 |
| 5 | 6813 | 0.744 | 0.245 | 0.409 | 0.574 |
| 10 | 6815 | 0.793 | 0.306 | 0.484 | 0.641 |
| 20 | 6849 | 0.951 | 0.448 | 0.648 | 0.830 |
| 30 | 6849 | 0.991 | 0.416 | 0.641 | 0.865 |
| 50 | 6849 | 1.230 | 0.565 | 0.815 | 1.061 |
| 75 | 6835 | 1.643 | 0.685 | 1.063 | 1.397 |
| 100 | 6831 | 1.915 | 0.712 | 1.224 | 1.730 |
| 125 | 6829 | 1.767 | 0.641 | 1.096 | 1.613 |
| 150 | 6819 | 1.456 | 0.523 | 0.881 | 1.246 |
| 200 | 6727 | 0.999 | 0.391 | 0.665 | 0.848 |
| 300 | 6681 | 0.775 | 0.247 | 0.507 | 0.676 |
| 500 | 6662 | 0.383 | 0.149 | 0.293 | 0.357 |
| 700 | 6638 | 0.373 | 0.131 | 0.333 | 0.356 |
| 1000 | 6389 | 0.341 | 0.134 | 0.321 | 0.342 |

## Independent check vs Argo, delayed-mode only

| Depth (m) | n | Climatology RMSE (degC) | ARMOR3D RMSE (degC) | GLORYS RMSE (degC) | Model RMSE (degC) |
| --- | --- | --- | --- | --- | --- |
| 0 | 3491 | 0.706 | 0.557 | 0.317 | 0.515 |
| 5 | 3501 | 0.710 | 0.170 | 0.299 | 0.514 |
| 10 | 3506 | 0.709 | 0.205 | 0.312 | 0.523 |
| 20 | 3514 | 0.744 | 0.283 | 0.374 | 0.587 |
| 30 | 3515 | 0.818 | 0.297 | 0.467 | 0.679 |
| 50 | 3516 | 1.172 | 0.506 | 0.764 | 0.987 |
| 75 | 3514 | 1.787 | 0.740 | 1.148 | 1.473 |
| 100 | 3514 | 2.181 | 0.780 | 1.373 | 1.964 |
| 125 | 3515 | 1.988 | 0.688 | 1.195 | 1.812 |
| 150 | 3512 | 1.595 | 0.552 | 0.936 | 1.344 |
| 200 | 3481 | 0.974 | 0.365 | 0.637 | 0.800 |
| 300 | 3464 | 0.541 | 0.200 | 0.409 | 0.462 |
| 500 | 3459 | 0.345 | 0.130 | 0.264 | 0.332 |
| 700 | 3459 | 0.352 | 0.129 | 0.312 | 0.343 |
| 1000 | 3348 | 0.314 | 0.124 | 0.283 | 0.313 |

## Model bias vs Argo (all profiles)

| Depth (m) | Model bias (degC) |
| --- | --- |
| 0 | -0.121 |
| 5 | -0.162 |
| 10 | -0.124 |
| 20 | -0.021 |
| 30 | 0.002 |
| 50 | 0.087 |
| 75 | 0.401 |
| 100 | 0.806 |
| 125 | 0.848 |
| 150 | 0.531 |
| 200 | 0.218 |
| 300 | 0.079 |
| 500 | 0.014 |
| 700 | -0.115 |
| 1000 | -0.072 |

## RMSE at 100 m by basin

| Basin | Climatology RMSE (degC) | ARMOR3D RMSE (degC) | GLORYS RMSE (degC) | Model RMSE (degC) |
| --- | --- | --- | --- | --- |
| ArabianSea | 1.603 | 0.585 | 1.032 | 1.424 |
| BayOfBengal | 2.168 | 0.816 | 1.375 | 1.901 |
| other | 2.645 | 0.999 | 1.684 | 2.557 |

## RMSE at 100 m by season

| Season | Climatology RMSE (degC) | ARMOR3D RMSE (degC) | GLORYS RMSE (degC) | Model RMSE (degC) |
| --- | --- | --- | --- | --- |
| postmonsoon | 2.127 | 0.690 | 1.244 | 1.939 |
| premonsoon | 1.727 | 0.697 | 1.164 | 1.672 |
| swmonsoon | 1.783 | 0.750 | 1.239 | 1.615 |
| winter | 2.146 | 0.685 | 1.254 | 1.807 |

## Caveats

- GLORYS is the training target; GLORYS, ARMOR3D, and the SSS product all assimilate Argo, so they are not independent.
- Argo 2024-2025 mixes real-time, adjusted, and delayed-mode data.
- 2025 SSS and ARMOR3D are near-real-time.
- The model has no skill at 500 m and deeper.
- Basins and seasons are rough boxes defined by us.
- Argo is matched to the nearest 0.25 deg cell and day, with pressure used as depth.
