"use client";

import { useEffect, useState } from "react";
import OceanMap from "@/components/map/OceanMap";
import { ChipRow, Colorbar, DateSlider } from "@/components/controls/Controls";
import { DataState, useMeta } from "@/components/feedback/DataState";
import { api, cachedSlice, type SliceField } from "@/lib/api-client";
import { fieldToDataURL, stretch, rampFor } from "@/lib/colormaps";
import { fmtDate } from "@/lib/format";

/* Side-by-side: reconstruction vs GLORYS vs error, one shared control set,
   independently browsable. Each panel keeps its own colour stretch so the
   error panel can use a symmetric scale. */

const PANELS: { field: SliceField; title: string; note: string }[] = [
  { field: "model", title: "OceanEmbed", note: "reconstructed" },
  { field: "truth", title: "GLORYS", note: "training target" },
  { field: "error", title: "Error", note: "OceanEmbed − GLORYS" },
];

export default function Compare() {
  const { meta, error } = useMeta();
  const dates = meta?.dates ?? [];
  const [dateIdx, setDateIdx] = useState(0);
  const [depth, setDepth] = useState(100);
  const [playing, setPlaying] = useState(false);
  const [views, setViews] = useState<Record<string, { url: string; lo: number; hi: number } | null>>({});
  const [stats, setStats] = useState<Record<string, { mean: number; n: number }>>({});
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const date = dates[dateIdx] ?? "";

  useEffect(() => {
    if (!date || !meta) return;
    let on = true;
    // keep the previous field visible while the new one renders (no layout
    // oscillation); swap atomically when all three are ready
    setBusy(true);
    Promise.all(
      PANELS.map(async (p) => {
        const s = await cachedSlice(date, depth, p.field);
        const flat = s.values.flat().filter((v): v is number => v !== null);
        const r = p.field === "error" ? symmetric(flat) : stretch(flat);
        const mean = flat.reduce((a, b) => a + b, 0) / (flat.length || 1);
        return [p.field, {
          url: fieldToDataURL([...s.values].reverse(), { ramp: rampFor(p.field), lo: r.lo, hi: r.hi }),
          lo: r.lo, hi: r.hi, mean, nValid: flat.length,
        }] as const;
      }),
    )
      .then((pairs) => {
        if (!on) return;
        setViews(Object.fromEntries(pairs.map(([k, v]) => [k, { url: v.url, lo: v.lo, hi: v.hi }])));
        setStats(Object.fromEntries(pairs.map(([k, v]) => [k, { mean: v.mean, n: v.nValid }])));
        setBusy(false);
      })
      .catch((e) => {
        if (!on) return;
        setFailed(String(e?.message ?? e));
        setBusy(false);
      });
    return () => { on = false; };
  }, [date, depth, meta]);

  if (error) return <DataState error={error} />;

  return (
    <div className="container" style={{ padding: "var(--s5) var(--s5) var(--s6)" }}>
      <p className="eyebrow">Compare</p>
      <h1 className="h2" style={{ margin: "6px 0 var(--s4)" }}>What did the model get wrong today?</h1>
      <div className="panel panel-pad col" style={{ gap: 12, marginBottom: "var(--s4)" }}>
        <DateSlider dates={dates} index={dateIdx} onIndex={setDateIdx} playing={playing} onPlaying={setPlaying} />
        <ChipRow
          label="Depth"
          options={(meta?.depths_m ?? []).map((d) => ({ value: String(d), label: `${d} m` }))}
          value={String(depth)}
          onChange={(v) => setDepth(Number(v))}
        />
        <p className="tiny" style={{ margin: 0 }}>
          {date ? `${fmtDate(date)} · ${depth} m` : "loading…"} — each panel is stretched to its own
          2nd–98th percentile; use the legends, not the colours, to compare magnitudes.
        </p>
      </div>
      {failed && <div className="note bad" role="alert">{failed}</div>}
      <div className="row wrap" style={{ gap: "var(--s4)", alignItems: "stretch" }}>
        {PANELS.map((p) => {
          const v = views[p.field];
          const st = stats[p.field];
          return (
            <div key={p.field} className="panel" style={{ flex: "1 1 430px", overflow: "hidden" }}>
              <div className="panel-head spread">
                <b style={{ fontSize: 15 }}>{p.title}</b>
                <span className="row" style={{ gap: 8 }}>
                  {busy && v && <span className="badge info">updating…</span>}
                  <span className="badge">{p.note}</span>
                </span>
              </div>
              <div style={{ position: "relative", height: 360, opacity: busy && v ? 0.75 : 1, transition: "opacity 200ms" }}>
                <OceanMap
                  field={v?.url ?? null}
                  lon0={meta?.lon[0] ?? 45} lat0={meta?.lat[0] ?? 5}
                  lon1={meta?.lon[meta.lon.length - 1] ?? 105} lat1={meta?.lat[meta.lat.length - 1] ?? 30}
                  interactive={false}
                />
                {!v && <div className="skeleton" style={{ position: "absolute", inset: 12 }} />}
              </div>
              {/* fixed-height footer: no layout shift while fields load */}
              <div className="panel-pad col" style={{ paddingTop: 10, gap: 6, minHeight: 58 }}>
                {v ? <Colorbar field={p.field} lo={v.lo} hi={v.hi} units="°C" /> : <div className="skeleton" style={{ height: 10 }} />}
                <p className="tiny num" style={{ margin: 0, minHeight: 18 }}>
                  {st
                    ? p.field === "error"
                      ? <>area-mean bias {st.mean >= 0 ? "+" : ""}{st.mean.toFixed(2)} °C over {st.n.toLocaleString("en-IN")} wet cells · {fmtDate(date)} · {depth} m</>
                      : <>domain mean {st.mean.toFixed(2)} °C over {st.n.toLocaleString("en-IN")} wet cells · {fmtDate(date)} · {depth} m</>
                    : " "}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function symmetric(flat: number[]) {
  const m = Math.max(...flat.map(Math.abs), 0.1);
  return { lo: -m, hi: m };
}
