/* Small formatting helpers shared across pages. */

export function fmtDate(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

export function fmtTemp(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined || !isFinite(v)) return "—";
  return v.toFixed(digits) + " °C";
}

export function fmtNum(v: number | null | undefined, digits = 3): string {
  if (v === null || v === undefined || !isFinite(v)) return "—";
  return v.toFixed(digits);
}

export function fmtKm(v: number | null | undefined): string {
  if (v === null || v === undefined || !isFinite(v)) return "—";
  return Math.round(v).toLocaleString("en-US") + " km";
}

export function methodLabel(m: string): string {
  switch (m) {
    case "oceanembed": return "OceanEmbed";
    case "climatology": return "Climatology";
    case "glorys": return "GLORYS";
    case "armor3d": return "ARMOR3D";
    default: return m;
  }
}

export function seasonLabel(s: string): string {
  switch (s) {
    case "all": return "All seasons";
    case "delayed": return "Delayed-mode Argo";
    case "premonsoon": return "Pre-monsoon";
    case "swmonsoon": return "SW monsoon";
    case "postmonsoon": return "Post-monsoon";
    case "winter": return "Winter";
    default: return s;
  }
}

export function basinLabel(b: string): string {
  switch (b) {
    case "all": return "All basins";
    case "ArabianSea": return "Arabian Sea";
    case "BayOfBengal": return "Bay of Bengal";
    case "other": return "Other";
    default: return b;
  }
}
