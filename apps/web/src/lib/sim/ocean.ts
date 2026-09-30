/** Physics-flavoured temperature simulator over the contract grid.
 *
 * Layers of the model (all deterministic, seeded):
 *  - climatology: SST seasonal cycle + mixed layer + logistic thermocline
 *    + SW-monsoon upwelling off Somalia/Oman + BoB/AS basin contrast
 *  - mesoscale eddies: drifting warm/cold cores, amplitude decaying with depth
 *  - texture: seeded fBm, near-surface intensified
 *  - model error: smooth fBm scaled by depth (the "reconstruction" deficit)
 *
 * "truth"   = climatology + eddies + texture        (GLORYS stand-in)
 * "recon"   = truth − error                          (our model stand-in)
 * "clim"    = climatology                            (baseline B0)
 * "anomaly" = recon − climatology
 */

import { DEPTHS, LATS, LONS, N_LAT, N_LON, N_CELLS, landMask, oceanSoft } from "./grid";
import { fbmPlane, smoothstep, lerp } from "./noise";
import { hashSeed } from "./rng";
import { wakeDelta } from "./cyclone";
import { DATES, DEFAULT_DATE, dateIndex } from "./ocean-dates";

export { DATES, DEFAULT_DATE, dateIndex };

function dayOfYear(dateIdx: number): number {
  const d = new Date(DATES[dateIdx] + "T00:00:00Z");
  return (
    (Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) -
      Date.UTC(d.getUTCFullYear(), 0, 0)) /
    86400000
  );
}

/* ---------------------------------------------------------------- */
/* Climatology building blocks. */

const SIG = (x: number) => 1 / (1 + Math.exp(-x));

/** Sea-surface temperature climatology (°C). */
function sstClim(r: number, c: number, doy: number): number {
  const lat = LATS[r];
  const lon = LONS[c];
  // Meridional gradient: ~29.3 °C at 5°N → ~25.1 °C at 30°N.
  let t = 29.3 - 0.168 * (lat - 5);
  // Basin contrast: Bay of Bengal runs a touch warmer than Arabian Sea.
  const bob = smoothstep(78, 84, lon); // 0 = AS, 1 = BoB
  t += lerp(-0.35, 0.45, bob);
  // Seasonal cycle: peaks mid-May (pre-monsoon), amplitude grows northward.
  const amp = 0.25 + 0.145 * (lat - 5);
  t += amp * Math.cos((2 * Math.PI * (doy - 135)) / 365.25);
  // SW-monsoon upwelling off Somalia / Oman (Jun–Sep).
  const upw =
    smoothstep(0, 1, smoothstep(50, 57, lon) * (1 - smoothstep(62, 70, lon))) *
    smoothstep(14, 9, lat) *
    (1 - smoothstep(9, 5.5, lat));
  const monsoon = smoothstep(140, 175, doy) * (1 - smoothstep(255, 285, doy));
  t -= 4.2 * upw * monsoon;
  return t;
}

/** Mixed-layer depth (m). Deeper in winter (convective), shallow in spring. */
function mld(r: number, c: number, doy: number): number {
  const lat = LATS[r];
  const lon = LONS[c];
  const bob = smoothstep(78, 84, lon);
  const winterDeep = 1 - Math.cos((2 * Math.PI * (doy - 40)) / 365.25); // 0 spring, 2 winter
  let m = 22 + 18 * winterDeep; // 22–58 m
  m += lerp(12, -4, bob); // AS winter mixing deeper
  m += 0.22 * (lat - 5); // slightly deeper northward in winter
  return m;
}

/** Main thermocline depth (m). */
function ztc(r: number, c: number, doy: number): number {
  const lat = LATS[r];
  const lon = LONS[c];
  const bob = smoothstep(78, 84, lon);
  let z = lerp(102, 128, bob); // AS shallower than BoB
  z += 18 * (1 - (lat - 5) / 25); // deeper toward the equator
  // Upwelling shoals the thermocline in SW monsoon.
  const upw =
    smoothstep(48, 56, lon) * (1 - smoothstep(62, 72, lon)) * smoothstep(14, 8, lat);
  const monsoon = smoothstep(140, 175, doy) * (1 - smoothstep(255, 285, doy));
  z -= 38 * upw * monsoon;
  return z;
}

/** Climatological temperature at a single column/depth (°C). */
function climAt(r: number, c: number, depthIdx: number, doy: number): number {
  const z = DEPTHS[depthIdx];
  const ts = sstClim(r, c, doy);
  const tDeep = 3.5; // ~1000 m NIO
  const m = mld(r, c, doy);
  const zt = ztc(r, c, doy);
  const w = 88;
  const tSig = tDeep + (ts - tDeep) * SIG((zt - z) / w);
  const plateau = ts - 0.0035 * z;
  return lerp(plateau, tSig, smoothstep(m - 12, m + 28, z));
}

/* ---------------------------------------------------------------- */
/* Eddies and texture. */

type Eddy = {
  lat0: number; lon0: number; r: number; amp: number;
  dLat: number; dLon: number; seedPhase: number;
};

const EDDIES: Eddy[] = [
  { lat0: 8.5, lon0: 68, r: 2.6, amp: 1.5, dLat: -0.02, dLon: -0.09, seedPhase: 0 },
  { lat0: 14, lon0: 63, r: 2.1, amp: -1.3, dLat: 0.01, dLon: -0.07, seedPhase: 3 },
  { lat0: 19, lon0: 65, r: 1.8, amp: 1.1, dLat: -0.01, dLon: -0.06, seedPhase: 6 },
  { lat0: 12.5, lon0: 88, r: 2.8, amp: -1.6, dLat: 0.02, dLon: -0.05, seedPhase: 2 },
  { lat0: 16.5, lon0: 92, r: 2.2, amp: 1.4, dLat: 0.015, dLon: -0.06, seedPhase: 5 },
  { lat0: 7.5, lon0: 84, r: 2.4, amp: 1.2, dLat: -0.01, dLon: -0.04, seedPhase: 8 },
  { lat0: 21, lon0: 86, r: 1.7, amp: -1.0, dLat: 0.02, dLon: -0.05, seedPhase: 1 },
  { lat0: 10, lon0: 56, r: 2.3, amp: 1.3, dLat: 0.005, dLon: -0.10, seedPhase: 4 },
  { lat0: 23.5, lon0: 60, r: 1.9, amp: -0.9, dLat: -0.015, dLon: -0.05, seedPhase: 7 },
];

const texCache = new Map<string, Float32Array>();
function texturePlane(dateIdx: number, depthIdx: number): Float32Array {
  const key = `${Math.floor(dateIdx / 3)}:${depthIdx}`;
  let p = texCache.get(key);
  if (!p) {
    if (texCache.size > 90) texCache.clear();
    const decay = Math.exp(-DEPTHS[depthIdx] / 180);
    p = fbmPlane(hashSeed(`tex${Math.floor(dateIdx / 3)}:${depthIdx}`), 4, 5);
    const scale = 0.55 * decay;
    for (let i = 0; i < N_CELLS; i++) p[i] = (p[i] - 0.5) * 2 * scale;
    texCache.set(key, p);
  }
  return p;
}

function eddyDelta(r: number, c: number, depthIdx: number, dateIdx: number): number {
  const lat = LATS[r];
  const lon = LONS[c];
  const z = DEPTHS[depthIdx];
  const decay = Math.exp(-z / 260);
  let sum = 0;
  for (const e of EDDIES) {
    const el = e.lon0 + e.dLon * dateIdx;
    const ea = e.lat0 + e.dLat * dateIdx;
    const dx = (lon - el) * Math.cos((lat * Math.PI) / 180);
    const dy = lat - ea;
    const d2 = (dx * dx + dy * dy) / (e.r * e.r);
    if (d2 < 9) sum += e.amp * Math.exp(-d2) * decay;
  }
  return sum;
}

/* Model error (reconstruction deficit): smooth, depth-scaled. */
const errCache = new Map<string, Float32Array>();
const ERR_BASE = [0.30, 0.31, 0.33, 0.36, 0.40, 0.45, 0.50, 0.55, 0.59, 0.63, 0.68, 0.78, 0.90, 1.02, 1.12];
function errorPlane(dateIdx: number, depthIdx: number): Float32Array {
  const key = `${Math.floor(dateIdx / 5)}:${depthIdx}`;
  let p = errCache.get(key);
  if (!p) {
    if (errCache.size > 90) errCache.clear();
    p = fbmPlane(hashSeed(`err${Math.floor(dateIdx / 5)}:${depthIdx}`), 3, 3);
    const scale = ERR_BASE[depthIdx];
    for (let i = 0; i < N_CELLS; i++) p[i] = (p[i] - 0.5) * 2 * scale;
    errCache.set(key, p);
  }
  return p;
}

/* ---------------------------------------------------------------- */
/* Public field access with caching. */

export type FieldKind = "recon" | "truth" | "clim" | "anomaly" | "diff";

const fieldCache = new Map<string, Float32Array>();

export function tempField(kind: FieldKind, dateIdx: number, depthIdx: number): Float32Array {
  const key = `${kind}:${dateIdx}:${depthIdx}`;
  const hit = fieldCache.get(key);
  if (hit) return hit;
  if (fieldCache.size > 110) fieldCache.clear();

  const doy = dayOfYear(dateIdx);
  const mask = landMask();
  const soft = oceanSoft();
  const tex = texturePlane(dateIdx, depthIdx);
  const err = errorPlane(dateIdx, depthIdx);
  const out = new Float32Array(N_CELLS).fill(NaN);

  for (let r = 0; r < N_LAT; r++) {
    for (let c = 0; c < N_LON; c++) {
      const i = r * N_LON + c;
      if (mask[i]) continue;
      const o = soft[i];
      const clim = climAt(r, c, depthIdx, doy);
      const eddy = eddyDelta(r, c, depthIdx, dateIdx) * o;
      const texv = tex[i] * o;
      const truth = clim + eddy + texv;
      const recon = truth - err[i] * o;
      let v: number;
      switch (kind) {
        case "truth": v = truth; break;
        case "clim": v = clim; break;
        case "anomaly": v = recon - clim; break;
        case "diff": v = recon - truth; break;
        default: v = recon; break;
      }
      out[i] = v;
    }
  }
  fieldCache.set(key, out);
  return out;
}

/** Vertical profile (15 depths, °C) at a grid cell for recon / truth / clim. */
export function profileAt(
  kind: "recon" | "truth" | "clim",
  dateIdx: number,
  r: number,
  c: number,
): number[] {
  const out: number[] = [];
  for (let d = 0; d < DEPTHS.length; d++) {
    const f = tempField(kind, dateIdx, d);
    out.push(f[r * N_LON + c]);
  }
  return out;
}

/** Surface temperature field (uses depth 0), including cyclone cold wake. */
export function sstField(dateIdx: number): Float32Array {
  const f = tempField("truth", dateIdx, 0);
  const wake = wakeDelta(dateIdx);
  if (!wake) return f;
  const out = new Float32Array(f);
  for (let i = 0; i < N_CELLS; i++) if (!Number.isNaN(out[i])) out[i] += wake[i];
  return out;
}
