/** Seeded value noise + fBm on the analysis grid. Deterministic. */

import { hash2 } from "./rng";
import { N_LAT, N_LON, N_CELLS } from "./grid";

/** Smooth 2-D value noise in [0, 1], integer lattice + smoothstep. */
export function valueNoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const sx = xf * xf * (3 - 2 * xf);
  const sy = yf * yf * (3 - 2 * yf);
  const v00 = hash2(xi + seed, yi) / 4294967296;
  const v10 = hash2(xi + 1 + seed, yi) / 4294967296;
  const v01 = hash2(xi + seed, yi + 1) / 4294967296;
  const v11 = hash2(xi + 1 + seed, yi + 1) / 4294967296;
  const a = v00 + (v10 - v00) * sx;
  const b = v01 + (v11 - v01) * sx;
  return a + (b - a) * sy;
}

/** Fractional Brownian motion, octaves stacked, output in [0, 1]. */
export function fbm(
  latFrac: number,
  lonFrac: number,
  seed: number,
  octaves = 4,
  baseFreq = 4,
): number {
  let amp = 0.5;
  let freq = baseFreq;
  let sum = 0;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * valueNoise(lonFrac * freq, latFrac * freq, seed + o * 101);
    norm += amp;
    amp *= 0.55;
    freq *= 2.1;
  }
  return sum / norm;
}

/** Precompute an fBm plane over the whole grid (scaled to [0,1] coords). */
export function fbmPlane(seed: number, octaves = 4, baseFreq = 4): Float32Array {
  const out = new Float32Array(N_CELLS);
  for (let r = 0; r < N_LAT; r++) {
    const fy = r / (N_LAT - 1);
    for (let c = 0; c < N_LON; c++) {
      out[r * N_LON + c] = fbm(fy, c / (N_LON - 1), seed, octaves, baseFreq);
    }
  }
  return out;
}

export function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
