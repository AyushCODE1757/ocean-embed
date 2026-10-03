"use client";

import { useEffect, useMemo, useState } from "react";
import { DataState, useMeta } from "@/components/feedback/DataState";
import { ChipRow } from "@/components/controls/Controls";
import { api, type MetricRow, type Metrics } from "@/lib/api-client";
import { basinLabel, methodLabel, seasonLabel } from "@/lib/format";

/* Validation tables straight from /v1/metrics (built from B's results JSONs).
   Baselines and reference products sit next to ours on the same footing;
   the Argo-independence caveat is part of the data, not an afterthought. */

const METHODS = ["oceanembed", "climatology", "glorys", "armor3d"];
const DEPTHS_SHOWN = [0, 20, 50, 100, 150, 200, 300, 500, 700, 1000];

export default function Validation() {
  const { meta, error: metaErr } = useMeta();
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [method, setMethod] = useState("");
  const [basin, setBasin] = useState("all");
  const [season, setSeason] = useState("all");

  useEffect(() => {
    api.metrics().then(setMetrics).catch((e) => setErr(String(e?.message ?? e)));
  }, []);

  const seasons = useMemo(
    () => [...new Set((metrics?.rows ?? []).map((r) => r.season))],
    [metrics],
  );
  const basins = useMemo(
    () => [...new Set((metrics?.rows ?? []).map((r) => r.basin))],
    [metrics],
  );

  const rows: MetricRow[] = useMemo(() => {
    if (!metrics) return [];
    return metrics.rows.filter(
      (r) =>
        (!method || r.method === method) &&
        (!basin || r.basin === basin) &&
        (!season || r.season === season) &&
        DEPTHS_SHOWN.includes(r.depth_m),
    );
  }, [metrics, method, basin, season]);

  const pivoted = useMemo(() => pivot(rows, DEPTHS_SHOWN), [rows]);

  return (
    <div className="container" style={{ padding: "var(--s5) var(--s5) var(--s6)" }}>
      <p className="eyebrow">Validation</p>
      <h1 className="h2" style={{ margin: "6px 0 var(--s2)" }}>Scored against what it never saw.</h1>
      <p className="lede" style={{ marginBottom: "var(--s4)" }}>
        Two independent-ish checks on the held-out test years {metrics?.test_years.join("–") ?? "2024–2025"}:
        against the GLORYS field (the training target) and against raw Argo profiles, matched to the
        nearest 0.25° cell and day. All methods are scored on identical collocations.
      </p>

      {(metaErr ?? err) && <DataState error={metaErr ?? err} />}

      {metrics?.independence_note && (
        <div className="note" style={{ marginBottom: "var(--s4)" }}>
          <b>Argo-independence caveat.</b> {metrics.independence_note}
        </div>
      )}

      <div className="panel panel-pad col" style={{ gap: 10, marginBottom: "var(--s4)" }}>
        <ChipRow
          label="Method"
          options={[{ value: "", label: "All methods" }, ...METHODS.map((m) => ({ value: m, label: methodLabel(m) }))]}
          value={method}
          onChange={setMethod}
        />
        <ChipRow
          label="Basin"
          options={basins.map((b) => ({ value: b, label: basinLabel(b) }))}
          value={basin}
          onChange={setBasin}
        />
        <ChipRow
          label="Group"
          options={seasons.map((s) => ({ value: s, label: seasonLabel(s) }))}
          value={season}
          onChange={setSeason}
        />
        <p className="tiny" style={{ margin: 0 }}>
          n = matched Argo profiles per depth · low-skill depths (&gt;= 500 m) are marked — the
          model is effectively climatology there.
        </p>
      </div>

      {!metrics && !err && <div className="skeleton" style={{ height: 320 }} aria-label="Loading metrics" />}

      {metrics && pivoted && (
        <div className="panel table-wrap">
          <div className="panel-head spread wrap">
            <b style={{ fontSize: 14 }}>RMSE (°C) by depth</b>
            <span className="badge warn">deeper than 500 m ≈ no skill</span>
          </div>
          <table className="data">
            <thead>
              <tr>
                <th scope="col">Depth (m)</th>
                {pivoted.methods.map((m) => (
                  <th key={m} scope="col">{methodLabel(m)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pivoted.byDepth.map(({ depth, cells }) => (
                <tr key={depth}>
                  <td>
                    {depth} {depth >= 500 && <span className="badge warn" style={{ marginLeft: 6 }}>low skill</span>}
                  </td>
                  {cells.map((c, i) => {
                    const best = Math.min(...cells.filter((x): x is number => x !== null));
                    return (
                      <td key={i} className={c === best ? "best" : c !== null && c > best * 1.25 ? "hot" : ""}>
                        {c?.toFixed(3) ?? "—"}
                        {c !== null && i >= 0 && <Nsuffix n={pivoted.ns[depth]} />}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {metrics && (
        <div className="row wrap" style={{ gap: "var(--s4)", marginTop: "var(--s4)" }}>
          <div className="panel panel-pad" style={{ flex: "1 1 300px" }}>
            <p className="eyebrow muted">What the numbers say</p>
            <ul className="small" style={{ margin: "8px 0 0", paddingLeft: 18, display: "grid", gap: 6 }}>
              <li>Biggest win: 75–150 m (thermocline) — skill vs climatology 0.32–0.45 against GLORYS.</li>
              <li>Warm bias vs Argo of ~+0.8 °C at 100–125 m — the model over-deepens the mixed layer.</li>
              <li>Against raw Argo, ARMOR3D (0.71 °C at 100 m) and GLORYS (1.22) both beat the model (1.73).</li>
              <li>The model never beats climatology below 500 m — flagged, not hidden.</li>
            </ul>
          </div>
          <div className="panel panel-pad" style={{ flex: "1 1 300px" }}>
            <p className="eyebrow muted">Why ARMOR3D wins the Argo score</p>
            <p className="small" style={{ marginTop: 8 }}>
              ARMOR3D is built by optimal interpolation that <i>assimilates in-situ profiles</i> —
              the same Argo data we score against. GLORYS assimilates them too. Our inputs are
              satellites only, so this comparison measures how much of the gap physics-free surface
              information can close, honestly.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function Nsuffix({ n }: { n?: number }) {
  if (!n) return null;
  return <span className="tiny" style={{ marginLeft: 6, opacity: 0.7 }}>n={n.toLocaleString("en-IN")}</span>;
}

function pivot(rows: MetricRow[], depths: number[]) {
  if (!rows.length) return null;
  const methods = [...new Set(rows.map((r) => r.method))];
  const byDepth = depths
    .filter((d) => rows.some((r) => r.depth_m === d))
    .map((depth) => ({
      depth,
      cells: methods.map((m) => rows.find((r) => r.method === m && r.depth_m === depth)?.rmse ?? null),
    }));
  const ns: Record<number, number | undefined> = {};
  for (const d of depths) {
    const r = rows.find((x) => x.depth_m === d && x.n > 0);
    ns[d] = r?.n;
  }
  return { methods, byDepth, ns };
}
