"use client";

import { useEffect, useMemo, useState } from "react";
import OceanMap from "@/components/map/OceanMap";
import { ChipRow, Colorbar } from "@/components/controls/Controls";
import { DataState, useMeta } from "@/components/feedback/DataState";
import { api, type Cyclones, type HeatField } from "@/lib/api-client";
import { fieldToDataURL, stretch, rampFor } from "@/lib/colormaps";
import { landRings, oceanClipPath, type Ring } from "@/lib/coastline";
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
  const [landRingsCache, setLandRingsCache] = useState<Ring[] | null>(null);

  useEffect(() => {
    landRings().then(setLandRingsCache).catch(() => {});
  }, []);

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
    const rings = landRingsCache ?? null;
    return fieldToDataURL([...heat.values].reverse(), {
      ramp: rampFor(metric), lo, hi, smooth: 4,
      landClip: rings
        ? {
            path: oceanClipPath(rings, {
              lon0: meta?.lon[0] ?? 45, lat0: meta?.lat[0] ?? 5,
              lon1: meta?.lon[meta.lon.length - 1] ?? 105, lat1: meta?.lat[meta.lat.length - 1] ?? 30,
            }, 964, 404),
          }
        : null,
    });
  }, [heat, metric, meta, landRingsCache]);

  const heatRange = useMemo(() => {
    if (!heat) return null;
    return stretch(heat.values.flat().filter((v): v is number => v !== null));
  }, [heat]);

  /* story markers: peak-intensity fix + the first landfall fix (real IBTrACS columns) */
  const markers = useMemo(() => {
    if (!storm) return [];
    const out: { lat: number; lon: number; kind: "peak" | "landfall" }[] = [];
    const withWind = storm.track.filter((t) => t.wind_kt != null);
    const peak = withWind.length
      ? withWind.reduce((a, b) => ((b.wind_kt ?? 0) > (a.wind_kt ?? 0) ? b : a))
      : null;
    if (peak) out.push({ lat: peak.lat, lon: peak.lon, kind: "peak" });
    const firstLandfall = storm.track.find(
      (t) => t.dist2land_km != null && t.dist2land_km < 30,
    );
    if (firstLandfall) out.push({ lat: firstLandfall.lat, lon: firstLandfall.lon, kind: "landfall" });
    return out;
  }, [storm]);

  /* dynamic reading: what the user is looking at, in one sentence */
  const reading = useMemo(() => {
    if (!storm || !heat || !date) return null;
    const target = new Date(date + "T00:00:00Z").getTime();
    const fix = storm.track.reduce((a, b) =>
      Math.abs(new Date(b.iso_time + "Z").getTime() - target) <
      Math.abs(new Date(a.iso_time + "Z").getTime() - target) ? b : a);
    const dtDays = Math.round(Math.abs(new Date(fix.iso_time + "Z").getTime() - target) / 864e5);
    // sample the reconstructed field at the storm position (nearest cell)
    const rows = heat.values.length, cols = rows ? heat.values[0].length : 0;
    const r = Math.min(rows - 1, Math.max(0, Math.round(((fix.lat - (meta?.lat[0] ?? 5)) / 25) * (rows - 1))));
    const c = Math.min(cols - 1, Math.max(0, Math.round(((fix.lon - (meta?.lon[0] ?? 45)) / 60) * (cols - 1))));
    const atStorm = heat.values[r]?.[c] ?? null;
    const flat = heat.values.flat().filter((v): v is number => v !== null);
    const domainMean = flat.reduce((a, b) => a + b, 0) / (flat.length || 1);
    const phase = (kt: number) =>
      kt < 17 ? "a low-pressure area" : kt < 28 ? "a depression" : kt < 34 ? "a deep depression"
      : kt < 48 ? "a cyclonic storm" : kt < 64 ? "a severe cyclonic storm" : "a very severe cyclonic storm";
    return { fix, dtDays, atStorm, domainMean, phase };
  }, [storm, heat, date, meta]);

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
            trackMarkers={markers}
            interactive={false}
          />
          {!heatUrl && <div className="skeleton" style={{ position: "absolute", inset: 12 }} />}
        </div>
        {/* track legend: how to read the red line */}
        <div className="panel-pad row wrap tiny" style={{ gap: 16, borderTop: "1px solid var(--hairline)" }}>
          <b style={{ fontSize: 12, color: "var(--text-2)" }}>Reading the track:</b>
          <span className="row" style={{ gap: 6 }}><span style={{ width: 9, height: 9, borderRadius: 9, background: "#93a9be" }} />≤33 kt · depression</span>
          <span className="row" style={{ gap: 6 }}><span style={{ width: 12, height: 12, borderRadius: 12, background: "#e9b45c" }} />34–63 kt · cyclonic storm</span>
          <span className="row" style={{ gap: 6 }}><span style={{ width: 16, height: 16, borderRadius: 16, background: "#f0705a" }} />≥64 kt · very severe</span>
          <span className="row" style={{ gap: 6 }}><span style={{ width: 12, height: 12, borderRadius: 12, border: "2.5px solid #fff", background: "rgba(240,112,90,0.25)" }} />peak intensity</span>
          <span className="row" style={{ gap: 6 }}><span style={{ width: 11, height: 11, borderRadius: 11, background: "#fff", border: "2px solid #f0705a" }} />landfall</span>
        </div>
      </div>

      {/* dynamic reading of the current snapshot */}
      {reading && heat && (
        <div className="note info" style={{ marginTop: "var(--s4)" }}>
          <b>What you are looking at.</b>{" "}
          {reading.dtDays > 0
            ? <>The nearest IBTrACS fix to this date is {reading.dtDays} day{reading.dtDays > 1 ? "s" : ""} away. </>
            : null}
          On {fmtDate(reading.fix.iso_time.slice(0, 10))}, IBTrACS places {storm?.name} near{" "}
          <b className="num">{reading.fix.lat.toFixed(1)}°N {reading.fix.lon.toFixed(1)}°E</b> as{" "}
          <b>{reading.phase(reading.fix.wind_kt ?? 0)}</b>
          {reading.fix.wind_kt != null && <> ({reading.fix.wind_kt} kt{reading.fix.pres_hpa != null ? `, ${Math.round(reading.fix.pres_hpa)} hPa` : ""})</>}
          .{" "}
          {reading.atStorm !== null ? (
            metric === "ohc" ? (
              <>Beneath that exact position the reconstructed ocean holds{" "}
              <b className="num">{reading.atStorm.toFixed(1)} GJ m⁻²</b> of heat in the top 300 m —{" "}
              {reading.atStorm >= reading.domainMean ? "above" : "below"} the domain mean of{" "}
              <b className="num">{reading.domainMean.toFixed(1)} GJ m⁻²</b>.{" "}
              {reading.atStorm >= reading.domainMean
                ? "Deep warm water along the track is the fuel available for intensification."
                : "Cooler-than-average water here limits the energy the storm can draw from the sea."}</>
            ) : (
              <>The 26 °C isotherm beneath the storm sits at{" "}
              <b className="num">{reading.atStorm.toFixed(0)} m</b> (domain mean{" "}
              <b className="num">{reading.domainMean.toFixed(0)} m</b>) — the deeper the warm layer,
              the more resistant the ocean is to storm-induced cooling.</>
            )
          ) : (
            "No reconstructed value at the storm position for this field."
          )}
        </div>
      )}

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
