/** System metadata + provenance — model card, run info, dataset sources. */

export const MODEL = {
  id: "oceanembed-e1cnn-mae",
  version: "v0.4.2",
  encoder: "E1 — CNN (ConvNeXt-style), MAE-pretrained",
  params: "18.3 M",
  ensemble: "3 members (deep ensemble + heteroscedastic head)",
  trainSpan: "Apr 2015 – Dec 2022",
  valSpan: "2023",
  testSpan: "2024 – 2025",
  dataThrough: "2025-12-31",
  grid: "0.25° × 0.25°, daily, 5–30°N / 45–105°E",
  depths: "15 standard levels (0–1000 m)",
};

export const RUN = {
  runId: "run_20260929_a3f7c2",
  contractVersion: "1.1.0",
  generated: "2026-09-29T21:14:08Z",
  seed: 20260929,
  demoNote:
    "Simulated preview dataset — this deployment runs on the deterministic demo simulator so the full interface can be evaluated before the trained GLORYS-based bundle is served.",
};

export type SourceTier = "final" | "interim" | "nrt";

export type InputChannel = {
  key: string;
  label: string;
  units: string;
  source: string;
  doi: string;
  tier: SourceTier;
};

export const INPUT_CHANNELS: InputChannel[] = [
  { key: "sst", label: "SST", units: "°C", source: "OSTIA (CMEMS)", doi: "10.48670/moi-00168", tier: "final" },
  { key: "sss", label: "SSS", units: "PSU", source: "SMAP+SMOS blended (CMEMS)", doi: "10.48670/moi-00051", tier: "final" },
  { key: "sla", label: "SLA", units: "m", source: "DUACS L4 (CMEMS)", doi: "10.48670/moi-00145", tier: "final" },
  { key: "ucur", label: "Currents U", units: "m/s", source: "OSCAR L4 Final v2.0 (PO.DAAC)", doi: "10.5067/OSCAR-…", tier: "final" },
  { key: "vcur", label: "Currents V", units: "m/s", source: "OSCAR L4 Final v2.0 (PO.DAAC)", doi: "10.5067/OSCAR-…", tier: "final" },
  { key: "uwind", label: "Wind U", units: "m/s", source: "CCMP v3.1 (PO.DAAC)", doi: "10.5067/CCMP-…", tier: "final" },
  { key: "vwind", label: "Wind V", units: "m/s", source: "CCMP v3.1 (PO.DAAC)", doi: "10.5067/CCMP-…", tier: "final" },
];

export const TARGET_SOURCE = {
  label: "GLORYS12V1 reanalysis",
  doi: "10.48670/moi-00021",
  note: "Assimilates satellite SLA/SST and in-situ T/S profiles (incl. Argo).",
};

export const INCOIS_ARGO = {
  label: "INCOIS gridded + raw Argo",
  doi: "INCOIS LAS",
  note: "10-day / monthly objectively analysed 1° products and raw delayed-mode profiles.",
};

/** Input completeness for a date (demo: currents degrade to interim late 2025). */
export function inputCompleteness(date: string): {
  ok: number;
  total: number;
  detail: { key: string; label: string; tier: SourceTier }[];
} {
  const late = date > "2025-11-15";
  return {
    ok: 7,
    total: 7,
    detail: INPUT_CHANNELS.map((ch) => ({
      key: ch.key,
      label: ch.label,
      tier: ch.key === "ucur" || ch.key === "vcur" ? (late ? "interim" : "final") : ch.tier,
    })),
  };
}

export const STACK = [
  { name: "PyTorch", version: "2.14.x" },
  { name: "PyTorch Lightning", version: "2.6.4" },
  { name: "xarray", version: "2026.7.0" },
  { name: "zarr", version: "3.4.0" },
  { name: "FastAPI", version: "0.141.1" },
  { name: "Next.js", version: "16.3.6" },
  { name: "React", version: "19.3.0" },
];

export const LIMITATIONS = [
  "Skill decreases with depth: below ~500 m the model approaches climatology and every view flags it as low-confidence.",
  "The training target (GLORYS) assimilates Argo, so Argo validation is not fully independent — reference lines are shown for GLORYS and ARMOR3D against Argo.",
  "The 15 standard levels are coarse at depth; D20/D26 isotherm depths carry a vertical-interpolation error (stated in the Advisor view).",
  "Near-real-time mode uses interim/NRT inputs (e.g. OSCAR interim); the source tier is labelled per date and skill degradation is measured.",
  "OSSE results use GLORYS as both truth and prior — they quantify design value under the reanalysis's physics, not real-world impact.",
];
