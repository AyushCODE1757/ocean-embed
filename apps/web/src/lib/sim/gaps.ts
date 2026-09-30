/** Observation-gap map + greedy top-K float placement.
 * score = 0.55·norm(spread at 100 m) + 0.45·norm(distance to nearest Argo)
 * greedy selection with a minimum spacing of 3.5° (~390 km). */

import { LATS, LONS, N_LAT, N_LON, landMask } from "./grid";
import { sigmaField } from "./uncertainty";
import { distanceToArgo } from "./argo";
import { dateIndex } from "./ocean-dates";

export type GapSite = {
  rank: number;
  lat: number;
  lon: number;
  score: number;
  uncertainty: number; // °C at 100 m
  distToArgoKm: number;
};

export function gapSites(date: string, k = 10): { sites: GapSite[]; methodNote: string } {
  const di = dateIndex(date);
  const depthIdx100 = 7; // 100 m
  const sig = sigmaField(di, depthIdx100);
  const dArgo = distanceToArgo(di);
  const mask = landMask();

  // normalize score components over ocean
  let sMin = Infinity;
  let sMax = -Infinity;
  let dMin = Infinity;
  let dMax = -Infinity;
  for (let i = 0; i < mask.length; i++) {
    if (mask[i]) continue;
    const s = sig[i];
    const d = dArgo[i];
    if (s < sMin) sMin = s;
    if (s > sMax) sMax = s;
    if (d < dMin) dMin = d;
    if (d > dMax) dMax = d;
  }

  type Cand = { r: number; c: number; score: number };
  const cands: Cand[] = [];
  for (let r = 1; r < N_LAT - 1; r += 2) {
    for (let c = 1; c < N_LON - 1; c += 2) {
      const i = r * N_LON + c;
      if (mask[i]) continue;
      const ns = (sig[i] - sMin) / (sMax - sMin || 1);
      const nd = (dArgo[i] - dMin) / (dMax - dMin || 1);
      cands.push({ r, c, score: 0.55 * ns + 0.45 * nd });
    }
  }
  cands.sort((a, b) => b.score - a.score);

  const chosen: Cand[] = [];
  const minSpacing = 3.5;
  for (const cand of cands) {
    if (chosen.length >= k) break;
    const ok = chosen.every(
      (ch) =>
        Math.abs(LATS[ch.r] - LATS[cand.r]) >= minSpacing ||
        Math.abs(LONS[ch.c] - LONS[cand.c]) >= minSpacing * 1.4,
    );
    if (ok) chosen.push(cand);
  }

  const sites: GapSite[] = chosen.map((ch, idx) => {
    const i = ch.r * N_LON + ch.c;
    return {
      rank: idx + 1,
      lat: LATS[ch.r],
      lon: LONS[ch.c],
      score: Math.round((0.55 * ((sig[i] - sMin) / (sMax - sMin || 1)) +
        0.45 * ((dArgo[i] - dMin) / (dMax - dMin || 1))) * 1000) / 1000,
      uncertainty: Math.round(sig[i] * 100) / 100,
      distToArgoKm: Math.round(dArgo[i]),
    };
  });

  return {
    sites,
    methodNote:
      "Greedy top-K on 0.55×(ensemble spread, 100 m) + 0.45×(distance to nearest recent Argo profile), minimum spacing 3.5°. Heuristic designed for this study; not an operational product.",
  };
}
