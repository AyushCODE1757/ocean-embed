/** Cyclone case study — Cyclone Remal (Bay of Bengal, May 2024).
 * Track approximated at 6-hourly steps from IMD best-track reports.
 * Provides the cold-wake SST anomaly used by the ocean simulator. */

import { DATES } from "./ocean-dates";
import { N_CELLS, LATS, LONS, N_LAT, N_LON, distKm, landMask } from "./grid";

export type TrackPoint = {
  time: string; // ISO, e.g. 2024-05-24T00
  lat: number;
  lon: number;
  windKt: number;
  cat: string; // IMD scale: D, DD, CS, SCS, VSCS, ESCS
};

export type Cyclone = {
  id: string;
  name: string;
  basin: string;
  season: number;
  formed: string;
  dissipated: string;
  peakKt: number;
  landfallNear: string;
  narrative: string;
  track: TrackPoint[];
};

const REMAL_TRACK: TrackPoint[] = [
  { time: "2024-05-24T00", lat: 14.3, lon: 87.3, windKt: 30, cat: "DD" },
  { time: "2024-05-24T06", lat: 14.9, lon: 87.1, windKt: 35, cat: "CS" },
  { time: "2024-05-24T12", lat: 15.6, lon: 87.0, windKt: 40, cat: "CS" },
  { time: "2024-05-24T18", lat: 16.3, lon: 87.0, windKt: 45, cat: "SCS" },
  { time: "2024-05-25T00", lat: 17.1, lon: 87.0, windKt: 50, cat: "SCS" },
  { time: "2024-05-25T06", lat: 17.9, lon: 87.1, windKt: 55, cat: "SCS" },
  { time: "2024-05-25T12", lat: 18.7, lon: 87.3, windKt: 60, cat: "VSCS" },
  { time: "2024-05-25T18", lat: 19.4, lon: 87.5, windKt: 65, cat: "VSCS" },
  { time: "2024-05-26T00", lat: 20.0, lon: 87.8, windKt: 65, cat: "VSCS" },
  { time: "2024-05-26T06", lat: 20.5, lon: 88.1, windKt: 65, cat: "VSCS" },
  { time: "2024-05-26T12", lat: 20.9, lon: 88.5, windKt: 60, cat: "VSCS" },
  { time: "2024-05-26T18", lat: 21.3, lon: 88.8, windKt: 55, cat: "SCS" },
  { time: "2024-05-27T00", lat: 21.6, lon: 89.1, windKt: 50, cat: "SCS" },
  { time: "2024-05-27T06", lat: 21.8, lon: 89.4, windKt: 45, cat: "CS" },
  { time: "2024-05-27T12", lat: 21.9, lon: 89.8, windKt: 40, cat: "CS" },
];

export const CYCLONES: Cyclone[] = [
  {
    id: "remal-2024",
    name: "Remal",
    basin: "Bay of Bengal",
    season: 2024,
    formed: "2024-05-24",
    dissipated: "2024-05-28",
    peakKt: 65,
    landfallNear: "Sundarbans, West Bengal–Bangladesh (≈21.7°N, 89.3°E)",
    narrative:
      "Remal intensified over the central Bay of Bengal and crossed the coast near the Sundarbans as a Very Severe Cyclonic Storm. Pre-storm upper-ocean heat content in the central BoB exceeded 90 kJ/cm² with D26 deeper than 110 m along the track — abundant energy for intensification. After passage, the cold wake left SST 1–2 °C below seasonal values for roughly a week.",
    track: REMAL_TRACK,
  },
];

export function getCyclone(id: string): Cyclone {
  return CYCLONES.find((c) => c.id === id) ?? CYCLONES[0];
}

/* ---------------------------------------------------------------- */
/* Cold wake: SST anomaly (°C) trailing the storm, ~6-day e-folding. */

const wakeCache = new Map<number, Float32Array | null>();

export function wakeDelta(dateIdx: number): Float32Array | null {
  const cached = wakeCache.get(dateIdx);
  if (cached !== undefined) return cached;

  const dateStr = DATES[dateIdx];
  const start = DATES.indexOf("2024-05-24");
  if (start < 0 || dateStr < "2024-05-25" || dateStr > "2024-06-30") {
    wakeCache.set(dateIdx, null);
    return null;
  }

  const nowMs = new Date(dateStr + "T12:00:00Z").getTime();
  const mask = landMask();
  const out = new Float32Array(N_CELLS).fill(0);

  for (let r = 0; r < N_LAT; r++) {
    for (let c = 0; c < N_LON; c++) {
      const i = r * N_LON + c;
      if (mask[i]) continue;
      const lat = LATS[r];
      const lon = LONS[c];
      let best = 0;
      for (const p of REMAL_TRACK) {
        const ptMs = new Date(p.time + ":00:00Z").getTime();
        const hoursBehind = (nowMs - ptMs) / 3600000; // >0 once storm passed
        if (hoursBehind < -6) continue;
        const d = distKm(lat, lon, p.lat, p.lon);
        const gauss = Math.exp(-((d / 160) ** 2));
        const decay = Math.exp(-Math.max(0, hoursBehind) / 144);
        const v = 1.9 * gauss * decay;
        if (v > best) best = v;
      }
      out[i] = -best;
    }
  }
  wakeCache.set(dateIdx, out);
  return out;
}
