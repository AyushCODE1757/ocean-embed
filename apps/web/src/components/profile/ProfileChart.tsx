"use client";

import { useState } from "react";
import type { Profile } from "@/lib/api-client";
import { fmtDate, fmtTemp } from "@/lib/format";

/* Reconstructed vertical profile: model vs GLORYS vs climatology,
   with real Argo observations scattered on top. Depth grows downward.
   Pure SVG, no chart library. */

const W = 460, H = 380;
const M = { top: 14, right: 16, bottom: 34, left: 52 };

export default function ProfileChart({ profile }: { profile: Profile | null }) {
  const [hover, setHover] = useState<number | null>(null);
  if (!profile) {
    return (
      <div className="state-box" style={{ minHeight: 380 }}>
        <span className="h3">No point selected</span>
        <span>Click anywhere on the map to reconstruct the water column at that spot.</span>
      </div>
    );
  }
  const iw = W - M.left - M.right, ih = H - M.top - M.bottom;
  const depths = profile.depths_m;
  const temps: number[] = [
    ...profile.mean, ...profile.truth, ...profile.clim,
    ...profile.argo.map((a) => a.temp_c),
  ].filter((v): v is number => v !== null);
  const lo = Math.min(...temps) - 0.6;
  const hi = Math.max(...temps) + 0.6;
  const x = (t: number) => M.left + ((t - lo) / (hi - lo)) * iw;
  const y = (d: number) => M.top + (d / depths[depths.length - 1]) * ih;

  const line = (arr: (number | null)[], broken = false) => {
    let dstr = "", pen = false;
    arr.forEach((v, i) => {
      if (v === null || !isFinite(v)) { pen = false; return; }
      dstr += `${pen && !broken ? "L" : "M"}${x(v).toFixed(1)},${y(depths[i]).toFixed(1)} `;
      pen = true;
    });
    return dstr;
  };

  const tip = hover !== null && (
    <div className="chart-tip" style={{ left: M.left + 8, top: M.top + y(depths[hover]) - 40 }}>
      <b className="num">{depths[hover]} m</b><br />
      Model {fmtTemp(profile.mean[hover])}<br />
      GLORYS {fmtTemp(profile.truth[hover])}
    </div>
  );

  return (
    <figure style={{ margin: 0, position: "relative" }}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Reconstructed temperature profile at ${profile.lat}°N ${profile.lon}°E on ${profile.date}`} onMouseLeave={() => setHover(null)}>
        <rect x={M.left} y={M.top} width={iw} height={ih} fill="rgba(8,24,40,0.5)" rx={6} />
        {/* depth grid */}
        {depths.map((d) => (
          <g key={d}>
            <line x1={M.left} x2={W - M.right} y1={y(d)} y2={y(d)} stroke="rgba(148,197,255,0.08)" />
            <text x={M.left - 6} y={y(d) + 3.5} textAnchor="end" fontSize="10" fill="var(--text-3)" className="num">{d}</text>
          </g>
        ))}
        <text x={14} y={H / 2} fontSize="11" fill="var(--text-3)" transform={`rotate(-90 14 ${H / 2})`} textAnchor="middle">depth (m)</text>
        {/* temperature axis */}
        {(() => {
          const ticks: number[] = [];
          const spanT = hi - lo;
          const stepT = spanT > 12 ? 4 : spanT > 6 ? 2 : 1;
          for (let t = Math.ceil(lo); t <= hi; t += stepT) ticks.push(t);
          return ticks.map((t) => (
            <g key={t}>
              <line x1={x(t)} x2={x(t)} y1={M.top} y2={H - M.bottom} stroke="rgba(148,197,255,0.06)" />
              <text x={x(t)} y={H - M.bottom + 14} textAnchor="middle" fontSize="10" fill="var(--text-3)" className="num">{t}°</text>
            </g>
          ));
        })()}
        <text x={M.left + iw / 2} y={H - 2} fontSize="10.5" fill="var(--text-3)" textAnchor="middle">temperature (°C)</text>
        {/* argo scatter */}
        {profile.argo.map((o, i) => (
          <circle key={i} cx={x(o.temp_c)} cy={y(Math.min(o.depth_m, depths[depths.length - 1]))} r={3}
            fill={o.data_mode === "D" ? "var(--amber)" : "rgba(148,197,255,0.65)"}
            stroke="rgba(5,14,24,0.8)" strokeWidth={0.8}>
            <title>{`Argo ${o.platform} · ${o.data_mode === "D" ? "delayed" : "real-time"} · ${o.depth_m.toFixed(0)} m · ${o.temp_c.toFixed(2)}°C · ${o.time}`}</title>
          </circle>
        ))}
        {/* lines */}
        <path d={line(profile.clim)} fill="none" stroke="rgba(148,197,255,0.45)" strokeWidth={1.4} strokeDasharray="4 3" />
        <path d={line(profile.truth)} fill="none" stroke="#c9dced" strokeWidth={1.8} />
        <path d={line(profile.mean)} fill="none" stroke="var(--cyan)" strokeWidth={2.4} />
        {/* hover targets */}
        {depths.map((d, i) => (
          <rect key={d} x={M.left} y={y(d) - 9} width={iw} height={18} fill="transparent"
            onMouseEnter={() => setHover(i)} />
        ))}
        {tip}
      </svg>
      <figcaption className="row wrap tiny" style={{ gap: 14, padding: "8px 4px 0" }}>
        <span className="row" style={{ gap: 6 }}><span style={{ width: 16, height: 3, background: "var(--cyan)", borderRadius: 2 }} />OceanEmbed</span>
        <span className="row" style={{ gap: 6 }}><span style={{ width: 16, height: 2, background: "#c9dced", borderRadius: 2 }} />GLORYS (target)</span>
        <span className="row" style={{ gap: 6 }}><span style={{ width: 16, height: 2, borderTop: "2px dashed rgba(148,197,255,0.6)" }} />Climatology</span>
        <span className="row" style={{ gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: 8, background: "var(--amber)" }} />Argo (delayed)</span>
        <span style={{ marginLeft: "auto" }}>{fmtDate(profile.date)} · {profile.lat.toFixed(2)}°N {profile.lon.toFixed(2)}°E</span>
      </figcaption>
    </figure>
  );
}
