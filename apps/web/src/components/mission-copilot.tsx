"use client";

import { useState } from "react";
import { Badge, Button } from "./ui";
import { type Layer } from "@/lib/api-client";
import { DEPTHS } from "@/lib/sim/grid";
import { DATES } from "@/lib/sim/ocean-dates";

export interface PresetScenario {
  id: string;
  name: string;
  badge: string;
  date: string;
  depth: number;
  layer: Layer;
  coord: { lat: number; lon: number };
  headline: string;
  brief: string;
  actionGuidance: string;
}

export const HACKATHON_PRESETS: PresetScenario[] = [
  {
    id: "biparjoy",
    name: "Cyclone Biparjoy Cold Wake",
    badge: "June 2024",
    date: "2024-06-15",
    depth: 50,
    layer: "temp",
    coord: { lat: 21.0, lon: 66.5 },
    headline: "Severe Cyclonic Wake & Thermocline Upwelling",
    brief:
      "As Biparjoy traversed the Arabian Sea, extreme cyclonic wind stress drew cold water up from 75m, leaving a dramatic 3.2 °C surface cold wake that throttled its energy source.",
    actionGuidance:
      "👉 Look at the 3D surface depression and the vertical profile probe on the right: notice how the thermocline (20 °C isotherm) shoals toward the surface.",
  },
  {
    id: "somali",
    name: "Somali Jet Upwelling",
    badge: "July 2024",
    date: "2024-07-15",
    depth: 0,
    layer: "anomaly",
    coord: { lat: 10.5, lon: 52.0 },
    headline: "Western Boundary Coastal Cooling",
    brief:
      "The Southwest Monsoon drives the Findlater Jet along the Somali coast, inducing one of the planet's most intense open-ocean upwelling systems with anomalies exceeding -2.5 °C.",
    actionGuidance:
      "👉 Notice the strong negative anomaly band off the Horn of Africa. Switch to the 3D view to see the steep temperature gradient.",
  },
  {
    id: "heatwave",
    name: "Arabian Sea Heatwave",
    badge: "May 2024",
    date: "2024-05-23",
    depth: 0,
    layer: "ohc",
    coord: { lat: 16.5, lon: 67.5 },
    headline: "Pre-Monsoon Thermal Energy Accumulation",
    brief:
      "Intense solar radiation before monsoon onset creates extreme Ocean Heat Content (> 90 kJ/cm²), acting as high-octane rocket fuel for rapid cyclone intensification.",
    actionGuidance:
      "👉 Observe the fiery crimson OHC zone. Values above 60 kJ/cm² support Category 3+ super cyclones.",
  },
  {
    id: "argo-probe",
    name: "Argo Float In-Situ Fleet",
    badge: "Active Probes",
    date: "2024-07-01",
    depth: 100,
    layer: "uncertainty",
    coord: { lat: 14.25, lon: 72.5 },
    headline: "Zero-Knowledge In-Situ Ground Truth Verification",
    brief:
      "Autonomous robotic Argo floats cycle 0–2000m every 10 days. The model uses sparse surface satellite radar/radiometry to reconstruct deep ocean physics verified by real floats.",
    actionGuidance:
      "👉 Click the pulsing cyan Argo buoys on the 3D map. Observe the uncertainty envelope shrinking near recent float profiles.",
  },
];

interface MissionCopilotProps {
  currentDate: string;
  currentDepth: number;
  currentLayer: Layer;
  hasSelection: boolean;
  onApplyPreset: (preset: PresetScenario) => void;
  activePresetId?: string | null;
}

export function MissionCopilot({
  currentDate,
  currentDepth,
  currentLayer,
  hasSelection,
  onApplyPreset,
  activePresetId,
}: MissionCopilotProps) {
  const [expanded, setExpanded] = useState(true);
  const activePreset = HACKATHON_PRESETS.find((p) => p.id === activePresetId);

  // HCI: Derive step status dynamically so user always knows where they are
  let step = 1;
  let stepText = "Select an Ocean Field (Temperature, Heat Potential, or Anomaly)";
  if (currentLayer) {
    step = 2;
    stepText = `Examine Depth Level (${currentDepth >= 1000 ? "1000m Deep" : `${currentDepth}m Depth`}) - Thermocline layer is 50-100m`;
  }
  if (hasSelection) {
    step = 3;
    stepText = "Probe Active: Analyze the vertical CTD reconstruction and Argo error spread in the right panel";
  }

  return (
    <div
      className="cyber-card"
      style={{
        padding: "10px 16px",
        marginBottom: 8,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        border: "1px solid rgba(69, 214, 255, 0.3)",
        background: "linear-gradient(135deg, rgba(6, 18, 36, 0.88) 0%, rgba(10, 28, 54, 0.75) 100%)",
      }}
    >
      {/* Top Header Row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            className="pulse-ring"
            style={{ width: 10, height: 10, borderRadius: "50%", background: "#45d6ff", display: "inline-block" }}
          />
          <span style={{ fontWeight: 700, fontSize: "var(--fs-sm)", letterSpacing: "0.05em", color: "#eaf3fd" }}>
            MISSION COPILOT <span style={{ color: "var(--accent)", fontWeight: 500 }}>· GUIDED SIMULATION MODE</span>
          </span>
          <Badge tone="accent">HCI Interactive Guidance</Badge>
        </div>

        {/* Quick Scenario Preset Chips */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span style={{ fontSize: "var(--fs-xs)", color: "var(--text-3)", fontWeight: 600 }}>PRESETS:</span>
          {HACKATHON_PRESETS.map((p) => {
            const isSelected = activePresetId === p.id;
            return (
              <button
                key={p.id}
                type="button"
                className={`preset-chip ${isSelected ? "active" : ""}`}
                onClick={() => onApplyPreset(p)}
                title={p.headline}
              >
                <span>{p.name}</span>
                <span style={{ fontSize: "9px", opacity: 0.7 }}>[{p.badge}]</span>
              </button>
            );
          })}
          <Button
            variant="ghost"
            onClick={() => setExpanded((v) => !v)}
            title="Toggle Detailed Copilot Guidance"
          >
            {expanded ? "Collapse ▴" : "Guide ▾"}
          </Button>
        </div>
      </div>

      {/* Guided Walkthrough Status & Explanations */}
      {expanded && (
        <div
          className="rise-in"
          style={{
            display: "grid",
            gridTemplateColumns: "auto 1fr auto",
            alignItems: "center",
            gap: 14,
            background: "rgba(3, 9, 20, 0.65)",
            padding: "8px 14px",
            borderRadius: "var(--r-sm)",
            border: "1px solid rgba(125, 178, 240, 0.15)",
          }}
        >
          {/* Step Pill */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: "rgba(69, 214, 255, 0.12)",
              border: "1px solid var(--accent)",
              padding: "4px 10px",
              borderRadius: 999,
              fontSize: "var(--fs-xs)",
              fontWeight: 700,
              color: "var(--accent-strong)",
            }}
          >
            <span>STEP {step} OF 3</span>
          </div>

          {/* Active Guidance Text */}
          <div style={{ fontSize: "var(--fs-sm)", color: "var(--text-0)", lineHeight: 1.4 }}>
            {activePreset ? (
              <div>
                <b style={{ color: "var(--accent)" }}>{activePreset.headline}: </b>
                <span>{activePreset.actionGuidance}</span>
              </div>
            ) : (
              <div>
                <b style={{ color: "var(--accent)" }}>Action: </b>
                <span>{stepText}</span>
              </div>
            )}
          </div>

          {/* Feasibility Note */}
          <div style={{ fontSize: "var(--fs-xs)", color: "var(--text-3)", whiteSpace: "nowrap" }}>
            <span>Feasibility: <b>Surrogate Simulation Active</b></span>
          </div>
        </div>
      )}
    </div>
  );
}
