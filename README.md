# OceanEmbed

**Daily subsurface ocean temperature for the North Indian Ocean, reconstructed from satellites — and validated honestly against Argo.**

OceanEmbed reconstructs temperature at 15 depths (0–1000 m) on a 0.25° daily grid
(5–30°N, 45–105°E: Arabian Sea, Bay of Bengal, equatorial Indian Ocean) from **seven
satellite surface observations** (SST, SSS, SLA, u/v currents, u/v winds). The model is a
masked-autoencoder embedding + depth decoder trained on GLORYS anomalies. Everything in the
app, the tables and this README comes from computed files — **no synthetic data anywhere.**

> SIH problem 26066 · test years 2024–2025 held out · train 2019–2022 · validate 2023

---

## Results (computed, not tuned)

Full tables: [`results/RESULTS.md`](results/RESULTS.md) — rendered from
`results/results.json` and `results/argo_validation.json` by
`training/evaluation/make_results_table.py`. Headlines at the thermocline (100 m):

| Comparison | Climatology | OceanEmbed | Best reference |
|---|---|---|---|
| vs GLORYS (held-out test) | 1.837 °C | **1.381 °C** | — |
| vs raw Argo (all profiles, n≈6.8k) | 1.915 °C | 1.730 °C | ARMOR3D **0.712 °C**, GLORYS 1.224 °C |

We beat climatology everywhere above 500 m (skill vs climatology up to 0.45 at 75 m),
but **we lose to ARMOR3D and GLORYS against raw Argo**, and we have **no skill below
~500 m**. Both facts are printed in the app, not hidden. The Argo-independence caveat
(GLORYS, ARMOR3D and the SSS product all assimilate Argo) is shown next to every
Argo table.

## The app

```sh
make setup        # uv sync + npm ci
make artifacts    # decode B's export -> artifacts/predictions.zarr + metrics + manifest
make serve        # API on :8000
make web          # UI on :3000
```

Or with Docker (needs `cp .env.example .env` first): `docker compose -f
infra/docker-compose.yml up --build`. On a clean clone the API serves real numbers only
after `make artifacts` has run against B's exported snapshot; endpoints answer **503 with
a reason** rather than showing fake data.

Pages: **Explorer** (map, date/depth/field, click-for-profile with real Argo overlay,
shareable URLs, keyboard: ←/→ date, +/− depth) · **Compare** (model vs GLORYS vs error)
· **Section** (distance×depth along preset or custom transects) · **Cyclones** (IBTrACS
Remal & Fengal 2024 tracks over reconstructed OHC / 26 °C isotherm) · **Validation**
(skill tables, baselines, caveats) · **Advisor** (float-placement pipeline status —
honest about what this run does not include) · **About** (provenance, sources,
limitations).

## Repository layout

| Path | What it is |
|---|---|
| `contracts/` | M0 contracts: grid/depths/channels/splits YAML, 14 JSON schemas, OpenAPI, `oceanembed-contracts` package |
| `packages/data_ingest/` | M1 downloaders (Copernicus, PO.DAAC, Argo), manifest engine |
| `packages/harmonize/` | M2 regrid, masks, climatology, vertical PCHIP, QC, cube builder |
| `packages/evaluation/` | M6 metrics, Argo validation, baselines, breakdowns, uncertainty |
| `packages/serving/` | M7 FastAPI app (`/v1/*`), reads only computed artifacts |
| `apps/web/` | M8 Next.js 16 + MapLibre 6 front end (this UI) |
| `training/` | **Person B's Kaggle pipeline + model + evaluation, byte-verbatim** — the provenance of every number |
| `scripts/build_artifacts.py` | bridge: `data/app_data` → serving artifacts |
| `scripts/fetch_cyclones.py` | IBTrACS v04r01 → bundled cyclone reference |
| `results/` | B's computed result tables (source of truth for metrics) |
| `docs/` | data sources, limitations, ADRs |
| `infra/` | Docker, compose, CI workflows, version checks |

## Data pipeline (as run)

All heavy compute ran on Kaggle (see `training/`): monthly downloads (GLORYS target;
OSTIA/SMOS-SMAP/DUACS/OSCAR/CCMP inputs; ARMOR3D benchmark; argopy Argo profiles) →
0.25° daily cube with masks → masked-autoencoder pretraining + decoder fine-tuning
(`training/models/train.py`) → export (`training/pipeline/06_export/export.py`) to
int16 snapshots (scale 0.01, nodata −32768). Locally, `scripts/build_artifacts.py`
decodes that export into the prediction store the API serves.

## Truth policy

1. Every number in the UI/README comes from a computed artifact with a hashed manifest.
2. Test fixtures are tiny, labelled, and never served.
3. Where something is not computed (e.g. uncertainty — needs a seed ensemble), the app
   says so instead of inventing values.
4. We report where we lose as prominently as where we win.

## Limitations

See [`docs/limitations.md`](docs/limitations.md). Short version: no skill below ~500 m;
+0.8 °C warm bias at 100–125 m vs Argo; GLORYS-as-teacher; 2025 SSS/ARMOR3D are
near-real-time; uncertainty/advisor artifacts absent in this run.

## Team

- **A** — contracts, data ingest, harmonization, evaluation packages
- **B** — Kaggle pipeline, model training, validation tables, v1 app
- **C** — serving API, web application, infrastructure, final integration

## License

MIT — see [LICENSE](LICENSE). Data products remain under their providers' terms
(see `docs/licenses` in ADRs and `docs/data_sources.md`).
