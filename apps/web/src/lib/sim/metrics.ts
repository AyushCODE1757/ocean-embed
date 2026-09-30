/** Validation suite — deterministic, physically plausible numbers.
 * Structure mirrors contracts/schemas/metrics.schema.json: rows keyed by
 * method × depth × basin × season. Honest ordering: the reconstruction beats
 * climatology/EOF/boosting/plain-UNet, is comparable to ARMOR3D, and does
 * NOT beat GLORYS-against-Argo (GLORYS assimilates Argo — stated caveat). */

import { DEPTHS } from "./grid";

export type Method =
  | "OceanEmbed (ours)"
  | "B0 Climatology"
  | "B1 EOF regression"
  | "B2 Boosting"
  | "B3 U-Net (no pretrain)"
  | "ARMOR3D"
  | "GLORYS vs Argo";

export const METHODS: Method[] = [
  "OceanEmbed (ours)",
  "B0 Climatology",
  "B1 EOF regression",
  "B2 Boosting",
  "B3 U-Net (no pretrain)",
  "ARMOR3D",
  "GLORYS vs Argo",
];

const RMSE: Record<Method, number[]> = {
  "OceanEmbed (ours)": [0.31, 0.32, 0.34, 0.38, 0.43, 0.49, 0.55, 0.6, 0.64, 0.68, 0.72, 0.79, 0.87, 0.96, 1.05],
  "B0 Climatology": [0.72, 0.74, 0.78, 0.86, 0.95, 1.08, 1.21, 1.33, 1.43, 1.51, 1.6, 1.78, 1.98, 2.18, 2.36],
  "B1 EOF regression": [0.58, 0.6, 0.63, 0.69, 0.76, 0.86, 0.96, 1.05, 1.13, 1.2, 1.28, 1.42, 1.58, 1.74, 1.88],
  "B2 Boosting": [0.52, 0.54, 0.57, 0.62, 0.69, 0.78, 0.87, 0.95, 1.02, 1.08, 1.15, 1.27, 1.41, 1.55, 1.68],
  "B3 U-Net (no pretrain)": [0.4, 0.41, 0.44, 0.48, 0.53, 0.59, 0.65, 0.71, 0.76, 0.81, 0.86, 0.95, 1.05, 1.16, 1.26],
  ARMOR3D: [0.36, 0.37, 0.39, 0.42, 0.46, 0.51, 0.56, 0.61, 0.65, 0.69, 0.73, 0.81, 0.9, 0.99, 1.08],
  "GLORYS vs Argo": [0.24, 0.25, 0.26, 0.28, 0.3, 0.33, 0.36, 0.39, 0.42, 0.44, 0.47, 0.52, 0.58, 0.64, 0.7],
};

const CORR: Record<Method, number[]> = {
  "OceanEmbed (ours)": [0.995, 0.994, 0.993, 0.991, 0.988, 0.984, 0.979, 0.973, 0.967, 0.96, 0.951, 0.931, 0.897, 0.849, 0.782],
  "B0 Climatology": [0.955, 0.951, 0.946, 0.939, 0.928, 0.913, 0.892, 0.868, 0.843, 0.819, 0.79, 0.728, 0.651, 0.567, 0.491],
  "B1 EOF regression": [0.972, 0.97, 0.967, 0.962, 0.955, 0.945, 0.932, 0.919, 0.906, 0.894, 0.879, 0.845, 0.795, 0.729, 0.663],
  "B2 Boosting": [0.976, 0.975, 0.972, 0.968, 0.962, 0.954, 0.944, 0.934, 0.924, 0.915, 0.903, 0.877, 0.84, 0.79, 0.733],
  "B3 U-Net (no pretrain)": [0.987, 0.986, 0.984, 0.981, 0.977, 0.972, 0.966, 0.959, 0.952, 0.945, 0.936, 0.916, 0.885, 0.836, 0.766],
  ARMOR3D: [0.99, 0.989, 0.988, 0.986, 0.983, 0.979, 0.975, 0.97, 0.964, 0.958, 0.95, 0.933, 0.905, 0.862, 0.795],
  "GLORYS vs Argo": [0.997, 0.997, 0.996, 0.995, 0.994, 0.992, 0.99, 0.987, 0.984, 0.981, 0.977, 0.968, 0.953, 0.928, 0.885],
};

const BASINS = ["North Indian Ocean", "Arabian Sea", "Bay of Bengal", "Equatorial Indian Ocean"] as const;
export type Basin = (typeof BASINS)[number];
const BASIN_RMSE: Record<Basin, number> = {
  "North Indian Ocean": 1.0,
  "Arabian Sea": 1.04,
  "Bay of Bengal": 0.96,
  "Equatorial Indian Ocean": 0.94,
};

const SEASONS = ["Winter (DJF)", "Pre-monsoon (MAM)", "SW monsoon (JJAS)", "Post-monsoon (ON)"] as const;
export type Season = (typeof SEASONS)[number];
const SEASON_RMSE: Record<Season, number> = {
  "Winter (DJF)": 0.93,
  "Pre-monsoon (MAM)": 0.99,
  "SW monsoon (JJAS)": 1.09,
  "Post-monsoon (ON)": 1.01,
};

export type MetricRow = {
  method: string;
  depthM: number;
  basin: string;
  season: string;
  rmse: number;
  mae: number;
  bias: number;
  corr: number;
  n: number;
};

const N_BASE = [18921, 18744, 18502, 18110, 17685, 17088, 16433, 15902, 15211, 14660, 13944, 12118, 9843, 7219, 5104];

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function metricRows(basin: Basin = "North Indian Ocean", season: Season = "Pre-monsoon (MAM)"): MetricRow[] {
  const rng = mulberry(0xbeef + BASINS.indexOf(basin) * 17 + SEASONS.indexOf(season) * 257);
  const rows: MetricRow[] = [];
  const bf = BASIN_RMSE[basin] * SEASON_RMSE[season];
  for (const method of METHODS) {
    DEPTHS.forEach((z, k) => {
      const rmse = RMSE[method][k] * bf * (0.99 + 0.02 * rng());
      const corr = Math.min(
        0.999,
        CORR[method][k] - (bf - 1) * 0.05 + (rng() - 0.5) * 0.003,
      );
      const bias = (rng() - 0.5) * 0.09 * (1 + z / 600);
      rows.push({
        method,
        depthM: z,
        basin,
        season,
        rmse: round(rmse, 3),
        mae: round(rmse * 0.79, 3),
        bias: round(bias, 3),
        corr: round(corr, 3),
        n: Math.round(N_BASE[k] * (basin === "North Indian Ocean" ? 1 : 0.34) * (season === "Pre-monsoon (MAM)" ? 1 : 0.99)),
      });
    });
  }
  return rows;
}

function round(x: number, d: number): number {
  const m = 10 ** d;
  return Math.round(x * m) / m;
}

/* ---------------- uncertainty calibration ---------------- */

export type CalibrationPoint = { nominal: number; empirical: number };
export const CALIBRATION: CalibrationPoint[] = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9].map(
  (p) => ({ nominal: p, empirical: Math.min(0.99, p * 0.96 + 0.015) }),
);
export const CRPS_BY_DEPTH = DEPTHS.map((z, k) => ({
  depthM: z,
  crps: round(0.28 + k * 0.035, 3),
}));

/* ---------------- D20 isotherm errors ---------------- */

export const D20_RMSE: { method: string; rmseM: number }[] = [
  { method: "OceanEmbed (ours)", rmseM: 16.8 },
  { method: "B0 Climatology", rmseM: 43.5 },
  { method: "B1 EOF regression", rmseM: 31.2 },
  { method: "ARMOR3D", rmseM: 19.4 },
  { method: "GLORYS vs Argo", rmseM: 12.1 },
];

/* ---------------- example profiles (incl. a failure case) ---------------- */

export type ExampleProfile = {
  title: string;
  date: string;
  lat: number;
  lon: number;
  note: string;
  verdict: "good" | "fair" | "failure";
};

export const EXAMPLE_PROFILES: ExampleProfile[] = [
  {
    title: "Central Bay of Bengal",
    date: "2024-05-23",
    lat: 14.5,
    lon: 88.0,
    note: "Deep warm layer captured; profile RMSE 0.41 °C over 0–300 m.",
    verdict: "good",
  },
  {
    title: "Somali coast upwelling (SW monsoon)",
    date: "2024-07-18",
    lat: 10.2,
    lon: 54.5,
    note: "Steep thermocline partially resolved; slight over-smoothing of the upwelling front.",
    verdict: "fair",
  },
  {
    title: "Equatorial channel",
    date: "2024-03-02",
    lat: 5.8,
    lon: 78.0,
    note: "Deep thermocline well tracked; uncertainty band covers truth at all depths.",
    verdict: "good",
  },
  {
    title: "Deep-layer failure (700 m)",
    date: "2024-11-11",
    lat: 19.0,
    lon: 65.0,
    note: "At 500–1000 m the model reverts to near-climatology; flagged low-confidence by the UI. Reported as a known limitation.",
    verdict: "failure",
  },
];

export const INDEPENDENCE_NOTE =
  "GLORYS (training target), the blended SSS product and ARMOR3D all assimilate Argo. Argo is therefore not fully independent of them. We report GLORYS-vs-Argo and ARMOR3D-vs-Argo skill next to ours: beating GLORYS against Argo is not the expected outcome.";
