/** Shareable view state — every view serialises to the URL so links are
 * stable and the back button works (HCI: continuous-use support). */

export type ViewState = {
  date: string;
  depth: number;
  layer?: string;
  lat?: number;
  lon?: number;
};

export function parseView(sp: URLSearchParams, fallback: ViewState): ViewState {
  const num = (k: string) => {
    const v = Number(sp.get(k));
    return sp.has(k) && Number.isFinite(v) ? v : undefined;
  };
  return {
    date: sp.get("date") ?? fallback.date,
    depth: num("depth") ?? fallback.depth,
    layer: sp.get("layer") ?? fallback.layer,
    lat: num("lat"),
    lon: num("lon"),
  };
}

export function serializeView(v: ViewState): string {
  const sp = new URLSearchParams({ date: v.date, depth: String(v.depth) });
  if (v.layer) sp.set("layer", v.layer);
  if (v.lat !== undefined && v.lon !== undefined) {
    sp.set("lat", v.lat.toFixed(2));
    sp.set("lon", v.lon.toFixed(2));
  }
  return sp.toString();
}
