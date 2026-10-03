# OceanEmbed (SIH26066)

## Overview
OceanEmbed is a proof-of-concept ocean temperature mapping application. The repository contains its data contracts, a FastAPI API, a Next.js web app, and placeholder scripts for the pipeline and model stages.

## Data sources
The application reads its local input and output snapshot from `data/app_data/`. This directory is not committed. The documented sources, coverage, product tiers, and substitutions are listed in [docs/data_sources.md](docs/data_sources.md). Copy authorized data files into the expected local directory before starting the API; no data files are included in this repository.

## Pipeline order
1. 01_glorys_target
2. 02_inputs
3. 03_cube
4. 04_armor3d
5. 05_argo
6. models
7. evaluation

The Python files under `pipeline/`, `models/`, and `evaluation/` are intentionally placeholders marked `# paste from Kaggle notebook`; they do not implement these stages yet.

## Run locally
The API and web app use separate terminals. The API expects its data snapshot under `data/app_data/`.

Terminal 1, from the repository root:

```sh
python -m pip install fastapi uvicorn numpy pandas pyarrow
python -m uvicorn apps.api.main:app --reload --host 0.0.0.0 --port 8000
```

Terminal 2:

```sh
cd apps/web
npm ci
npm run dev -- --hostname 0.0.0.0 --port 3000
```

Open `http://localhost:3000`.

## Run with Docker Compose
With Docker Compose installed and the local data snapshot available, run this from the repository root:

```sh
docker compose up --build
```

The web app is at `http://localhost:3000` and the API is at `http://localhost:8000`.

## Results
There are currently no `results/*.json` files in this repository. Therefore there are no result values to copy into a results table; none are fabricated here. Add the source JSON reports before publishing a populated table.

| Metric | Value | Source |
| --- | --- | --- |

## Limitations
See [docs/limitations.md](docs/limitations.md) for known data and validation limitations. In particular, Argo validation is independent of training, GLORYS assimilates Argo, and some 2025 products are near-real-time.
