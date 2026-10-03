const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type Provenance = { run_id: string; model_id: string; source_tier: string };
export type Meta = {
  lat: number[]; lon: number[]; depths_m: number[];
  dates: string[]; data_through: string | null; provenance: Provenance;
};
export type Slice = {
  date: string; depth_m: number; lat: number[]; lon: number[];
  values: (number | null)[][]; provenance: Provenance;
};
export type Profile = {
  date: string; lat: number; lon: number; depths_m: number[];
  mean: (number | null)[]; spread: (number | null)[]; provenance: Provenance;
};

export type MetricRow = {
  method: string; depth_m: number; basin: string; season: string;
  rmse: number | null; bias: number | null; corr: number | null; n: number;
};
export type Metrics = {
  run_id: string; test_years: number[]; independence_note: string | null; rows: MetricRow[];
};

export type GapSite = {
  rank: number; lat: number; lon: number; score: number;
  uncertainty: number | null; dist_to_argo_km: number | null;
};
export type Gaps = { date: string; method_note: string | null; sites: GapSite[] };
export type OsseArm = { name: string; mean_rmse: number; std_rmse: number };
export type Osse = {
  run_id: string; k: number; n_dates: number; n_seeds: number;
  limitation_note: string | null; arms: OsseArm[];
};

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function get<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
  const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
  const res = await fetch(`${BASE}${path}?${qs}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.detail ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

export const api = {
  meta: () => get<Meta>("/v1/meta"),
  slice: (date: string, depth: number) => get<Slice>("/v1/slice", { date, depth }),
  profile: (date: string, lat: number, lon: number) => get<Profile>("/v1/profile", { date, lat, lon }),
  metrics: (f: Record<string, string> = {}) => get<Metrics>("/v1/metrics", f),
  uncertainty: (date: string, depth: number) => get<Slice>("/v1/uncertainty", { date, depth }),
  gaps: (date: string, k = 10) => get<Gaps>("/v1/gaps", { date, k }),
  osse: () => get<Osse>("/v1/osse"),
};
