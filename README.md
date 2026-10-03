# OceanEmbed (SIH26066)

## Overview
This repository contains the M0 contracts and the PoC web application driven by the real test-period data under `data/app_data`.

## Data sources
- GLORYS target arrays and climatology from the test period snapshot in `data/app_data`.
- Real Argo profiles in `data/app_data/argo.parquet`.
- Validation metrics from `results.json` and `argo_validation.json`.

## Pipeline order
1. 01_glorys_target
2. 02_inputs
3. 03_cube
4. 04_armor3d
5. 05_argo
6. models
7. evaluation

## Run the app
1. Start the API:
   `cd apps/api && uvicorn main:app --host 0.0.0.0 --port 8000`
2. Start the web app:
   `cd apps/web && npm install && npm run dev -- --hostname 0.0.0.0 --port 3000`
3. Open `http://localhost:3000`.
4. Or run the full stack with Docker Compose:
   `docker compose up --build`

## Limitations
- Argo validation is independent and not used as a training target.
- The test-period data is meant for PoC exploration only.
- SSS and ARMOR3D in 2025 are near-real-time, not final.
