export type ViewState = { date: string; depth: number; lat?: number; lon?: number };

export function parseView(sp: URLSearchParams, fallback: ViewState): ViewState {
  const num = (k: string) => (sp.has(k) && Number.isFinite(Number(sp.get(k))) ? Number(sp.get(k)) : undefined);
  return {
    date: sp.get("date") ?? fallback.date,
    depth: num("depth") ?? fallback.depth,
    lat: num("lat"),
    lon: num("lon"),
  };
}

export function serializeView(v: ViewState): string {
  const sp = new URLSearchParams({ date: v.date, depth: String(v.depth) });
  if (v.lat !== undefined && v.lon !== undefined) {
    sp.set("lat", v.lat.toFixed(3));
    sp.set("lon", v.lon.toFixed(3));
  }
  return sp.toString();
}
