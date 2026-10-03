"use client";

import { useEffect, useMemo, useState } from "react";
import OceanMap from "@/components/map/OceanMap";
import { ChipRow, Colorbar } from "@/components/controls/Controls";
import { DataState, useMeta } from "@/components/feedback/DataState";
import { api, type Cyclones, type HeatField } from "@/lib/api-client";
import { fieldToDataURL, stretch, rampFor } from "@/lib/colormaps";
import { fmtDate, fmtKm } from "@/lib/format";

/* Cyclone case study: IBTrACS best track over the reconstructed pre-storm
   ocean — OHC (0–300 m heat) or the 26 °C isotherm. Diagnostic only. */

const METRICS = [
  { value: "ohc", label: "OHC 0–300 m" },
  { value: "d26", label: "26 °C isotherm" },
];

export default function CyclonePage() {
  const { meta, error } = useMeta();
  const dates = meta?.dates ?? [];
  const [storms, setStorms] = useState<Cyclones | null>(null);
  const [stormErr, setStormErr] = useState<string | null>(null);
  const [sid, setSid] = useState<string>("");
  const [metric, setMetric] = useState<"ohc" | "d26">("ohc");
  const [date, setDate] = useState("");
  const [heat, setHeat] = useState<HeatField | null>(null);
  const [heatErr, setHeatErr] = useState<string | null>(null);

  useEffect(() => {
    api.cyclones().then((c) => {
      setStorms(c);
      if (c.storms[0]) setSid(c.storms[0].sid);
    }).catch((e) => setStormErr(String(e?.message ?? e)));
  }, []);

  const storm = storms?.storms.find((s) => s.sid === sid) ?? null;

  /* candidate dates: every reconstructed day within [-6, 0] days of each
     track fix — pre-storm ocean state */
  const stormDates = useMemo(() => {
    if (!storm || !dates.length) return [];
    const set = new Set<string>();
    const first = new Date(storm.track[0].iso_time + "Z").getTime();
    for (const d of dates) {
      const t = new Date(d + "T00:00:00Z").getTime();
      if (t >= first - 6 * 864e5 && t <= first) set.add(d);
    }
    return [...set].sort();
  }, [storm, dates]);

  useEffect(() => {
    if (stormDates.length && !stormDates.includes(date)) setDate(stormDates[stormDates.length - 1]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sid, stormDates.length]);

  useEffect(() => {
    if (!date) return;
    let on = true;
    setHeatErr(null);
    api.heat(date, metric)
      .then((h) => on && setHeat(h))
      .catch((e) => on && setHeatErr(String(e?.message ?? e)));
    return () => { on = false; };
  }, [date, metric]);

  const trackPts = useMemo(() => {
    if (!storm) return [];
    const target = date ? new Date(date + "T00:00:00Z").getTime() : new Date(storm.track[0].iso_time + "Z").getTime();
    return storm.track.filter((p) => new Date(p.iso_time + "Z").getTime() <= target + 2 * 864e5);
  }, [storm, date]);

  const heatUrl = useMemo(() => {
    if (!heat) return null;
    const flat = heat.values.flat().filter((v): v is number => v !== null);
    const { lo, hi } = stretch(flat);
    return fieldToDataURL([...heat.values].reverse(), { ramp: rampFor(metric), lo, hi });
  }, [heat, metric]);

  const heatRange = useMemo(() => {
    if (!heat) return null;
    return stretch(heat.values.flat().filter((v): v is number => v !== null));
  }, [heat]);

  if (error) return <DataState error={error} />;

  return (
    <div className="container" style={{ padding: "var(--s5) var(--s5) var(--s6)" }}>
      <p className="eyebrow">Cyclone case study · test years</p>
      <h1 className="h2" style={{ margin: "6px 0 var(--s4)" }}>The ocean before the storm.</h1>
      <p className="lede" style={{ marginBottom: "var(--s4)" }}>
        Cyclone intensification depends on the heat the sea holds beneath the surface. These are the
        official IBTrACS best tracks laid over our reconstructed ocean state in the days before each
        system reached peak intensity.
      </p>

      <div className="panel panel-pad col" style={{ gap: 12, marginBottom: "var(--s4)" }}>
        {stormErr ? (
          <div className="note bad" role="alert">Cyclone tracks unavailable: {stormErr}</div>
        ) : !storms ? (
          <div className="skeleton" style={{ height: 20 }} />
        ) : (
          <>
            <ChipRow
              label="Storm"
              options={storms.storms.map((s) => ({ value: s.sid, label: `${s.name} (${s.season})` }))}
              value={sid}
              onChange={setSid}
            />
            <ChipRow label="Field" options={METRICS} value={metric} onChange={(v) => setMetric(v as "ohc" | "d26")} />
            {stormDates.length > 0 && (
              <ChipRow
                label="Date"
                options={stormDates.map((d) => ({ value: d, label: fmtDate(d) }))}
                value={date}
                onChange={setDate}
              />
            )}
            {heatRange && <Colorbar field={metric} lo={heatRange.lo} hi={heatRange.hi} units={metric === "ohc" ? "GJ m⁻²" : "m"} />}
          </>
        )}
        {heatErr && <div className="note bad" role="alert">{heatErr}</div>}
      </div>

      <div className="panel" style={{ overflow: "hidden" }}>
        <div style={{ position: "relative", height: 480 }}>
          <OceanMap
            field={heatUrl}
            lon0={meta?.lon[0] ?? 45} lat0={meta?.lat[0] ?? 5}
            lon1={meta?.lon[meta.lon.length - 1] ?? 105} lat1={meta?.lat[meta.lat.length - 1] ?? 30}
            track={trackPts}
            interactive={false}
          />
          {!heatUrl && <div className="skeleton" style={{ position: "absolute", inset: 12 }} />}
        </div>
      </div>

      {storm && (
        <div className="row wrap" style={{ gap: "var(--s4)", marginTop: "var(--s4)", alignItems: "stretch" }}>
          <div className="panel panel-pad" style={{ flex: "1 1 280px" }}>
            <p className="eyebrow muted">Track facts · IBTrACS</p>
            <p className="small" style={{ marginTop: 8 }}>
              {storm.n_points} six-hourly fixes from {fmtDate(storm.track[0].iso_time.slice(0, 10))} to{" "}
              {fmtDate(storm.track[storm.n_points - 1].iso_time.slice(0, 10))}, basin {storm.basin}.{" "}
              {storm.track[storm.n_points - 1].dist2land_km != null &&
                `Final fix ${fmtKm(storm.track[storm.n_points - 1].dist2land_km)} from land.`}
            </p>
            <p className="tiny" style={{ marginTop: 8 }}>
              Source: <a href={storms?.source_url ?? "#"} target="_blank" rel="noreferrer">{storms?.source}</a>{" "}
              · retrieved {storms?.retrieved_utc?.slice(0, 10)} · NOAA public domain.
            </p>
          </div>
          <div className="panel panel-pad" style={{ flex: "1 1 280px" }}>
            <p className="eyebrow muted">Reading the map</p>
            <p className="small" style={{ marginTop: 8 }}>
              {metric === "ohc"
                ? "Ocean heat content in the top 300 m (GJ m⁻²): the fuel a cyclone can draw on. High-OHC water ahead of the track usually means more potential for intensification."
                : "Depth of the 26 °C isotherm: the deeper the warm layer, the more resistant the ocean is to storm-induced cooling."}
            </p>
            <p className="tiny" style={{ marginTop: 8 }}>
              Computed from the reconstructed field with rho=1025, cp=3985, trapezoidal over the 15
              levels; the vertical sampling is coarse, so isotherm depths carry a sampling error.
            </p>
          </div>
        </div>
      )}

      <div className="note" style={{ marginTop: "var(--s4)" }}>
        This is a <b>diagnostic</b>, not a forecast: we show the reconstructed state before past
        storms. Claiming predictive skill would require a forecasting experiment we have not run.
      </div>
    </div>
  );
}
