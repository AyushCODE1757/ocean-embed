/** Derived heat products from 15-level temperature profiles:
 *  - D20 / D26: 20 °C / 26 °C isotherm depths (linear interp between levels)
 *  - OHC: tropical cyclone heat potential, ∫(T−26)dz over 0–300 m, kJ/cm²
 * Includes vertical-sampling caveat (15 levels ⇒ interpolation error). */

import { DEPTHS, N_CELLS, N_LAT, N_LON, landMask } from "./grid";
import { tempField, type FieldKind } from "./ocean";
import { sigmaField } from "./uncertainty";
import { DATES } from "./ocean-dates";

export type HeatMetric = "ohc" | "d26" | "d20";

/** Isotherm depth (m) from a 15-level profile; NaN if never crossed. */
export function isothermDepth(profile: number[], target: number): number {
  if (profile[0] < target) return 0;
  for (let k = 1; k < DEPTHS.length; k++) {
    const t0 = profile[k - 1];
    const t1 = profile[k];
    if (Number.isNaN(t1)) continue;
    if (t1 <= target && t0 > target) {
      const z0 = DEPTHS[k - 1];
      const z1 = DEPTHS[k];
      const f = (t0 - target) / (t0 - t1 || 1e-9);
      return z0 + f * (z1 - z0);
    }
  }
  return NaN;
}

/** OHC (kJ/cm²), 26 °C reference, trapezoid over available levels ≤ 300 m. */
export function ohc(profile: number[]): number {
  let acc = 0; // °C·m above 26
  for (let k = 1; k < DEPTHS.length; k++) {
    const z0 = DEPTHS[k - 1];
    const z1 = DEPTHS[k];
    if (z0 >= 300) break;
    const t0 = profile[k - 1];
    const t1 = profile[k];
    if (Number.isNaN(t0) || Number.isNaN(t1)) continue;
    const e0 = Math.max(0, t0 - 26);
    const e1 = Math.max(0, t1 - 26);
    const zEnd = Math.min(z1, 300);
    const f = (zEnd - z0) / (z1 - z0);
    acc += ((e0 + (e0 + (e1 - e0) * f)) / 2) * (zEnd - z0);
  }
  return acc * 0.41; // ρ·cp ≈ 4.1e6 J m⁻³ K⁻¹ → kJ/cm²
}

const heatCache = new Map<string, Float32Array>();

export function heatField(metric: HeatMetric, dateIdx: number): Float32Array {
  const key = `${metric}:${dateIdx}`;
  const hit = heatCache.get(key);
  if (hit) return hit;
  if (heatCache.size > 60) heatCache.clear();

  const mask = landMask();
  const out = new Float32Array(N_CELLS).fill(NaN);
  const kind: FieldKind = "recon";

  for (let r = 0; r < N_LAT; r++) {
    for (let c = 0; c < N_LON; c++) {
      const i = r * N_LON + c;
      if (mask[i]) continue;
      const profile: number[] = [];
      for (let k = 0; k < DEPTHS.length; k++) {
        profile.push(tempField(kind, dateIdx, k)[i]);
      }
      out[i] =
        metric === "ohc" ? ohc(profile) : isothermDepth(profile, metric === "d26" ? 26 : 20);
    }
  }
  heatCache.set(key, out);
  return out;
}

/** ±1σ band for a derived metric at a cell (σ_OHC ≈ 0.41·Σσ·Δz; simplified). */
export function heatSigma(metric: HeatMetric, dateIdx: number, r: number, c: number): number {
  const i = r * N_LON + c;
  if (metric === "ohc") {
    let acc = 0;
    for (let k = 0; k < DEPTHS.length && DEPTHS[k] <= 300; k++) {
      acc += sigmaField(dateIdx, k)[i] * (k === 0 ? 10 : DEPTHS[k] - DEPTHS[k - 1]);
    }
    return acc * 0.41;
  }
  // isotherm depth: σ_z ≈ σ_T / |dT/dz| at the crossing (bounded)
  const tProfile: number[] = [];
  for (let k = 0; k < DEPTHS.length; k++) tProfile.push(tempField("recon", dateIdx, k)[i]);
  const target = metric === "d26" ? 26 : 20;
  const z = isothermDepth(tProfile, target);
  if (Number.isNaN(z)) return NaN;
  let grad = 0.06; // °C/m fallback
  for (let k = 1; k < DEPTHS.length; k++) {
    if (DEPTHS[k - 1] <= z && z <= DEPTHS[k]) {
      grad = Math.max(
        0.02,
        Math.abs((tProfile[k - 1] - tProfile[k]) / (DEPTHS[k] - DEPTHS[k - 1])),
      );
      break;
    }
  }
  const kNear = DEPTHS.findIndex((d) => d >= z);
  const sig = sigmaField(dateIdx, Math.max(0, kNear))[i];
  return sig / grad;
}

export const HEAT_UNITS: Record<HeatMetric, string> = {
  ohc: "kJ/cm²",
  d26: "m",
  d20: "m",
};

export function heatDates(): string[] {
  return DATES;
}
