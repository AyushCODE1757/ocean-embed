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
};
