"use client";
import { useEffect, useState } from "react";
import { api, type Gaps, type Meta, type Osse } from "@/lib/api-client";
import { OsseChart } from "@/components/advisor/OsseChart";

export default function Advisor() {
  const [meta, setMeta] = useState<Meta>();
  const [date, setDate] = useState<string>();
  const [k, setK] = useState(10);
  const [gaps, setGaps] = useState<Gaps>();
  const [osse, setOsse] = useState<Osse>();
  const [gapErr, setGapErr] = useState<string>();
  const [osseErr, setOsseErr] = useState<string>();

  useEffect(() => {
    api.meta().then((m) => { setMeta(m); setDate(m.data_through ?? m.dates[0]); })
      .catch((e) => setGapErr(e.message));
    api.osse().then(setOsse).catch((e) => setOsseErr(e.message));
  }, []);

  useEffect(() => {
    if (!date) return;
    setGapErr(undefined);
    api.gaps(date, k).then(setGaps).catch((e) => { setGaps(undefined); setGapErr(e.message); });
  }, [date, k]);

  return (
    <main style={{ padding: 16 }}>
      <h1>Argo Advisor</h1>
      <p role="note">
        Sites are ranked by model uncertainty and distance to the nearest recent Argo profile. This
        is a heuristic, and it is only as reliable as the uncertainty is calibrated.
      </p>
      {meta && date && (
        <form aria-label="Advisor controls" style={{ display: "flex", gap: 16 }}>
          <label>Date
            <select value={date} onChange={(e) => setDate(e.target.value)}>
              {meta.dates.map((d) => <option key={d}>{d}</option>)}
            </select>
          </label>
          <label>Top K
            <input type="number" min={1} max={50} value={k}
              onChange={(e) => setK(Math.min(50, Math.max(1, Number(e.target.value) || 1)))} />
          </label>
        </form>
      )}
      {gapErr && <p role="alert">Gap map unavailable: {gapErr}.</p>}
      {gaps && (
        <table aria-label="Recommended float sites">
          <caption>{gaps.method_note ?? "Recommended sites"}</caption>
          <thead><tr><th>#</th><th>Lat</th><th>Lon</th><th>Score</th><th>Uncertainty</th><th>Nearest Argo (km)</th></tr></thead>
          <tbody>
            {gaps.sites.map((s) => (
              <tr key={s.rank}>
                <td>{s.rank}</td><td>{s.lat.toFixed(2)}</td><td>{s.lon.toFixed(2)}</td>
                <td>{s.score.toFixed(3)}</td>
                <td>{s.uncertainty?.toFixed(3) ?? "–"}</td>
                <td>{s.dist_to_argo_km?.toFixed(0) ?? "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <h2>Does placement help? (mini-OSSE)</h2>
      {osseErr && <p role="alert">OSSE result unavailable: {osseErr}.</p>}
      {osse && (
        <>
          <OsseChart osse={osse} />
          <p role="note">
            {osse.limitation_note ??
              "Truth and training target are both GLORYS, so this measures design value under the reanalysis's own physics. It is evidence, not proof of real-world gain."}
          </p>
        </>
      )}
    </main>
  );
}
