/** Demo date axis: test years 2024-01-01 … 2025-12-31, daily UTC steps. */

export const DATES: string[] = (() => {
  const out: string[] = [];
  const d = new Date(Date.UTC(2024, 0, 1));
  const end = new Date(Date.UTC(2025, 11, 31));
  while (d <= end) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
})();

export const DEFAULT_DATE = "2024-05-23";

export function dateIndex(date: string): number {
  const i = DATES.indexOf(date);
  return i >= 0 ? i : 0;
}
