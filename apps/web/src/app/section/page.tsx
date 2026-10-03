"use client";

import { useEffect, useState } from "react";
import SectionChart from "@/components/section/SectionChart";
import { ChipRow, Colorbar } from "@/components/controls/Controls";
import { DataState, useMeta } from "@/components/feedback/DataState";
import { api, type Section } from "@/lib/api-client";
import { rampFor, stretch, rampCss } from "@/lib/colormaps";
import { fmtDate } from "@/lib/format";

/* Vertical section along a path. Preset transects cover the scientifically
   interesting lines (basin cross-sections, cyclone approach paths); the
   custom box accepts any "lat,lon;lat,lon" polyline inside the domain. */

const PRESETS: { label: string; path: string; note: string }[] = [
  { label: "BoB east–west", path: "7,85;15,88;21,92", note: "across the Bay of Bengal, Sri Lanka to Myanmar" },
  { label: "East India coast", path: "8.9,78.2;13,80.3;16.5,82.3;20,86", note: "Chennai up to Odisha" },
  { label: "Arabian Sea N–S", path: "24,58;18,65;12,72;8,76", note: "Oman down to Kerala" },
  { label: "Along 88°E", path: "6,88;15,88;24,88", note: "equator to the Ganges delta" },
  { label: "Fengal approach", path: "7,84;10.5,80.4;13.5,80.2", note: "the track that fed cyclone Fengal" },
];

export default function SectionPage() {
  const { meta, error } = useMeta();
  const dates = meta?.dates ?? [];
  const [date, setDate] = useState("2024-04-15");
  const [path, setPath] = useState(PRESETS[0].path);
  const [section, setSection] = useState<Section | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [custom, setCustom] = useState("");

  useEffect(() => {
    const d = dates.includes(date) ? date : dates[Math.floor(dates.length * 0.28)] ?? "";
    if (d && d !== date) setDate(d);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dates.length]);

  useEffect(() => {
    if (!date) return;
    let on = true;
    setBusy(true);
    setErr(null);
    api.section(date, path, 140)
      .then((s) => on && setSection(s))
      .catch((e) => on && setErr(String(e?.message ?? e)))
      .finally(() => on && setBusy(false));
    return () => { on = false; };
  }, [date, path]);

  const lo = section ? stretch(section.values.flat().filter((v): v is number => v !== null)) : null;

  return (
    <div className="container" style={{ padding: "var(--s5) var(--s5) var(--s6)" }}>
      <p className="eyebrow">Vertical section</p>
      <h1 className="h2" style={{ margin: "6px 0 var(--s4)" }}>Slice through the water column.</h1>

      <div className="panel panel-pad col" style={{ gap: 12, marginBottom: "var(--s4)" }}>
        <ChipRow
          label="Date"
          options={sampledDates(dates).map((d) => ({ value: d, label: fmtDate(d) }))}
          value={date}
          onChange={setDate}
        />
        <ChipRow
          label="Transect"
          options={PRESETS.map((p) => ({ value: p.path, label: p.label }))}
          value={path}
          onChange={setPath}
        />
        <p className="tiny" style={{ margin: 0 }}>
          {PRESETS.find((p) => p.path === path)?.note ?? "custom transect"} ·{" "}
          {busy ? "sampling…" : section ? `${section.distance_km.length} sample points, nearest grid cell` : ""}
        </p>
        <div className="row" style={{ gap: 8 }}>
          <input
            type="text"
            placeholder="custom: lat,lon;lat,lon;…"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            style={{ flex: 1, minWidth: 220 }}
            aria-label="Custom path"
          />
          <button type="button" className="btn small" onClick={() => custom.includes(";") && setPath(custom)}>
            Draw
          </button>
        </div>
        {err && <div className="note bad" role="alert">{err}</div>}
      </div>

      <div className="panel panel-pad">
        {section && lo && (
          <>
            <div style={{ marginBottom: 10 }}>
              <Colorbar field="model" lo={lo.lo} hi={lo.hi} units="°C" />
            </div>
            <SectionChart section={section} />
          </>
        )}
        {!section && !err && <div className="skeleton" style={{ height: 380 }} aria-label="Loading section" />}
      </div>
      <p className="tiny" style={{ marginTop: "var(--s3)", maxWidth: "80ch" }}>
        Sections use the reconstructed field only (no GLORYS here). Depths are the 15 standard
        levels — the vertical sampling is coarse below 300 m, so isotherm structure there is
        interpolation, not observation.
      </p>
      <div style={{ height: 0, overflow: "hidden" }}>{rampCss(rampFor("model"))}</div>
    </div>
  );
}

/* offer ~14 evenly spaced dates instead of all 366 chips */
function sampledDates(dates: string[]): string[] {
  if (dates.length <= 14) return dates;
  const out: string[] = [];
  for (let i = 0; i < dates.length; i += Math.ceil(dates.length / 13)) out.push(dates[i]);
  return out.filter((d, i, a) => i === a.length - 1 || d !== a[i + 1]);
}
