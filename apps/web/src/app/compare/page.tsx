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
  { field: "error", title: "Model − GLORYS", note: "error" },
];

export default function Compare() {
  const { meta, error } = useMeta();
  const dates = meta?.dates ?? [];
  const [dateIdx, setDateIdx] = useState(0);
  const [depth, setDepth] = useState(100);
  const [playing, setPlaying] = useState(false);
  const [views, setViews] = useState<Record<string, { url: string; lo: number; hi: number } | null>>({});
  const [failed, setFailed] = useState<string | null>(null);

  const date = dates[dateIdx] ?? "";

  useEffect(() => {
    if (!date || !meta) return;
    let on = true;
    setViews({});
    Promise.all(
      PANELS.map(async (p) => {
        const s = await cachedSlice(date, depth, p.field);
        const flat = s.values.flat().filter((v): v is number => v !== null);
        const r = p.field === "error" ? symmetric(flat) : stretch(flat);
        return [p.field, {
          url: fieldToDataURL([...s.values].reverse(), { ramp: rampFor(p.field), lo: r.lo, hi: r.hi }),
          lo: r.lo, hi: r.hi,
        }] as const;
      }),
    )
      .then((pairs) => {
        if (on) setViews(Object.fromEntries(pairs));
      })
      .catch((e) => on && setFailed(String(e?.message ?? e)));
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
          return (
            <div key={p.field} className="panel" style={{ flex: "1 1 300px", overflow: "hidden" }}>
              <div className="panel-head spread">
                <b style={{ fontSize: 14 }}>{p.title}</b>
                <span className="badge">{p.note}</span>
              </div>
              <div style={{ position: "relative", height: 260 }}>
                <OceanMap
                  field={v?.url ?? null}
                  lon0={meta?.lon[0] ?? 45} lat0={meta?.lat[0] ?? 5}
                  lon1={meta?.lon[meta.lon.length - 1] ?? 105} lat1={meta?.lat[meta.lat.length - 1] ?? 30}
                  interactive={false}
                />
                {!v && <div className="skeleton" style={{ position: "absolute", inset: 12 }} />}
              </div>
              <div className="panel-pad" style={{ paddingTop: 10 }}>
                {v && <Colorbar field={p.field} lo={v.lo} hi={v.hi} units="°C" />}
              </div>
            </div>
          );
        })}
      </div>
      <p className="tiny" style={{ marginTop: "var(--s3)" }}>
        The error panel is where the honest story lives: warm bias through the thermocline
        (~+0.8 °C against Argo at 100–125 m), largest errors in the southern bay, and land-adjacent
        shelves where GLORYS itself is least constrained.
      </p>
    </div>
  );
}

function symmetric(flat: number[]) {
  const m = Math.max(...flat.map(Math.abs), 0.1);
  return { lo: -m, hi: m };
}
