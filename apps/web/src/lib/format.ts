/** Small formatting helpers shared across views. */

export function fmtNum(x: number | null | undefined, digits = 2): string {
  if (x === null || x === undefined || Number.isNaN(x)) return "—";
  return x.toFixed(digits);
}

export function fmtDate(date: string): string {
  const d = new Date(date + "T00:00:00Z");
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function fmtInt(x: number | null | undefined): string {
  if (x === null || x === undefined || Number.isNaN(x)) return "—";
  return x.toLocaleString("en-GB");
}

export function depthLabel(z: number): string {
  return z >= 1000 ? `${z / 1000} km` : `${z} m`;
}
