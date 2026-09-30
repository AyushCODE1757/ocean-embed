"use client";

/** Argo Advisor — where the model is least trustworthy and where the next
 * float would reduce error the most. Observation-gap map + greedy top-K
 * sites + mini-OSSE evidence chart with its stated limitation. */

import { useEffect, useMemo, useState } from "react";

import { api, type GapSite, type Osse } from "@/lib/api-client";
import { domainFor } from "@/lib/colormaps";
import { Badge, Button, DataTable, Panel, Progress, SliderField, Stat, InfoDot, useProvenance } from "@/components/ui";
import { OceanMap, MapLegend, type MapMarker } from "@/components/ocean-map";
import { DATES } from "@/lib/sim/ocean-dates";
import { simApi } from "@/lib/sim";
import { fmtDate, fmtNum } from "@/lib/format";

export default function AdvisorPage() {
  const openProv = useProvenance();
  const [dateIdx, setDateIdx] = useState(() => Math.max(0, DATES.indexOf("2024-06-15")));
  const [k, setK] = useState(8);
  const [sites, setSites] = useState<GapSite[]>([]);
  const [note, setNote] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState(0);
  const [osse, setOsse] = useState<Osse | null>(null);
  const [ran, setRan] = useState(false);

  useEffect(() => {
    api.osse().then(setOsse);
  }, []);

  const compute = async () => {
    setBusy(true);
    setPct(0);
    setRan(true);
    const res = await api.gaps(DATES[dateIdx], k, setPct);
    setSites(res.sites);
    setNote(res.methodNote);
    setBusy(false);
  };

  /* auto-run once on load so the view is never empty */
  useEffect(() => {
    void compute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const markers = useMemo<MapMarker[]>(() => {
    const ms: MapMarker[] = simApi.floatPositions(DATES[dateIdx]).map((f) => ({
      lat: f.lat,
      lon: f.lon,
      kind: "argo" as const,
    }));
    for (const s of sites) ms.push({ lat: s.lat, lon: s.lon, kind: "site", rank: s.rank });
    return ms;
  }, [dateIdx, sites]);

  const dom = domainFor("uncertainty");

  return (
    <div style={{ padding: 14, display: "grid", gridTemplateColumns: "minmax(0, 1fr) 420px", gap: 12, flex: 1, minHeight: 0 }}>
      {/* left: map + osse */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12, minHeight: 0 }}>
        <Panel
          title="Observation-gap map"
          subtitle={`Ensemble spread at 100 m · ${fmtDate(DATES[dateIdx])} · amber rings = recommended deployment sites`}
          actions={
            <>
              {busy ? <Badge tone="accent">ranking sites…</Badge> : <Badge tone="ok">{sites.length} sites</Badge>}
              <InfoDot title="Provenance" onClick={openProv} />
            </>
          }
          bodyStyle={{ display: "flex", flexDirection: "column", gap: 10, padding: 10, minHeight: 0 }}
          style={{ flex: 1, minHeight: 300 }}
        >
          <div style={{ flex: 1, minHeight: 240, position: "relative" }}>
            <UncertaintyMap dateIdx={dateIdx} markers={markers} />
          </div>
          <MapLegend cmap={dom.cmap} min={dom.min} max={dom.max} units={dom.units} label={dom.label} ticks={0} />
        </Panel>

        <Panel
          title="Does the placement help? — mini-OSSE"
          subtitle={osse ? `${osse.metric} · K=${osse.k} sites · ${osse.nDates} dates × ${osse.nSeeds} seeds` : "loading experiment…"}
          actions={osse && <Badge tone="teal">{`+${fmtNum((osse.arms[0].meanRmse / osse.arms[2].meanRmse - 1) * -100, 1)}% vs random`}</Badge>}
        >
          {osse ? (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 12 }}>
                <Stat label="Advisor gain vs random" value={fmtNum((osse.arms[0].meanRmse / osse.arms[2].meanRmse - 1) * -100, 1)} unit="%" tone="ok" hint="Lower RMSE with the same number of floats" />
                <Stat label="Seed-to-seed spread" value={fmtNum(osse.arms[2].stdRmse, 3)} unit="°C" hint="The gain exceeds the spread — the ranking is a real signal" />
                <Stat label="Experiment ID" value={<span style={{ fontSize: "var(--fs-md)" }}>{osse.runId}</span>} />
              </div>
              <OsseChart osse={osse} />
              <p style={{ margin: "10px 0 0", fontSize: "var(--fs-xs)", color: "var(--warn)", lineHeight: 1.6 }}>
                <b>Limitation.</b> {osse.limitationNote}
              </p>
            </>
          ) : (
            <div className="skeleton" style={{ height: 140 }} />
          )}
        </Panel>
      </div>

      {/* right rail: controls + table */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12, minHeight: 0, overflowY: "auto" }}>
        <Panel title="Deployment request">
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <SliderField
              label="Date"
              valueText={fmtDate(DATES[dateIdx])}
              min={0}
              max={DATES.length - 1}
              value={dateIdx}
              disabled={busy}
              onChange={(i) => {
                setDateIdx(i);
                setRan(false);
              }}
            />
            <SliderField
              label="Floats to place (K)"
              valueText={String(k)}
              min={1}
              max={16}
              value={k}
              disabled={busy}
              onChange={setK}
            />
            <Button variant="solid" onClick={compute} disabled={busy}>
              {busy ? "Computing…" : ran ? "Recompute sites" : "Compute sites"}
            </Button>
            {busy && <Progress pct={pct} label="Ranking sites…" />}
            <p style={{ margin: 0, fontSize: "var(--fs-xs)", color: "var(--text-3)", lineHeight: 1.6 }}>{note || "Score = 0.55×(ensemble spread at 100 m) + 0.45×(distance to nearest recent Argo profile), greedy selection with minimum spacing. Stated as our own heuristic."}</p>
          </div>
        </Panel>

        <Panel
          title="Recommended float sites"
          subtitle={sites.length ? "Greedy top-K, minimum spacing ≈ 390 km" : "Run a request to see ranked sites"}
          actions={sites.length > 0 && <Badge tone="accent">{`${sites.length} of ${k}`}</Badge>}
        >
          {sites.length === 0 ? (
            <p style={{ margin: 0, color: "var(--text-3)", fontSize: "var(--fs-sm)" }}>
              {busy ? "Ranking cells by uncertainty × observation distance…" : "No sites yet — press Compute."}
            </p>
          ) : (
            <DataTable
              dense
              maxHeight={420}
              columns={[
                { key: "rank", label: "#", align: "right" },
                { key: "lat", label: "Lat", align: "right" },
                { key: "lon", label: "Lon", align: "right" },
                { key: "score", label: "Score", align: "right", title: "Combined gap score (0–1)" },
                { key: "unc", label: "σ 100 m (°C)", align: "right" },
                { key: "dist", label: "Argo dist (km)", align: "right" },
              ]}
              rows={sites.map((s) => ({
                rank: s.rank,
                lat: s.lat.toFixed(2),
                lon: s.lon.toFixed(2),
                score: s.score.toFixed(3),
                unc: fmtNum(s.uncertainty, 2),
                dist: fmtInt0(s.distToArgoKm),
              }))}
              rowKey={(r) => String(r.rank)}
              highlightRow={(r) => Number(r.rank) === 1}
            />
          )}
          <p style={{ margin: "10px 0 0", fontSize: "var(--fs-xs)", color: "var(--text-3)", lineHeight: 1.6 }}>
            Sites are only as trustworthy as the uncertainty is calibrated — see the reliability diagram in Validation.
          </p>
        </Panel>
      </div>
    </div>
  );
}

/* ---------------- uncertainty map wrapper ---------------- */

function UncertaintyMap({ dateIdx, markers }: { dateIdx: number; markers: MapMarker[] }) {
  const [vals, setVals] = useState<Float32Array | null>(null);
  useEffect(() => {
    let alive = true;
    simApi.slice(DATES[dateIdx], 100, "uncertainty").then((g) => {
      if (!alive) return;
      const out = new Float32Array(101 * 241).fill(NaN);
      for (let r = 0; r < 101; r++) {
        for (let c = 0; c < 241; c++) {
          const v = g.values[r][c];
          if (v !== null) out[r * 241 + c] = v;
        }
      }
      setVals(out);
    });
    return () => {
      alive = false;
    };
  }, [dateIdx]);
  return (
    <OceanMap
      values={vals}
      vmin={domainFor("uncertainty").min}
      vmax={domainFor("uncertainty").max}
      cmap="viridis"
      markers={markers}
      ariaLabel="Uncertainty map with recommended float sites"
    />
  );
}

/* ---------------- OSSE bar chart ---------------- */

function OsseChart({ osse }: { osse: Osse }) {
  const W = 560;
  const H = 190;
  const pad = { l: 168, r: 16, t: 12, b: 26 };
  const max = Math.max(...osse.arms.map((a) => a.meanRmse + a.stdRmse)) * 1.04;
  const min = Math.min(...osse.arms.map((a) => a.meanRmse - a.stdRmse)) * 0.96;
  const x = (v: number) => pad.l + ((v - min) / (max - min)) * (W - pad.l - pad.r);
  const bw = 26;
  return (
    <svg role="img" aria-label="OSSE arms comparison" width="100%" viewBox={`0 0 ${W} ${H}`}>
      {osse.arms.map((a, i) => {
        const y = pad.t + i * ((H - pad.t - pad.b) / osse.arms.length) + 6;
        const cx = x(a.meanRmse);
        return (
          <g key={a.name}>
            <text x={pad.l - 8} y={y + bw / 2 + 4} fontSize="10" fill={a.highlight ? "var(--accent-strong)" : "var(--text-1)"} textAnchor="end">
              {a.name}
            </text>
            {/* error bar */}
            <line x1={x(a.meanRmse - a.stdRmse)} x2={x(a.meanRmse + a.stdRmse)} y1={y + bw / 2} y2={y + bw / 2} stroke="rgba(234, 243, 253, 0.55)" strokeWidth="1.4" />
            <line x1={x(a.meanRmse - a.stdRmse)} x2={x(a.meanRmse - a.stdRmse)} y1={y + bw / 2 - 4} y2={y + bw / 2 + 4} stroke="rgba(234, 243, 253, 0.55)" strokeWidth="1.4" />
            <line x1={x(a.meanRmse + a.stdRmse)} x2={x(a.meanRmse + a.stdRmse)} y1={y + bw / 2 - 4} y2={y + bw / 2 + 4} stroke="rgba(234, 243, 253, 0.55)" strokeWidth="1.4" />
            {/* bar */}
            <rect
              x={pad.l}
              y={y}
              width={Math.max(0, cx - pad.l)}
              height={bw}
              rx={4}
              fill={a.highlight ? "rgba(69, 214, 255, 0.35)" : "rgba(125, 178, 240, 0.16)"}
              stroke={a.highlight ? "var(--accent)" : "var(--panel-border-strong)"}
            />
            <text x={cx + 6} y={y + bw / 2 + 4} fontSize="10" fill="var(--text-1)" fontFamily="var(--font-mono)">
              {a.meanRmse.toFixed(3)} ± {a.stdRmse.toFixed(3)}
            </text>
          </g>
        );
      })}
      <text x={pad.l + 8} y={H - 8} fontSize="9" fill="#6f8aa6">
        lower RMSE is better →
      </text>
    </svg>
  );
}

function fmtInt0(v: number): string {
  return Math.round(v).toLocaleString("en-GB");
}
