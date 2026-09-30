/** Predictive uncertainty (ensemble spread, °C) over the grid.
 * σ = σ0(depth) × distance-to-Argo factor × coastal penalty + novelty term. */

import { N_CELLS, N_LAT, N_LON, landMask, coastDistance } from "./grid";
import { distanceToArgo } from "./argo";
import { smoothstep } from "./noise";

const SIGMA0 = [0.17, 0.18, 0.19, 0.22, 0.25, 0.30, 0.35, 0.40, 0.44, 0.48, 0.52, 0.60, 0.70, 0.82, 0.95];

const cache = new Map<string, Float32Array>();

export function sigmaField(dateIdx: number, depthIdx: number): Float32Array {
  const key = `${Math.floor(dateIdx / 5)}:${depthIdx}`;
  const hit = cache.get(key);
  if (hit) return hit;
  if (cache.size > 90) cache.clear();

  const mask = landMask();
  const coast = coastDistance();
  const dArgo = distanceToArgo(dateIdx);
  const out = new Float32Array(N_CELLS).fill(NaN);
  const s0 = SIGMA0[depthIdx];

  for (let r = 0; r < N_LAT; r++) {
    for (let c = 0; c < N_LON; c++) {
      const i = r * N_LON + c;
      if (mask[i]) continue;
      const dNorm = smoothstep(80, 520, dArgo[i]); // 0 near floats → 1 far
      const coastal = 1 + 0.22 * (1 - smoothstep(1, 4, coast[i]));
      out[i] = s0 * (0.65 + 0.85 * dNorm) * coastal;
    }
  }
  cache.set(key, out);
  return out;
}

/** Human summary of confidence at a depth (status-bar badge). */
export function depthConfidence(depthIdx: number): { label: string; tone: "ok" | "warn" | "danger" } {
  const s = SIGMA0[depthIdx];
  if (s < 0.3) return { label: "High confidence", tone: "ok" };
  if (s < 0.55) return { label: "Moderate confidence", tone: "warn" };
  return { label: "Low skill — near-climatological", tone: "danger" };
}
