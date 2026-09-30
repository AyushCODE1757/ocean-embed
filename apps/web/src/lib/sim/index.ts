/** SimApi — the demo data facade. Mirrors the shape of the real
 * contracts/openapi endpoints, adds realistic latency so loading states,
 * skeletons and progress behave like the production system.
 * All data comes from the deterministic simulator in this folder. */

import { DEPTHS, LATS, LONS, N_LAT, N_LON, landMask } from "./grid";
import { tempField, profileAt } from "./ocean";
import { DATES, DEFAULT_DATE, dateIndex } from "./ocean-dates";
import { sigmaField, depthConfidence } from "./uncertainty";
import { nearbyProfiles, floatsOn, type NearbyProfile } from "./argo";
import { heatField, heatSigma, HEAT_UNITS, type HeatMetric } from "./derived";
import { gapSites, type GapSite } from "./gaps";
import { osseResult, type Osse } from "./osse";
import {
  metricRows,
  CALIBRATION,
  CRPS_BY_DEPTH,
  D20_RMSE,
  EXAMPLE_PROFILES,
  INDEPENDENCE_NOTE,
  type Basin,
  type Season,
  type MetricRow,
} from "./metrics";
import { MODEL, RUN, inputCompleteness, INPUT_CHANNELS } from "./meta";
import { getCyclone, type Cyclone } from "./cyclone";
import { hashSeed, mulberry32 } from "./rng";

export type Layer = "temp" | "anomaly" | "truth" | "diff" | "uncertainty" | "ohc" | "d26" | "d20";

export type Grid = { values: (number | null)[][]; vmin: number; vmax: number; units: string };

export type Meta = {
  model: typeof MODEL;
  run: typeof RUN;
  dates: string[];
  defaultDate: string;
  depths: number[];
  lat: number[];
  lon: number[];
  inputs: ReturnType<typeof inputCompleteness>;
  channels: typeof INPUT_CHANNELS;
};

export type Profile = {
  date: string;
  lat: number;
  lon: number;
  depths: number[];
  mean: (number | null)[];
  spread: (number | null)[];
  truth: (number | null)[];
  clim: (number | null)[];
  argo: NearbyProfile[];
  confidence: { label: string; tone: "ok" | "warn" | "danger" };
  rmse03: number; // profile RMSE 0–300 m vs truth
};

export type Section = {
  date: string;
  from: { lat: number; lon: number };
  to: { lat: number; lon: number };
  depths: number[];
  distsKm: number[];
  values: (number | null)[][];
};

/* ------------------------------------------------------------------ */

const sleep = (ms: number) => new Promise<void>((res) => setTimeout(res, ms));

function jitter(base: number, key: string): number {
  const rng = mulberry32(hashSeed(key + Date.now().toString().slice(0, 9)));
  return Math.round(base * (0.75 + 0.5 * rng()));
}

function maskToGrid(field: Float32Array): (number | null)[][] {
  const rows: (number | null)[][] = [];
  for (let r = 0; r < N_LAT; r++) {
    const row: (number | null)[] = [];
    for (let c = 0; c < N_LON; c++) {
      const v = field[r * N_LON + c];
      row.push(Number.isNaN(v) ? null : Math.round(v * 1000) / 1000);
    }
    rows.push(row);
  }
  return rows;
}

function extent(field: Float32Array): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < field.length; i++) {
    const v = field[i];
    if (!Number.isNaN(v)) {
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  }
  return [lo, hi];
}

/* ------------------------------------------------------------------ */

const LAYER_UNITS: Record<Layer, string> = {
  temp: "°C",
  anomaly: "°C",
  truth: "°C",
  diff: "°C",
  uncertainty: "°C (1σ)",
  ohc: HEAT_UNITS.ohc,
  d26: HEAT_UNITS.d26,
  d20: HEAT_UNITS.d20,
};

export const simApi = {
  dates: DATES,
  depths: DEPTHS as unknown as number[],

  async meta(): Promise<Meta> {
    await sleep(jitter(240, "meta"));
    return {
      model: MODEL,
      run: RUN,
      dates: DATES,
      defaultDate: DEFAULT_DATE,
      depths: [...DEPTHS],
      lat: [...LATS],
      lon: [...LONS],
      inputs: inputCompleteness(DEFAULT_DATE),
      channels: INPUT_CHANNELS,
    };
  },

  async slice(date: string, depth: number, layer: Layer = "temp"): Promise<Grid & { date: string; depth: number; layer: Layer }> {
    await sleep(jitter(330, `slice${date}${depth}${layer}`));
    const di = dateIndex(date);
    let field: Float32Array;
    if (layer === "uncertainty") {
      const k = DEPTHS.indexOf(depth as (typeof DEPTHS)[number]);
      field = sigmaField(di, k < 0 ? 0 : k);
    } else if (layer === "ohc" || layer === "d26" || layer === "d20") {
      field = heatField(layer, di);
    } else {
      const k = DEPTHS.indexOf(depth as (typeof DEPTHS)[number]);
      field = tempField(layer === "temp" ? "recon" : layer, di, k < 0 ? 0 : k);
    }
    const [vmin, vmax] = extent(field);
    return {
      date,
      depth: layer === "temp" || layer === "anomaly" || layer === "truth" || layer === "uncertainty" ? depth : 0,
      layer,
      values: maskToGrid(field),
      vmin: Math.round(vmin * 100) / 100,
      vmax: Math.round(vmax * 100) / 100,
      units: LAYER_UNITS[layer],
    };
  },

  async profile(date: string, lat: number, lon: number): Promise<Profile> {
    await sleep(jitter(470, `profile${date}${lat}${lon}`));
    const di = dateIndex(date);
    const r = Math.min(N_LAT - 1, Math.max(0, Math.round((lat - LATS[0]) / 0.25)));
    const c = Math.min(N_LON - 1, Math.max(0, Math.round((lon - LONS[0]) / 0.25)));
    const mean = profileAt("recon", di, r, c);
    const truth = profileAt("truth", di, r, c);
    const clim = profileAt("clim", di, r, c);
    const sig = DEPTHS.map((_, k) => sigmaField(di, k)[r * N_LON + c]);
    const argo = nearbyProfiles(LATS[r], LONS[c], di);
    let acc = 0;
    let n = 0;
    DEPTHS.forEach((z, k) => {
      if (z <= 300) {
        acc += (mean[k] - truth[k]) ** 2;
        n++;
      }
    });
    return {
      date,
      lat: LATS[r],
      lon: LONS[c],
      depths: [...DEPTHS],
      mean,
      spread: sig,
      truth,
      clim,
      argo,
      confidence: depthConfidence(0),
      rmse03: Math.round(Math.sqrt(acc / Math.max(1, n)) * 100) / 100,
    };
  },

  async section(date: string, from: { lat: number; lon: number }, to: { lat: number; lon: number }, steps = 60): Promise<Section> {
    await sleep(jitter(520, `section${date}`));
    const di = dateIndex(date);
    const dists: number[] = [];
    const values: (number | null)[][] = DEPTHS.map(() => []);
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const lat = from.lat + (to.lat - from.lat) * t;
      const lon = from.lon + (to.lon - from.lon) * t;
      const r = Math.min(N_LAT - 1, Math.max(0, Math.round((lat - LATS[0]) / 0.25)));
      const c = Math.min(N_LON - 1, Math.max(0, Math.round((lon - LONS[0]) / 0.25)));
      dists.push(Math.round(t * 1000) / 10);
      DEPTHS.forEach((_, k) => {
        const v = tempField("recon", di, k)[r * N_LON + c];
        values[k].push(Number.isNaN(v) ? null : Math.round(v * 100) / 100);
      });
    }
    return { date, from, to, depths: [...DEPTHS], distsKm: dists, values };
  },

  async gaps(date: string, k = 10, onProgress?: (pct: number) => void): Promise<{ date: string; methodNote: string; sites: GapSite[]; floatCount: number }> {
    for (const pct of [18, 42, 71, 93]) {
      await sleep(jitter(210, `gaps${pct}`));
      onProgress?.(pct);
    }
    await sleep(jitter(120, "gaps-done"));
    onProgress?.(100);
    const res = gapSites(date, k);
    const mask = landMask();
    let wet = 0;
    for (let i = 0; i < mask.length; i++) if (!mask[i]) wet++;
    void wet;
    return { date, methodNote: res.methodNote, sites: res.sites, floatCount: floatsOn(dateIndex(date)).length };
  },

  async osse(): Promise<Osse> {
    await sleep(jitter(720, "osse"));
    return osseResult();
  },

  async metrics(basin: Basin = "North Indian Ocean", season: Season = "Pre-monsoon (MAM)"): Promise<{
    rows: MetricRow[];
    independenceNote: string;
    calibration: typeof CALIBRATION;
    crps: typeof CRPS_BY_DEPTH;
    d20: typeof D20_RMSE;
    examples: typeof EXAMPLE_PROFILES;
    testYears: number[];
  }> {
    await sleep(jitter(540, `metrics${basin}${season}`));
    return {
      rows: metricRows(basin, season),
      independenceNote: INDEPENDENCE_NOTE,
      calibration: CALIBRATION,
      crps: CRPS_BY_DEPTH,
      d20: D20_RMSE,
      examples: EXAMPLE_PROFILES,
      testYears: [2024, 2025],
    };
  },

  async heat(date: string, metric: HeatMetric, cellLat?: number, cellLon?: number): Promise<Grid & { date: string; metric: HeatMetric; sigma?: number }> {
    await sleep(jitter(450, `heat${date}${metric}`));
    const di = dateIndex(date);
    const field = heatField(metric, di);
    const [vmin, vmax] = extent(field);
    let sigma: number | undefined;
    if (cellLat !== undefined && cellLon !== undefined) {
      const r = Math.min(N_LAT - 1, Math.max(0, Math.round((cellLat - LATS[0]) / 0.25)));
      const c = Math.min(N_LON - 1, Math.max(0, Math.round((cellLon - LONS[0]) / 0.25)));
      const s = heatSigma(metric, di, r, c);
      sigma = Number.isNaN(s) ? undefined : Math.round(s * 10) / 10;
    }
    return {
      date,
      metric,
      values: maskToGrid(field),
      vmin: Math.round(vmin * 10) / 10,
      vmax: Math.round(vmax * 10) / 10,
      units: HEAT_UNITS[metric],
      sigma,
    };
  },

  async cyclone(id?: string): Promise<Cyclone> {
    await sleep(jitter(380, "cyclone"));
    return getCyclone(id ?? "remal-2024");
  },

  floatPositions(date: string): { id: string; lat: number; lon: number }[] {
    return floatsOn(dateIndex(date)).map((f) => ({ id: f.id, lat: f.lat, lon: f.lon }));
  },

  provenance() {
    return { model: MODEL, run: RUN, inputs: INPUT_CHANNELS };
  },
};

export type SimApi = typeof simApi;
