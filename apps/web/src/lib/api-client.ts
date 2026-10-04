/* Typed client for the OceanEmbed API (packages/serving).
   All shapes mirror the pydantic schemas in serving/schemas.py. */

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function get<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
  const qs = params
    ? "?" + new URLSearchParams(
        Object.entries(params)
          .filter(([, v]) => v !== undefined && v !== "")
          .map(([k, v]) => [k, String(v)]),
      ).toString()
    : "";
  const res = await fetch(`${BASE}${path}${qs}`, { cache: "no-store" });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      if (typeof body.detail === "string") detail = body.detail;
    } catch { /* status text is enough */ }
    throw new ApiError(res.status, detail);
  }
  return res.json() as Promise<T>;
}

export interface Provenance {
  run_id: string;
  model_id: string;
  source_tier: string;
}

export interface Meta {
  lat: number[];
  lon: number[];
  depths_m: number[];
  dates: string[];
  data_through: string | null;
  provenance: Provenance;
}

export type SliceField = "model" | "truth" | "clim" | "error";

export interface Slice {
  date: string;
  depth_m: number;
  field: SliceField;
  lat: number[];
  lon: number[];
  values: (number | null)[][];
  provenance: Provenance;
}

export interface ArgoObservation {
  time: string;
  lat: number;
  lon: number;
  depth_m: number;
  temp_c: number;
  data_mode: string;
  platform: string;
  cycle: number;
}

export interface Profile {
  date: string;
  lat: number;
  lon: number;
  depths_m: number[];
  mean: (number | null)[];
  spread: (number | null)[];
  truth: (number | null)[];
  clim: (number | null)[];
  argo: ArgoObservation[];
  argo_note: string | null;
  provenance: Provenance;
}

export interface MetricRow {
  method: string;
  depth_m: number;
  basin: string;
  season: string;
  rmse: number | null;
  bias: number | null;
  corr: number | null;
  n: number;
}

export interface Metrics {
  run_id: string;
  test_years: number[];
  independence_note: string | null;
  rows: MetricRow[];
}

export interface Section {
  date: string;
  distance_km: number[];
  lat: number[];
  lon: number[];
  depths_m: number[];
  values: (number | null)[][];
  provenance: Provenance;
}

export interface HeatField {
  date: string;
  metric: string;
  units: string;
  method: string;
  lat: number[];
  lon: number[];
  values: (number | null)[][];
  provenance: Provenance;
}

export interface TrackPoint {
  iso_time: string;
  lat: number;
  lon: number;
  wind_kt: number | null;
  pres_hpa: number | null;
  dist2land_km: number | null;
  landfall: number | null;
}

export interface Storm {
  sid: string;
  name: string;
  basin: string;
  season: number;
  n_points: number;
  track: TrackPoint[];
}

export interface Cyclones {
  source: string | null;
  source_url: string | null;
  retrieved_utc: string | null;
  note: string | null;
  storms: Storm[];
}

export interface GapSite {
  rank: number;
  lat: number;
  lon: number;
  score: number;
  uncertainty: number | null;
  dist_to_argo_km: number | null;
}

export interface Gaps {
  date: string;
  method_note: string | null;
  sites: GapSite[];
}

export interface OsseArm {
  name: string;
  mean_rmse: number;
  std_rmse: number;
}

export interface Osse {
  run_id: string;
  k: number;
  n_dates: number;
  n_seeds: number;
  limitation_note: string | null;
  arms: OsseArm[];
}

export const api = {
  meta: () => get<Meta>("/v1/meta"),
  slice: (date: string, depth: number, field: SliceField = "model") =>
    get<Slice>("/v1/slice", { date, depth, field }),
  profile: (date: string, lat: number, lon: number) =>
    get<Profile>("/v1/profile", { date, lat, lon }),
  metrics: (method?: string, basin?: string, season?: string) =>
    get<Metrics>("/v1/metrics", { method, basin, season }),
  section: (date: string, path: string, n = 120) =>
    get<Section>("/v1/section", { date, path, n }),
  heat: (date: string, metric: "ohc" | "d26" | "d20") =>
    get<HeatField>("/v1/heat", { date, metric }),
  cyclones: () => get<Cyclones>("/v1/cyclones"),
  gaps: (date: string, k = 10) => get<Gaps>("/v1/gaps", { date, k }),
  osse: () => get<Osse>("/v1/osse"),
  provenance: () => get<Record<string, unknown>>("/v1/provenance"),
};

/* tiny client-side cache so navigating between pages does not refetch meta */
let metaPromise: Promise<Meta> | null = null;
export function cachedMeta(): Promise<Meta> {
  if (!metaPromise) {
    metaPromise = api.meta().catch((e) => {
      metaPromise = null;
      throw e;
    });
  }
  return metaPromise;
}

/* slice cache + prefetch (explorer smoothness) */
const sliceCache = new Map<string, Slice>();
export function cachedSlice(date: string, depth: number, field: SliceField): Promise<Slice> {
  const key = `${field}|${depth}|${date}`;
  const hit = sliceCache.get(key);
  if (hit) return Promise.resolve(hit);
  return api.slice(date, depth, field).then((s) => {
    if (sliceCache.size > 240) sliceCache.clear();
    sliceCache.set(key, s);
    return s;
  });
}
export function prefetchSlices(dates: string[], depth: number, field: SliceField) {
  for (const d of dates) {
    const key = `${field}|${depth}|${d}`;
    if (!sliceCache.has(key)) void cachedSlice(d, depth, field);
  }
}
