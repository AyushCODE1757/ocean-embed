"use client";

/** Compare — three synced maps: reconstruction, GLORYS target, and difference,
 * with ocean-only diff statistics and stacked vs side-by-side layout. */

import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type Grid, type Layer } from "@/lib/api-client";
import { domainFor } from "@/lib/colormaps";
import { Badge, Panel, Segmented, SkeletonBox, SliderField, Stat, InfoDot, useProvenance } from "@/components/ui";
import { OceanMap, MapLegend } from "@/components/ocean-map";
import { TimePlayer } from "@/components/time-player";
import { DEPTHS } from "@/lib/sim/grid";
import { DATES, DEFAULT_DATE } from "@/lib/sim/ocean-dates";
import { fmtDate, fmtNum } from "@/lib/format";
import { useShortcuts } from "@/lib/shortcuts";

type Layout = "side" | "stack";
type CompareLayer = "temp" | "truth" | "diff";

const PANES: { layer: CompareLayer; title: string; subtitle: string }[] = [
  { layer: "temp", title: "OceanEmbed (ours)", subtitle: "3-member ensemble mean" },
  { layer: "truth", title: "GLORYS12V1", subtitle: "Training target — assimilates Argo" },
  { layer: "diff", title: "Reconstruction − GLORYS", subtitle: "Model vs teacher at this depth" },
];

export default function ComparePage() {
  const openProv = useProvenance();
  const [dateIdx, setDateIdx] = useState(() => Math.max(0, DATES.indexOf(DEFAULT_DATE)));
  const [depthIdx, setDepthIdx] = useState(5);
  const [layout, setLayout] = useState<Layout>("side");
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(2);
  const [grids, setGrids] = useState<{ temp: Grid | null; truth: Grid | null; diff: Grid | null }>({
    temp: null,
    truth: null,
    diff: null,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const date = DATES[dateIdx];
    const depth = DEPTHS[depthIdx];
    Promise.all(PANES.map((p) => api.slice(date, depth, p.layer)))
      .then(([temp, truth, diff]) => {
        if (!alive) return;
        setGrids({ temp, truth, diff });
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [dateIdx, depthIdx]);

  const stepDay = useCallback((dir: 1 | -1) => {
    setPlaying(false);
    setDateIdx((i) => Math.min(DATES.length - 1, Math.max(0, i + dir)));
  }, []);
  useShortcuts({ onTogglePlay: () => setPlaying((p) => !p), onStepDay: stepDay });

  const diffStats = useMemo(() => {
    const g = grids.diff;
    if (!g) return null;
    let n = 0;
    let sum = 0;
    let sumSq = 0;
    let maxAbs = 0;
    for (const row of g.values) {
      for (const v of row) {
        if (v === null || Number.isNaN(v)) continue;
        n++;
        sum += v;
        sumSq += v * v;
        maxAbs = Math.max(maxAbs, Math.abs(v));
      }
    }
    if (!n) return null;
    const mean = sum / n;
    const rmse = Math.sqrt(sumSq / n);
    return { n, mean, rmse, maxAbs };
  }, [grids.diff]);

  const gridCols = layout === "side" ? "repeat(3, minmax(0, 1fr))" : "1fr";

  return (
    <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12, flex: 1, minHeight: 0 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "var(--fs-lg)", fontWeight: 600 }}>Side-by-side comparison</h1>
          <p style={{ margin: "4px 0 0", fontSize: "var(--fs-sm)", color: "var(--text-3)" }}>
            Same date and depth on all three panels · scroll/zoom independently per map
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Segmented
            ariaLabel="Layout"
            size="sm"
            options={[
              { value: "side", label: "3-up" },
              { value: "stack", label: "Stacked" },
            ]}
            value={layout}
            onChange={setLayout}
          />
          <InfoDot title="Provenance" onClick={openProv} />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "280px minmax(0, 1fr)", gap: 12, flex: 1, minHeight: 0 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Panel title="Depth" subtitle={`Standard level · ${DEPTHS[depthIdx]} m`}>
            <SliderField
              label="Depth level"
              valueText={DEPTHS[depthIdx] >= 1000 ? "1000 m" : `${DEPTHS[depthIdx]} m`}
              min={0}
              max={DEPTHS.length - 1}
              value={depthIdx}
              onChange={setDepthIdx}
            />
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
          {diffStats && (
            <Panel title="Diff stats (ocean cells)" subtitle={fmtDate(DATES[dateIdx])}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <Stat label="Bias" value={fmtNum(diffStats.mean, 3)} unit="°C" hint="Mean signed difference" />
                <Stat label="RMSE" value={fmtNum(diffStats.rmse, 3)} unit="°C" hint="Root-mean-square vs GLORYS" />
                <Stat label="Max |Δ|" value={fmtNum(diffStats.maxAbs, 2)} unit="°C" />
                <Stat label="Cells" value={diffStats.n.toLocaleString("en-GB")} unit="" />
              </div>
            </Panel>
          )}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: gridCols,
            gridTemplateRows: layout === "stack" ? "repeat(3, minmax(200px, 1fr))" : undefined,
            gap: 10,
            minHeight: 0,
          }}
        >
          {PANES.map((pane) => {
            const dom = domainFor(pane.layer);
            const grid = grids[pane.layer];
            return (
              <Panel
                key={pane.layer}
                title={pane.title}
                subtitle={`${pane.subtitle} · ${fmtDate(DATES[dateIdx])}`}
                actions={loading ? <Badge tone="accent">loading…</Badge> : <Badge tone="ok">synced</Badge>}
                bodyStyle={{ display: "flex", flexDirection: "column", gap: 8, padding: 10, minHeight: 0 }}
                style={{ minHeight: layout === "stack" ? 220 : 0, display: "flex", flexDirection: "column" }}
              >
                <div style={{ flex: 1, minHeight: 180, position: "relative" }}>
                  {grid ? (
                    <OceanMap
                      values={floatArrayFromGrid(grid)}
                      vmin={dom.min}
                      vmax={dom.max}
                      cmap={dom.cmap}
                      ariaLabel={`${pane.title} at ${DEPTHS[depthIdx]} m`}
                    />
                  ) : (
                    <SkeletonBox h={0} style={{ height: "100%" }} />
                  )}
                </div>
                <MapLegend cmap={dom.cmap} min={dom.min} max={dom.max} units={dom.units} label={dom.label} ticks={0} />
              </Panel>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function floatArrayFromGrid(g: Grid): Float32Array {
  const nLat = g.values.length;
  const nLon = g.values[0]?.length ?? 0;
  const out = new Float32Array(nLat * nLon).fill(NaN);
  for (let r = 0; r < nLat; r++) {
    const row = g.values[r];
    for (let c = 0; c < nLon; c++) {
      const v = row[c];
      if (v !== null) out[r * nLon + c] = v;
    }
  }
  return out;
}
