"use client";

import { useState } from "react";
import type { Section } from "@/lib/api-client";
import { rampFor, sampleRamp } from "@/lib/colormaps";

/* Vertical section along a path: distance x depth heat tiles, pure SVG. */

const W = 900, H = 380;
const M = { top: 16, right: 18, bottom: 42, left: 56 };

export default function SectionChart({ section }: { section: Section | null }) {
  const [hover, setHover] = useState<{ i: number; j: number } | null>(null);
  if (!section) return null;
  const iw = W - M.left - M.right, ih = H - M.top - M.bottom;
  const depths = section.depths_m;
  const maxD = depths[depths.length - 1];
  const nP = section.distance_km.length;
  const vals = section.values.flat().filter((v): v is number => v !== null);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const span = hi - lo || 1;
  const cw = iw / nP;
  const y = (d: number) => M.top + (d / maxD) * ih;
  const ramp = rampFor("model");

  const rowH = depths.map((d, i) => {
    const top = i === 0 ? 0 : (depths[i - 1] + d) / 2;
    const bot = i === depths.length - 1 ? maxD : (d + depths[i + 1]) / 2;
    return { top, bot };
  });

  const hov = hover && (
    <div className="chart-tip" style={{ left: Math.min(W - 150, M.left + (hover.j + 0.5) * cw), top: y(depths[hover.i]) - 6 }}>
      <b className="num">{depths[hover.i]} m</b> @ {Math.round(section.distance_km[hover.j])} km<br />
      {section.lat[hover.j].toFixed(1)}°N {section.lon[hover.j].toFixed(1)}°E ·{" "}
      {section.values[hover.i][hover.j]?.toFixed(2) ?? "—"} °C
    </div>
  );

  return (
    <figure style={{ margin: 0, position: "relative" }}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Temperature section on ${section.date}`} onMouseLeave={() => setHover(null)}>
        <rect x={M.left} y={M.top} width={iw} height={ih} fill="rgba(8,24,40,0.5)" rx={6} />
        {(() => {
          // label only depths far enough apart in pixels to stay readable
          let lastY = -99;
          return depths.map((d, i) => {
            const py = y(d);
            if (py - lastY < 15) return null;
            lastY = py;
            return (
              <g key={d}>
                <line x1={M.left} x2={W - M.right} y1={py} y2={py} stroke="rgba(148,197,255,0.10)" strokeDasharray="3 4" />
                <text x={M.left - 6} y={py + 3.5} textAnchor="end" fontSize="10" fill="var(--text-3)" className="num">{d}</text>
              </g>
            );
          });
        })()}
        {depths.map((d, i) =>
          section.values[i].map((v, j) => {
            if (v === null || !isFinite(v)) return null;
            const [r, g, b] = sampleRamp(ramp, (v - lo) / span);
            return (
              <rect key={`${i}-${j}`} x={M.left + j * cw} y={M.top + (rowH[i].top / maxD) * ih}
                width={cw + 0.6} height={((rowH[i].bot - rowH[i].top) / maxD) * ih + 0.6}
                fill={`rgb(${r},${g},${b})`}
                onMouseEnter={() => setHover({ i, j })} />
            );
          }),
        )}
        <text x={14} y={H / 2} fontSize="11" fill="var(--text-3)" transform={`rotate(-90 14 ${H / 2})`} textAnchor="middle">depth (m)</text>
        <text x={M.left + iw / 2} y={H - 8} fontSize="11" fill="var(--text-3)" textAnchor="middle">distance along path (km)</text>
        <text x={M.left} y={M.top - 4} fontSize="10.5" fill="var(--text-3)" className="num">
          {section.lat[0].toFixed(1)}°N {section.lon[0].toFixed(1)}°E
        </text>
        <text x={M.left + iw} y={M.top - 4} fontSize="10.5" fill="var(--text-3)" textAnchor="end" className="num">
          {section.lat[nP - 1].toFixed(1)}°N {section.lon[nP - 1].toFixed(1)}°E
        </text>
        {hov}
      </svg>
      <figcaption className="tiny" style={{ padding: "6px 4px 0" }}>
        {nP} sample points · colours stretched over {lo.toFixed(1)}–{hi.toFixed(1)} °C · nulls (land/nodata) left dark
      </figcaption>
    </figure>
  );
}
