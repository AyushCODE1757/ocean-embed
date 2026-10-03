# training/ — Person B's Kaggle pipeline (byte-verbatim provenance)

Everything in this directory is **exactly as Person B ran it on Kaggle** to produce the
shipped model, its export snapshot (`data/app_data/`) and the tables in `results/`.
Paths like `/kaggle/input/...` and `/kaggle/working/...` are intentionally kept — these
scripts are operational notebooks, not library code, and they must stay reproducible
against the original Kaggle datasets.

## Pipeline order

| Step | Script | Reads | Writes |
|---|---|---|---|
| 1. GLORYS target | `pipeline/01_glorys_target/run.py` | CMEMS GLORYS12V1 (COPERNICUSMARINE credentials) | monthly 0.25° target NetCDFs |
| 2a. SST/SSS/SLA | `pipeline/02_inputs/inputs.py` | CMEMS OSTIA / SMOS+SMAP / DUACS | monthly input NetCDFs + tier |
| 2b. Currents/winds | `pipeline/02_inputs/ea.py` | PO.DAAC OSCAR + CCMP (EARTHDATA env) | monthly input NetCDFs |
| 3. Cube | `pipeline/03_cube/m2.py` | all Kaggle datasets above | `cube.zarr`, `clim.nc`, `norm_splits.json` |
| 4. ARMOR3D | `pipeline/04_armor3d/armor.py` | CMEMS my/nrt editions | monthly benchmark NetCDFs |
| 5. Argo | `pipeline/05_argo/argo.py` | argopy standard mode, QC=1 | `argo_profiles.parquet` |
| 6. Model | `models/train.py E1 E2` | cube dataset | `best.pt`, `pred_test.npy`, `results.json` |
| 7. Baselines | `models/b0_climatology.py`, `models/b1_eof.py` | cube dataset | baseline scores / predictions |
| 8. Argo validation | `evaluation/argo_val.py` | cube + armor3d + argo + predictions | `argo_validation.json` |
| 9. App export | `pipeline/06_export/export.py` | all of the above outputs | `app_data/` snapshot (9 files) |
| 10. Tables | `evaluation/make_results_table.py` | `results/*.json` | `results/RESULTS.md` + README splice |

## Reproducing the ensemble (for the Advisor's uncertainty)

The shipped model is a single seed. To generate `temp_spread` (and light up the advisor):

1. Make `SEED` configurable in `models/train.py` (seed every RNG + DataLoader shuffling),
   e.g. `seed = int(os.environ.get("SEED", 0))` at the top.
2. Run `train.py 8 20` three times with `SEED=0,1,2`, saving `pred_test_seed{N}.npy`.
3. Export the mean and the per-pixel standard deviation across seeds as
   `pred_mean.npy` / `pred_spread.npy`; extend `pipeline/06_export/export.py` to add a
   `spread.npy` to `app_data/`.
4. Extend `scripts/build_artifacts.py` to write `temp_spread` into the prediction store.
   Serving already supports it (`/v1/uncertainty`), and the advisor gap-map/OSSE pipeline
   activates as soon as the artifacts exist.

Splits: train 2019-01-01→2022-12-15 · val 2023 · test 2024–2025 (never tuned on test).
