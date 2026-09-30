"use client";

/** Explorer — the flagship view.
 * Layer picker · depth slider · time player · zoomable map · legend ·
 * click-to-probe profile panel. Full view state lives in the URL. */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, type Grid, type Layer, type Profile } from "@/lib/api-client";
import { domainFor, COLORMAPS } from "@/lib/colormaps";
import { Badge, Panel, Segmented, SkeletonBox, SliderField, Stat, useProvenance, InfoDot } from "@/components/ui";
import { OceanMap, MapLegend, type MapMarker } from "@/components/ocean-map";
import { ProfileChart } from "@/components/profile-chart";
import { TimePlayer } from "@/components/time-player";
import { Ocean3D, SplineEmbed } from "@/components/ocean-3d";
import { MissionCopilot, HACKATHON_PRESETS, type PresetScenario } from "@/components/mission-copilot";
import { DEPTHS, N_LAT, N_LON } from "@/lib/sim/grid";
import { DATES, DEFAULT_DATE } from "@/lib/sim/ocean-dates";
import { depthConfidence } from "@/lib/sim/uncertainty";
import { simApi } from "@/lib/sim";
import { fmtDate, fmtNum } from "@/lib/format";
import { parseView, serializeView, type ViewState } from "@/lib/url-state";
import { useShortcuts } from "@/lib/shortcuts";

const DEPTH_LAYERS: Layer[] = ["temp", "anomaly", "truth", "diff", "uncertainty"];
const SURFACE_LAYERS: Layer[] = ["ohc", "d26", "d20"];

export default function ExplorerPage() {
  const openProv = useProvenance();

  const [dateIdx, setDateIdx] = useState(() => Math.max(0, DATES.indexOf(DEFAULT_DATE)));
  const [depthIdx, setDepthIdx] = useState(5);
  const [layer, setLayer] = useState<Layer>("temp");
  const [sel, setSel] = useState<{ lat: number; lon: number } | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(3);
  const [viewMode, setViewMode] = useState<"3d" | "spline" | "2d">("3d");
  const [activePresetId, setActivePresetId] = useState<string | null>(null);

  const [grid, setGrid] = useState<Grid | null>(null);
  const [gridLoading, setGridLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqRef = useRef(0);

  /* hydrate from URL once */
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const v = parseView(sp, { date: DEFAULT_DATE, depth: 50 });
    const di = DATES.indexOf(v.date);
    setDateIdx(di >= 0 ? di : 0);
    const zi = DEPTHS.indexOf((v.depth as (typeof DEPTHS)[number]) ?? 50);
    setDepthIdx(zi >= 0 ? zi : 5);
    if (v.layer) setLayer(v.layer as Layer);
    if (v.lat !== undefined && v.lon !== undefined) setSel({ lat: v.lat, lon: v.lon });
  }, []);

  /* persist to URL */
  useEffect(() => {
    const q = serializeView({ date: DATES[dateIdx], depth: DEPTHS[depthIdx], layer, ...sel });
    window.history.replaceState(null, "", `?${q}`);
  }, [dateIdx, depthIdx, layer, sel]);

  /* fetch current slice */
  useEffect(() => {
    const req = ++reqRef.current;
    setGridLoading(true);
    setError(null);
    api
      .slice(DATES[dateIdx], DEPTHS[depthIdx], layer)
      .then((g) => {
        if (reqRef.current === req) setGrid(g);
      })
      .catch((e: Error) => {
        if (reqRef.current === req) setError(e.message);
      })
      .finally(() => {
        if (reqRef.current === req) setGridLoading(false);
      });
  }, [dateIdx, depthIdx, layer]);

  /* fetch profile on pick */
  useEffect(() => {
    if (!sel) return;
    let alive = true;
    setProfileLoading(true);
    api
      .profile(DATES[dateIdx], sel.lat, sel.lon)
      .then((p) => {
        if (alive) setProfile(p);
      })
      .finally(() => {
        if (alive) setProfileLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [sel, dateIdx]);

  const stepDay = useCallback((dir: 1 | -1) => {
    setPlaying(false);
    setDateIdx((i) => Math.min(DATES.length - 1, Math.max(0, i + dir)));
  }, []);
  const stepDepth = useCallback((dir: 1 | -1) => {
    setDepthIdx((i) => Math.min(DEPTHS.length - 1, Math.max(0, i + dir)));
  }, []);

  const handleApplyPreset = useCallback((preset: PresetScenario) => {
    setActivePresetId(preset.id);
    const di = DATES.indexOf(preset.date);
    if (di >= 0) setDateIdx(di);
    const zi = DEPTHS.indexOf(preset.depth as (typeof DEPTHS)[number]);
    if (zi >= 0) setDepthIdx(zi);
    setLayer(preset.layer);
    setSel(preset.coord);
  }, []);

  useShortcuts({
    onTogglePlay: () => setPlaying((p) => !p),
    onStepDay: stepDay,
    onStepDepth: stepDepth,
  });

  const isDepthLayer = DEPTH_LAYERS.includes(layer);
  const domain = domainFor(layer);
  const conf = depthConfidence(depthIdx);

  const markers = useMemo<MapMarker[]>(() => {
    const ms: MapMarker[] = simApi.floatPositions(DATES[dateIdx]).map((f) => ({
      lat: f.lat,
      lon: f.lon,
      kind: "argo" as const,
      label: f.id,
    }));
    if (sel) ms.push({ lat: sel.lat, lon: sel.lon, kind: "sel" });
    return ms;
  }, [dateIdx, sel]);

  const hoverFormat = useCallback(
    (lat: number, lon: number, v: number) => {
      const base = `${lat.toFixed(2)}°N ${lon.toFixed(2)}°E`;
      if (Number.isNaN(v)) return `${base} — land`;
      return `${base} · ${fmtNum(v, 2)} ${domain.units}`;
    },
    [domain.units],
  );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        padding: "10px 14px",
        flex: 1,
        minHeight: 0,
      }}
    >
      {/* HCI Mission Copilot & Scenario Guidance */}
      <MissionCopilot
        currentDate={DATES[dateIdx]}
        currentDepth={DEPTHS[depthIdx]}
        currentLayer={layer}
        hasSelection={Boolean(sel)}
        onApplyPreset={handleApplyPreset}
        activePresetId={activePresetId}
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "272px minmax(0, 1fr) 336px",
          gap: 12,
          flex: 1,
          minHeight: 0,
        }}
      >
        {/* ------------- left rail ------------- */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12, minHeight: 0, overflowY: "auto", paddingRight: 2 }}>
          <Panel title="Field" subtitle="Reconstruction · 0.25° daily">
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <Segmented
                ariaLabel="Layer group"
                size="sm"
                options={[
                  { value: "d", label: "Depth fields" },
                  { value: "s", label: "Surface-derived" },
                ]}
                value={isDepthLayer ? "d" : "s"}
                onChange={(v) => setLayer(v === "d" ? "temp" : "ohc")}
              />
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {(isDepthLayer ? DEPTH_LAYERS : SURFACE_LAYERS).map((l) => (
                  <LayerOption key={l} active={layer === l} onClick={() => setLayer(l)} dom={domainFor(l)} />
                ))}
              </div>
            </div>
          </Panel>

          <Panel
            title="Depth"
            actions={<Badge tone={conf.tone === "ok" ? "ok" : conf.tone === "warn" ? "warn" : "danger"}>{conf.label}</Badge>}
          >
            <SliderField
              label="Standard depth level"
              valueText={depthText(DEPTHS[depthIdx])}
              min={0}
              max={DEPTHS.length - 1}
              value={depthIdx}
              disabled={!isDepthLayer}
              onChange={setDepthIdx}
              marks={[
                { at: 0, label: "0" },
                { at: 7, label: "100" },
                { at: DEPTHS.length - 1, label: "1000 m" },
              ]}
            />
            {!isDepthLayer && (
              <p style={{ margin: "8px 0 0", fontSize: "var(--fs-xs)", color: "var(--text-3)" }}>
                Surface-derived fields integrate the upper 300 m column; no depth selection applies.
              </p>
            )}
          </Panel>

          <Panel title="Time">
            <TimePlayer
              dates={DATES}
              index={dateIdx}
              onIndex={(i) => {
                setPlaying(false);
                setDateIdx(i);
              }}
              playing={playing}
              onPlaying={setPlaying}
              speed={speed}
              onSpeed={setSpeed}
            />
          </Panel>

          <Panel title="About this field" actions={<InfoDot title="Provenance" onClick={openProv} />}>
            <p style={{ margin: 0, fontSize: "var(--fs-xs)", lineHeight: 1.65, color: "var(--text-2)" }}>
              {layerBlurb(layer)}
            </p>
          </Panel>
        </div>

        {/* ------------- center: map / 3d twin ------------- */}
        <Panel
          title={
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              {domain.label}
              <span style={{ color: "var(--text-3)", fontWeight: 400, fontSize: "var(--fs-xs)" }}>
                {isDepthLayer ? `at ${depthText(DEPTHS[depthIdx])} · ` : ""}
                {fmtDate(DATES[dateIdx])}
              </span>
            </span>
          }
          subtitle="3D Ocean Surface & Thermocline · Click to probe deep profile"
          actions={
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Segmented
                ariaLabel="View Mode"
                size="sm"
                options={[
                  { value: "3d", label: "🌊 3D Ocean Twin" },
                  { value: "spline", label: "✨ Spline 3D" },
                  { value: "2d", label: "🗺️ 2D Grid" },
                ]}
                value={viewMode}
                onChange={setViewMode}
              />
              {gridLoading ? <Badge tone="accent">loading…</Badge> : <Badge tone="ok">live</Badge>}
              <span style={{ fontSize: "var(--fs-xs)", color: "var(--text-3)" }}>NIO · 101×241</span>
            </div>
          }
          bodyStyle={{ display: "flex", flexDirection: "column", gap: 10, padding: 10, minHeight: 0 }}
          style={{ minHeight: 0 }}
        >
          <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
            {viewMode === "3d" && (
              <div className="rise-in" style={{ position: "absolute", inset: 0 }}>
                <Ocean3D
                  values={grid ? floatArrayFromGrid(grid) : null}
                  vmin={domain.min}
                  vmax={domain.max}
                  cmap={domain.cmap}
                  depthMeters={DEPTHS[depthIdx]}
                  selectedCoord={sel}
                  onPick={(lat, lon) => setSel({ lat, lon })}
                  markers={markers}
                />
              </div>
            )}

            {viewMode === "spline" && (
              <div className="rise-in" style={{ position: "absolute", inset: 0 }}>
                <SplineEmbed url="https://app.spline.design/community/file/97e7b76a-149a-467b-8c6e-67b11680c16c" />
              </div>
            )}

            {viewMode === "2d" && grid && (
              <div className="rise-in" style={{ position: "absolute", inset: 0 }}>
                <OceanMap
                  values={floatArrayFromGrid(grid)}
                  vmin={domain.min}
                  vmax={domain.max}
                  cmap={domain.cmap}
                  markers={markers}
                  onPick={(lat, lon) => setSel({ lat, lon })}
                  hoverFormat={hoverFormat}
                  ariaLabel={`${domain.label} on ${DATES[dateIdx]}`}
                />
              </div>
            )}

            {gridLoading && !grid && viewMode === "2d" && (
              <div style={{ position: "absolute", inset: 0 }}>
                <SkeletonBox h={0} style={{ height: "100%" }} />
              </div>
            )}
            {gridLoading && grid && viewMode === "2d" && (
              <div
                aria-hidden="true"
                style={{
                  position: "absolute",
                  top: 8,
                  right: 8,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: "var(--fs-xs)",
                  color: "var(--accent-strong)",
                  background: "rgba(5, 12, 22, 0.8)",
                  border: "1px solid var(--panel-border-strong)",
                  borderRadius: 999,
                  padding: "3px 10px",
                  zIndex: 4,
                }}
              >
                <span
                  className="pulse-ring"
                  style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--accent)", display: "inline-block" }}
                />
                computing…
              </div>
            )}
            {error && (
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--danger)" }}>
                {error}
              </div>
            )}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <MapLegend cmap={domain.cmap} min={domain.min} max={domain.max} units={domain.units} label={domain.label} ticks={0} />
            <div style={{ display: "flex", gap: 12, fontSize: "var(--fs-xs)", color: "var(--text-3)" }}>
              <MarkerKey color="rgba(125, 211, 252, 0.9)" label="Argo float" round />
              {sel && <MarkerKey color="#45d6ff" label="Selected cell" round />}
            </div>
          </div>
        </Panel>

      {/* ------------- right: profile probe ------------- */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12, minHeight: 0, overflowY: "auto" }}>
        <Panel
          title="Profile probe"
          subtitle={sel ? `${sel.lat.toFixed(2)}°N, ${sel.lon.toFixed(2)}°E · ${fmtDate(DATES[dateIdx])}` : "Click anywhere on the map"}
          actions={
            profile && (
              <Badge tone={profile.rmse03 < 0.5 ? "ok" : profile.rmse03 < 0.9 ? "warn" : "danger"}>
                {`0–300 m RMSE ${fmtNum(profile.rmse03, 2)} °C`}
              </Badge>
            )
          }
        >
          {profileLoading && !profile ? (
            <SkeletonBox h={300} />
          ) : (
            <ProfileChart profile={profile} h={300} />
          )}
        </Panel>

        {profile && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <Stat label="SST (recon)" value={fmtNum(profile.mean[0], 2)} unit="°C" hint="Reconstructed sea-surface temperature at this cell" />
            <Stat label="D20 depth" value={fmtNum(d20At(profile), 0)} unit="m" hint="20 °C isotherm depth from the reconstructed profile" />
            <Stat
              label="Nearest Argo"
              value={profile.argo.length ? fmtNum(profile.argo[0].distKm, 0) : "—"}
              unit={profile.argo.length ? "km" : ""}
              hint="Distance to the nearest recent float profile"
            />
            <Stat
              label="Spread @ 100 m"
              value={fmtNum(profile.spread[7], 2)}
              unit="°C"
              tone="warn"
              hint="Ensemble standard deviation at 100 m"
            />
          </div>
        )}

        {profile && profile.confidence.tone !== "ok" && (
          <Panel title="Reading this profile">
            <p style={{ margin: 0, fontSize: "var(--fs-xs)", lineHeight: 1.65, color: "var(--text-2)" }}>
              {profile.confidence.tone === "danger"
                ? "Below ~500 m this reconstruction is near-climatological: treat the deep tail as a smoothed seasonal estimate, not an eddy-resolving observation."
                : "Moderate confidence at this depth: the uncertainty band covers the GLORYS profile at most levels."}
            </p>
          </Panel>
        )}
      </div>
    </div>
  </div>
  );
}

/* ---------------- helpers ---------------- */

function depthText(z: number): string {
  return z >= 1000 ? "1000 m" : `${z} m`;
}

function floatArrayFromGrid(g: Grid): Float32Array {
  const out = new Float32Array(N_LAT * N_LON).fill(NaN);
  for (let r = 0; r < N_LAT; r++) {
    const row = g.values[r];
    for (let c = 0; c < N_LON; c++) {
      const v = row[c];
      if (v !== null) out[r * N_LON + c] = v;
    }
  }
  return out;
}

function d20At(p: Profile): number {
  for (let k = 1; k < p.depths.length; k++) {
    const t0 = p.mean[k - 1];
    const t1 = p.mean[k];
    if (t0 === null || t1 === null) continue;
    if (t1 <= 20 && t0 > 20) {
      const f = (t0 - 20) / (t0 - t1 || 1e-9);
      return p.depths[k - 1] + f * (p.depths[k] - p.depths[k - 1]);
    }
  }
  return NaN;
}

function LayerOption({
  active,
  onClick,
  dom,
}: {
  active: boolean;
  onClick: () => void;
  dom: { label: string; units: string; cmap: keyof typeof COLORMAPS };
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 9,
        width: "100%",
        textAlign: "left",
        padding: "7px 10px",
        borderRadius: "var(--r-sm)",
        border: `1px solid ${active ? "var(--panel-border-strong)" : "transparent"}`,
        background: active ? "var(--accent-soft)" : "transparent",
        color: active ? "var(--text-0)" : "var(--text-1)",
        fontSize: "var(--fs-sm)",
        cursor: "pointer",
        transition: "all var(--t-fast)",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 14,
          height: 14,
          borderRadius: 4,
          background: COLORMAPS[dom.cmap].css,
          border: "1px solid rgba(148,192,240,0.3)",
          flexShrink: 0,
        }}
      />
      <span style={{ flex: 1 }}>{dom.label}</span>
      <span style={{ color: "var(--text-3)", fontSize: "var(--fs-xs)" }}>{dom.units}</span>
    </button>
  );
}

function layerBlurb(layer: Layer): string {
  switch (layer) {
    case "temp":
      return "Reconstructed temperature from the 3-member embedding ensemble. Surface satellite channels are mapped to each standard depth through the learned latent representation.";
    case "anomaly":
      return "Reconstruction minus the 2015–2022 daily climatology: what the ocean is doing relative to its seasonal cycle — eddies, upwelling, cyclone wakes.";
    case "truth":
      return "GLORYS reanalysis temperature at the same grid — the training target. Shown for comparison; GLORYS assimilates Argo, so it is not an independent reference.";
    case "diff":
      return "Reconstruction minus GLORYS: where the model disagrees with its teacher. Smooth error structure is expected; large coastal differences flag mask effects.";
    case "uncertainty":
      return "Ensemble standard deviation (1σ). Grows with depth and distance from recent Argo profiles; coastal cells carry a small extra penalty.";
    case "ohc":
      return "Tropical cyclone heat potential: heat above 26 °C integrated over 0–300 m (kJ/cm²), the energy available to a passing cyclone (Leipper & Volgenau 1972).";
    case "d26":
      return "Depth of the 26 °C isotherm — a proxy for the warm-layer thickness that fuels cyclone intensification.";
    case "d20":
      return "Depth of the 20 °C isotherm — the classic thermocline-depth indicator used in cyclogenesis studies.";
  }
}

function MarkerKey({ color, label, round = false }: { color: string; label: string; round?: boolean }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
      <span
        style={{
          width: round ? 7 : 10,
          height: round ? 7 : 10,
          borderRadius: round ? "50%" : 3,
          background: color,
          display: "inline-block",
        }}
      />
      {label}
    </span>
  );
}
