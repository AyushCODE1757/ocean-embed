/** Simulated Argo float network over the demo period.
 * ~40 floats, smooth deterministic drift (westward bias), 10-day cycle. */

import {
  LATS,
  LONS,
  N_LAT,
  N_LON,
  landMask,
  latIndex,
  lonIndex,
  distKm,
  DEPTHS,
} from "./grid";
import { mulberry32, gaussian } from "./rng";
import { tempField } from "./ocean";
import { DATES } from "./ocean-dates";

export type FloatState = {
  id: string;
  lat: number;
  lon: number;
  lastCycleIdx: number; // most recent profile date index
};

type FloatDef = {
  id: string;
  lat0: number;
  lon0: number;
  phase: number;
  bornCycle: number;
};

const FLOAT_DEFS: FloatDef[] = (() => {
  const rng = mulberry32(0xa17c0);
  const mask = landMask();
  const defs: FloatDef[] = [];
  let guard = 0;
  while (defs.length < 40 && guard++ < 6000) {
    const r = Math.floor(rng() * N_LAT);
    const c = Math.floor(rng() * N_LON);
    if (mask[r * N_LON + c]) continue;
    defs.push({
      id: `1900${(defs.length + 93).toString().padStart(4, "0")}`,
      lat0: LATS[r],
      lon0: LONS[c],
      phase: rng() * Math.PI * 2,
      bornCycle: -Math.floor(rng() * 10),
    });
  }
  return defs;
})();

/** Float positions on a date: smooth pseudo-drift, kept inside the domain. */
export function floatsOn(dateIdx: number): FloatState[] {
  return FLOAT_DEFS.map((d) => {
    const t = dateIdx * 0.011;
    const lat = Math.max(
      5.6,
      Math.min(
        29.4,
        d.lat0 + 0.55 * Math.sin(t + d.phase) + 0.2 * Math.sin(2.3 * t + d.phase),
      ),
    );
    let lon = d.lon0 - 0.9 * ((dateIdx / 730) * 3.0) + 0.45 * Math.cos(t + d.phase);
    lon = Math.max(45.4, Math.min(104.6, lon));
    const lastCycleIdx = d.bornCycle + Math.floor((dateIdx - d.bornCycle) / 10) * 10;
    return { id: d.id, lat, lon, lastCycleIdx };
  });
}

export type NearbyProfile = {
  floatId: string;
  lat: number;
  lon: number;
  distKm: number;
  daysAgo: number;
  temp: number[]; // 15 depths, °C
};

/** Realistic float profiles near a point: truth field + small noise. */
export function nearbyProfiles(
  lat: number,
  lon: number,
  dateIdx: number,
  radiusKm = 420,
  limit = 3,
): NearbyProfile[] {
  const fs = floatsOn(dateIdx);
  const near = fs
    .map((f) => ({ f, d: distKm(lat, lon, f.lat, f.lon) }))
    .filter((x) => x.d <= radiusKm)
    .sort((a, b) => a.d - b.d)
    .slice(0, limit);
  const rng = mulberry32(0x5eed + dateIdx);
  const dateStr = DATES[dateIdx];
  return near.map(({ f, d }) => {
    const r = latIndex(f.lat);
    const c = lonIndex(f.lon);
    const temp: number[] = [];
    for (let k = 0; k < DEPTHS.length; k++) {
      const fld = tempField("truth", dateIdx, k);
      const v = fld[r * N_LON + c];
      temp.push(Number.isNaN(v) ? NaN : v + gaussian(rng) * 0.03);
    }
    const daysAgo = Math.max(
      0,
      Math.round(
        (new Date(dateStr).getTime() - new Date(DATES[Math.max(0, f.lastCycleIdx)]).getTime()) /
          86400000,
      ),
    );
    return { floatId: f.id, lat: f.lat, lon: f.lon, distKm: d, daysAgo, temp };
  });
}

/** Distance (km) from each cell to the nearest recent float profile. */
const distCache = new Map<number, Float32Array>();
export function distanceToArgo(dateIdx: number): Float32Array {
  const key = Math.floor(dateIdx / 5);
  const hit = distCache.get(key);
  if (hit) return hit;
  if (distCache.size > 40) distCache.clear();
  const fs = floatsOn(dateIdx);
  const out = new Float32Array(N_LAT * N_LON);
  for (let r = 0; r < N_LAT; r++) {
    for (let c = 0; c < N_LON; c++) {
      let best = Infinity;
      for (const f of fs) {
        const d = distKm(LATS[r], LONS[c], f.lat, f.lon);
        if (d < best) best = d;
      }
      out[r * N_LON + c] = best;
    }
  }
  distCache.set(key, out);
  return out;
}
