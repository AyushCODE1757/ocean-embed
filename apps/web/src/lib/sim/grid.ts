/** OceanEmbed analysis grid — mirrors contracts/grid.yaml (frozen v1.x).
 * lat 5–30°N (101 cells), lon 45–105°E (241 cells), 0.25°, cell centers. */

import coastline from "@/assets/coastline.json";

export const LAT_MIN = 5;
export const LAT_MAX = 30;
export const LON_MIN = 45;
export const LON_MAX = 105;
export const STEP = 0.25;
export const N_LAT = 101;
export const N_LON = 241;
export const DEPTHS = [0, 5, 10, 20, 30, 50, 75, 100, 125, 150, 200, 300, 500, 700, 1000] as const;
export const DEPTH_IDX: Record<number, number> = Object.fromEntries(
  DEPTHS.map((d, i) => [d, i]),
);

export const LATS = Array.from({ length: N_LAT }, (_, i) => LAT_MIN + i * STEP);
export const LONS = Array.from({ length: N_LON }, (_, i) => LON_MIN + i * STEP);

export const N_CELLS = N_LAT * N_LON;

export function latIndex(lat: number): number {
  return Math.min(N_LAT - 1, Math.max(0, Math.round((lat - LAT_MIN) / STEP)));
}
export function lonIndex(lon: number): number {
  return Math.min(N_LON - 1, Math.max(0, Math.round((lon - LON_MIN) / STEP)));
}
export function cellIndex(lat: number, lon: number): number {
  return latIndex(lat) * N_LON + lonIndex(lon);
}

/** Great-circle distance in km. */
export function distKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dp = p2 - p1;
  const dl = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/* ------------------------------------------------------------------ */
/* Land mask: rasterize the clipped Natural Earth coastline onto grid. */

type Ring = [number, number][];

function pointInRing(lat: number, lon: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]; // [lon, lat]
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

const rings = coastline as unknown as Ring[];

let landMaskCache: Uint8Array | null = null;

/** 1 = land, 0 = ocean, at cell centers. */
export function landMask(): Uint8Array {
  if (landMaskCache) return landMaskCache;
  const mask = new Uint8Array(N_CELLS);
  for (let r = 0; r < N_LAT; r++) {
    for (let c = 0; c < N_LON; c++) {
      const lat = LATS[r];
      const lon = LONS[c];
      let land = 0;
      for (const ring of rings) {
        // cheap bbox reject
        if (
          lon < ringBbox(ring, 0) ||
          lon > ringBbox(ring, 2) ||
          lat < ringBbox(ring, 1) ||
          lat > ringBbox(ring, 3)
        ) {
          continue;
        }
        if (pointInRing(lat, lon, ring)) {
          land = 1;
          break;
        }
      }
      mask[r * N_LON + c] = land;
    }
  }
  landMaskCache = mask;
  return mask;
}

const bboxes = new Map<Ring, [number, number, number, number]>();
function ringBbox(ring: Ring, k: 0 | 1 | 2 | 3): number {
  let b = bboxes.get(ring);
  if (!b) {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const [x, y] of ring) {
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
    b = [x0, y0, x1, y1];
    bboxes.set(ring, b);
  }
  return b[k];
}

/** Distance (in cells) from each ocean cell to the nearest land cell. */
let coastDistCache: Float32Array | null = null;
export function coastDistance(): Float32Array {
  if (coastDistCache) return coastDistCache;
  const mask = landMask();
  const dist = new Float32Array(N_CELLS).fill(1e6);
  // BFS from land cells over ocean
  let frontier: number[] = [];
  for (let i = 0; i < N_CELLS; i++) {
    if (mask[i]) {
      dist[i] = 0;
      frontier.push(i);
    }
  }
  let d = 0;
  while (frontier.length) {
    d++;
    const next: number[] = [];
    for (const i of frontier) {
      const r = Math.floor(i / N_LON);
      const c = i % N_LON;
      const nb = [
        r > 0 ? i - N_LON : -1,
        r < N_LAT - 1 ? i + N_LON : -1,
        c > 0 ? i - 1 : -1,
        c < N_LON - 1 ? i + 1 : -1,
      ];
      for (const j of nb) {
        if (j >= 0 && dist[j] > d) {
          dist[j] = d;
          next.push(j);
        }
      }
    }
    frontier = next;
  }
  coastDistCache = dist;
  return dist;
}

/** Smooth ocean mask 0..1 (soft coastal edge for field blending). */
let oceanSoftCache: Float32Array | null = null;
export function oceanSoft(): Float32Array {
  if (oceanSoftCache) return oceanSoftCache;
  const cd = coastDistance();
  const out = new Float32Array(N_CELLS);
  for (let i = 0; i < N_CELLS; i++) {
    out[i] = cd[i] === 0 ? 0 : Math.min(1, cd[i] / 3);
  }
  oceanSoftCache = out;
  return out;
}

export const COASTLINE = rings;
