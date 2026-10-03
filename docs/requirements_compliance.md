# SIH26066 requirements compliance audit

Checked against the "Expected Solution" hard requirements, file-by-file, on 2026-10-04.
Verdict up front: **all six expected-solution items and all five required variables are
met.** Two substitutions exist; both are documented ADRs and both stay inside the
requirement's own wording (details below).

## A. Expected-solution items

| # | Requirement | Evidence in this repo | Verdict |
|---|---|---|---|
| 1 | End-to-end preprocessing pipeline for satellite and ocean datasets | `training/pipeline/01..06` ran on Kaggle (GLORYS target, inputs, cube, ARMOR3D, Argo, export); modular versions in `packages/data_ingest` + `packages/harmonize` (regrid, masks, climatology, PCHIP, QC, manifest) | **Met** |
| 2 | Satellite embedding engine learning latent ocean representations from surface observations | `training/models/train.py`: conv masked-autoencoder (`Enc`), self-supervised pretraining with block masking over the 7 surface channels (`l_rec`), embedding reused by the decoder | **Met** |
| 3 | Deep learning reconstruction model for subsurface temperature | `training/models/train.py`: decoder head predicts 15 depth levels of temperature anomalies (Huber + vertical-gradient loss), fine-tuned after pretraining; exported `pred_test.npy` | **Met** |
| 4 | Standardized output, daily resolution, 0.25° | Contract grid 0.25° (101×241), daily cube & daily model predictions over the test split; the demo export serves every 2nd day (`every_n_days: 2` in `results/meta.json`) to keep the payload light — the underlying model output is daily (see training README) | **Met** (demo subsampling documented) |
| 5 | Validation framework using independent Argo observations | `training/evaluation/argo_val.py`: QC-filtered raw-profile collocation (nearest 0.25° cell/day), per-depth / basin / season / delayed-mode tables with climatology + ARMOR3D + GLORYS references; surfaced in-app on /validation | **Met** (independence caveat stated everywhere) |
| 6 | Working PoC over Bay of Bengal / Arabian Sea | The app: explorer, compare, section, cyclone, validation pages live against real served predictions | **Met** |

## B. Required variables vs what was actually used

| Variable | Required product (SIH) | Dataset actually downloaded (training/pipeline) | Verdict |
|---|---|---|---|
| SST | OSTIA 0.05° daily — DOI [moi-00168](https://doi.org/10.48670/moi-00168) | `METOFFICE-GLO-SST-L4-REP-OBS-SST` — that is the OSTIA L4 reprocessed analysis (0.05°, daily), regridded to 0.25° | **Exact match** |
| SSS | SMAP+SMOS 0.125° daily — DOI [moi-00051](https://doi.org/10.48670/moi-00051) | `cmems_obs-mob_glo_phy-sss_my_multi_P1D` (multi-year) + `..._nrt_multi_P1D` (2025) — the Multi-Observation Global Ocean SSS product that blends SMOS+SMAP (0.125°, daily) | **Exact match** |
| SSH | DUACS 0.25° daily — DOI [moi-00145](https://doi.org/10.48670/moi-00145) | `cmems_obs-sl_glo_phy-ssh_my_allsat-l4-duacs-0.125deg_P1D-m` — DUACS L4 all-satellite SLA; the 0.125° edition was used and conservatively regridded to 0.25° | **Match** (finer edition of the same DUACS product family; ADR-002) |
| Currents | OSCAR 0.25° daily — [OSCAR_L4_OC_FINAL_V2.0](https://podaac.jpl.nasa.gov/dataset/OSCAR_L4_OC_FINAL_V2.0) | `OSCAR_L4_OC_FINAL_V2.0` via NASA earthaccess (`pipeline/02_inputs/ea.py`), daily-mean regridded to 0.25° | **Exact match** (same dataset ID) |
| Winds | 0.25° daily — [ASCATC-L2-Coastal](https://podaac.jpl.nasa.gov/dataset/ASCATC-L2-Coastal) and/or [CCMP_WINDS_10M6HR_L4_V3.1](https://podaac.jpl.nasa.gov/dataset/CCMP_WINDS_10M6HR_L4_V3.1) | `CCMP_WINDS_10M6HR_L4_V3.1` via earthaccess, 6-hourly aggregated to daily u/v, regridded to 0.25° | **Match** — CCMP is one of the two wind sources the requirement itself lists; ASCAT L2 Coastal is a swath product already ingested into CCMP. Skipping ASCAT directly is ADR-002 |

## C. The two substitutions, stated plainly

1. **DUACS 0.125° instead of 0.25°** — we downloaded the *finer* native edition of the same
   DUACS L4 product and averaged to the contract grid. The required 0.25° daily grid is
   what the model receives. No information is lost; documented in ADR-002.
2. **ASCAT L2 Coastal skipped; CCMP used** — the requirement lists both links under
   "Winds". CCMP v3.1 is a gridded 6-hourly product that already assimilates ASCAT (and
   other scatterometers), aggregated here to the required 0.25° daily u/v. Using the swath
   L2 product on top would double-count the same winds. Documented in ADR-002.

## D. Honest caveats (not gaps, but say them out loud)

- "Independent" Argo validation carries the standard caveat: the training target
  (GLORYS), the benchmark (ARMOR3D) and the SSS product assimilate Argo. We therefore
  show GLORYS-vs-Argo and ARMOR3D-vs-Argo next to ours on every table.
- The demo app serves every 2nd day of the test period; the trained model itself produces
  daily fields and the contract/pipeline are daily. Re-exporting the app snapshot at
  stride 1 is a single `k = arange(...)` change in `training/pipeline/06_export/export.py`.
- 2025 SSS and ARMOR3D editions are near-real-time (noted in `results/meta.json`).

## E. Where the evidence lives

- Downloads: `training/pipeline/01_glorys_target/run.py`, `training/pipeline/02_inputs/inputs.py`, `training/pipeline/02_inputs/ea.py`
- Cube + masks + climatology: `training/pipeline/03_cube/m2.py`, `packages/harmonize`
- Embedding + reconstruction: `training/models/train.py`
- Validation: `training/evaluation/argo_val.py`, `results/argo_validation.json`, `/validation` page
- PoC: `apps/web`, served by `packages/serving` from real artifacts
