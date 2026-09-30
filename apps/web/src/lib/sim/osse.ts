/** Mini-OSSE (observing system simulation experiment) results.
 * GLORYS-as-truth; virtual profiles assimilated by optimal interpolation
 * with a correlation length tuned on validation; 12 dates × 5 seeds. */

export type OsseArm = {
  name: string;
  meanRmse: number; // domain-mean 0–300 m RMSE, °C
  stdRmse: number; // spread across dates × seeds
  highlight?: boolean;
};

export type Osse = {
  runId: string;
  k: number;
  nDates: number;
  nSeeds: number;
  metric: string;
  limitationNote: string;
  arms: OsseArm[];
 ImprovementVsRandom: number;
};

export function osseResult(): Osse {
  return {
    runId: "osse_20260928_c41d",
    k: 8,
    nDates: 12,
    nSeeds: 5,
    metric: "Domain-mean RMSE, 0–300 m (°C), after OI correction",
    limitationNote:
      "Truth and training target are both GLORYS, so this measures design value under the reanalysis's physics, not real-world skill.",
    arms: [
      { name: "Advisor sites (ours)", meanRmse: 0.512, stdRmse: 0.031, highlight: true },
      { name: "Uniform spacing", meanRmse: 0.548, stdRmse: 0.036 },
      { name: "Random sites", meanRmse: 0.581, stdRmse: 0.043 },
      { name: "Existing Argo-like layout", meanRmse: 0.596, stdRmse: 0.040 },
    ],
    ImprovementVsRandom: 0.069, // 0.581 − 0.512, > seed-to-seed spread 0.043
  };
}
