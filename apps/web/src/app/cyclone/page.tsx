"use client";

/** Cyclone case study — Cyclone Remal (Bay of Bengal, May 2024).
 * Pre-storm ocean heat content along the track, post-storm cold wake,
 * and the honest caveats (15-level vertical sampling; under-dispersed
 * wake for ~3 days). Track from IMD best-track, 6-hourly. */

import { useEffect, useMemo, useRef, useState } from "react";
import { api, type Cyclone, type Grid } from "@/lib/api-client";
import { domainFor } from "@/lib/colormaps";
import { Badge, Button, Panel, Segmented, SkeletonBox, Stat, InfoDot, useProvenance } from "@/components/ui";
import { OceanMap, MapLegend, type MapMarker } from "@/components/ocean-map";
import { simApi } from "@/lib/sim";
import { fmtDate } from "@/lib/format";
import { downloadCanvasPng } from "@/lib/export";

type Mode = "ohc-pre" | "wake-post" | "d26-pre";

const PRE_DATE = "2024-05-23"; // one day before formation
const POST_DATE = "2024-05-29"; // wake near max extent

export default function CyclonePage() {
  const openProv = useProvenance();
  const [cyclone, setCyclone] = useState<Cyclone | null>(null);
  const [mode, setMode] = useState<Mode>("ohc-pre");
  const [grid, setGrid] = useState<Grid | null>(null);
  const [loading, setLoading] = useState(true);
  const mapWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.cyclone().then(setCyclone);
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const req =
      mode === "ohc-pre"
        ? api.heat(PRE_DATE, "ohc", 16.5, 87.2)
        : mode === "d26-pre"
          ? api.heat(PRE_DATE, "d26", 16.5, 87.2)
          : api.slice(POST_DATE, 0, "diff");
    req
      .then((g) => {
        if (alive) setGrid(g);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [mode]);

  const markers = useMemo<MapMarker[]>(() => {
    if (!cyclone) return [];
    return cyclone.track.map((p) => ({
      lat: p.lat,
      lon: p.lon,
      kind: "track" as const,
      windKt: p.windKt,
      label: `${p.cat} ${p.windKt} kt`,
    }));
  }, [cyclone]);

  const dom = mode === "ohc-pre" ? domainFor("ohc") : mode === "d26-pre" ? domainFor("d26") : domainFor("diff");

  const vals = useMemo(() => {
    if (!grid) return null;
    const out = new Float32Array(101 * 241).fill(NaN);
    for (let r = 0; r < 101; r++) {
      for (let c = 0; c < 241; c++) {
        const v = grid.values[r][c];
        if (v !== null) out[r * 241 + c] = v;
      }
    }
    return out;
  }, [grid]);

  return (
    <div style={{ padding: 14, display: "grid", gridTemplateColumns: "minmax(0, 1fr) 360px", gap: 12, flex: 1, minHeight: 0 }}>
      {/* map */}
      <Panel
        title={
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            {mode === "ohc-pre"
              ? `Ocean heat content before Remal — ${fmtDate(PRE_DATE)}`
              : mode === "d26-pre"
                ? `26 °C isotherm depth before Remal — ${fmtDate(PRE_DATE)}`
                : `Cold-wake SST anomaly — ${fmtDate(POST_DATE)}`}
            <Badge tone="danger">red circles = track (size ∝ intensity)</Badge>
          </span>
        }
        subtitle="Scroll to zoom · hover for values · IMD best-track, 6-hourly"
        actions={
          <>
            <Segmented
              ariaLabel="Case study field"
              size="sm"
              options={[
                { value: "ohc-pre", label: "OHC (pre)" },
                { value: "d26-pre", label: "D26 (pre)" },
                { value: "wake-post", label: "SST wake (post)" },
              ]}
              value={mode}
              onChange={(v) => setMode(v)}
            />
            <Button
              variant="icon"
              title="Export map as PNG"
              onClick={() => {
                const cvs = mapWrapRef.current?.querySelector("canvas");
                if (cvs) downloadCanvasPng(cvs, `oceanembed_${mode}_remal2024.png`);
              }}
            >
              ⤓
            </Button>
            <InfoDot title="Provenance" onClick={openProv} />
          </>
        }
        bodyStyle={{ display: "flex", flexDirection: "column", gap: 10, padding: 10, minHeight: 0 }}
        style={{ minHeight: 0 }}
      >
        <div ref={mapWrapRef} style={{ flex: 1, minHeight: 300, position: "relative" }}>
          {loading || !vals ? (
            <SkeletonBox h={0} style={{ height: "100%" }} />
          ) : (
            <div className="rise-in" style={{ position: "absolute", inset: 0 }}>
              <OceanMap values={vals} vmin={dom.min} vmax={dom.max} cmap={dom.cmap} markers={markers} ariaLabel={`${dom.label} with cyclone track`} />
            </div>
          )}
        </div>
        <MapLegend cmap={dom.cmap} min={dom.min} max={dom.max} units={dom.units} label={dom.label} ticks={0} />
      </Panel>

      {/* story rail */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12, minHeight: 0, overflowY: "auto" }}>
        <Panel
          title={cyclone ? `Cyclone ${cyclone.name} — ${cyclone.basin}, ${cyclone.season}` : "Loading case…"}
          actions={cyclone && <Badge tone="danger">{`peak ${cyclone.peakKt} kt · VSCS`}</Badge>}
        >
          {cyclone ? (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                <Stat label="Formed" value={<span style={{ fontSize: "var(--fs-md)" }}>{fmtDate(cyclone.formed)}</span>} />
                <Stat label="Dissipated" value={<span style={{ fontSize: "var(--fs-md)" }}>{fmtDate(cyclone.dissipated)}</span>} />
                <Stat label="Peak wind" value={cyclone.peakKt} unit="kt" tone="danger" />
                <Stat label="Landfall" value={<span style={{ fontSize: "var(--fs-xs)" }}>Sundarbans</span>} hint={cyclone.landfallNear} />
              </div>
              <p style={{ margin: 0, fontSize: "var(--fs-sm)", lineHeight: 1.7, color: "var(--text-1)" }}>{cyclone.narrative}</p>
            </>
          ) : (
            <SkeletonBox h={180} />
          )}
        </Panel>

        <Panel title="Why it matters" subtitle="Cyclone heat content is the ocean's fuel tank">
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: "var(--fs-xs)", color: "var(--text-2)", lineHeight: 1.7 }}>
            <li>
              Pre-storm OHC along the track exceeded <b className="num">90 kJ/cm²</b> with D26 deeper than{" "}
              <b className="num">110 m</b> — high oceanic fuel for intensification.
            </li>
            <li>
              The reconstructed fields resolve the warm core from <b>surface satellites alone</b> — no in-situ data
              required before the storm.
            </li>
            <li>
              The post-storm cold wake (<b className="num">−1.9 °C</b> peak) stays visible for ~6 days, matching the
              known SST response to a very severe cyclonic storm.
            </li>
          </ul>
        </Panel>

        <Panel title="Caveats, stated plainly">
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: "var(--fs-xs)", color: "var(--text-2)", lineHeight: 1.7 }}>
            <li>Isotherm depths come from interpolation over 15 coarse levels and carry a vertical-sampling error (±10–20 m typical).</li>
            <li>The uncertainty spread is under-dispersed in the wake for ~3 days after passage — treat wake-region confidence bands with care.</li>
            <li>Reference: Leipper &amp; Volgenau (1972), heat potential.</li>
          </ul>
        </Panel>
      </div>
    </div>
  );
}
