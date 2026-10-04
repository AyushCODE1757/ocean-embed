export type ViewState = { date: string; depth: number; field?: string; lat?: number; lon?: number };

export function parseView(sp: URLSearchParams, fallback: ViewState): ViewState {
  const num = (k: string) => (sp.has(k) && Number.isFinite(Number(sp.get(k))) ? Number(sp.get(k)) : undefined);
  return {
    date: sp.get("date") ?? fallback.date,
    depth: num("depth") ?? fallback.depth,
    field: sp.get("field") ?? undefined,
    lat: num("lat"),
    lon: num("lon"),
  };
}

export function serializeView(v: ViewState): string {
  const sp = new URLSearchParams({ date: v.date, depth: String(v.depth) });
  if (v.field && v.field !== "model") sp.set("field", v.field);
  if (v.lat !== undefined && v.lon !== undefined) {
    sp.set("lat", v.lat.toFixed(3));
    sp.set("lon", v.lon.toFixed(3));
  }
  return sp.toString();
}

export function parseShareState(search: string): ViewState {
  return parseView(new URLSearchParams(search), { date: "", depth: 0 });
}

export function toShareState(v: ViewState): string {
  return serializeView(v);
}
