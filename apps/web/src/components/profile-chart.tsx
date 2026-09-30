"use client";

/** Depth-profile probe: reconstructed profile with uncertainty band,
 * GLORYS stand-in (truth), climatology baseline, and nearby Argo overlay.
 * Depth axis is sqrt-scaled so the upper 200 m (where structure lives)
 * gets the visual room it deserves. */

import { useMemo } from "react";
import type { Profile } from "@/lib/api-client";
import { fmtNum } from "@/lib/format";

export function ProfileChart({
  profile,
  h = 300,
  showClim = true,
  showArgo = true,
}: {
  profile: Profile | null;
  h?: number;
  showClim?: boolean;
  showArgo?: boolean;
}) {
  const W = 320;
  const pad = { l: 40, r: 12, t: 14, b: 24 };

  const geom = useMemo(() => {
    if (!profile) return null;
    const depths = profile.depths;
    const maxZ = depths[depths.length - 1];
    const zToY = (z: number) => {
      const f = Math.sqrt(z / maxZ);
      return pad.t + f * (h - pad.t - pad.b);
    };
    const bandTemps = profile.spread.flatMap((s, i) => {
      const m = profile.mean[i];
      if (m === null || s === null) return [];
      return [m + s, m - s];
    });
    const temps = [...profile.mean, ...profile.truth, ...profile.clim, ...bandTemps, ...profile.argo.flatMap((a) => a.temp)].filter(
      (v): v is number => v !== null && !Number.isNaN(v),
    );
    const tMin = Math.floor(Math.min(...temps) - 0.6);
    const tMax = Math.ceil(Math.max(...temps) + 0.6);
    const tToX = (t: number) => pad.l + ((t - tMin) / (tMax - tMin || 1)) * (W - pad.l - pad.r);
    return { zToY, tToX, tMin, tMax, maxZ };
  }, [profile, h]);

  if (!profile || !geom) {
    return (
      <div
        style={{
          height: h,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--text-3)",
          fontSize: "var(--fs-sm)",
        }}
      >
        Click the map to probe a profile
      </div>
    );
  }

  const { zToY, tToX, tMin, tMax, maxZ } = geom;
  const pairs = profile.depths.map((z, i) => ({
    z,
    mean: profile.mean[i],
    spread: profile.spread[i],
    truth: profile.truth[i],
    clim: profile.clim[i],
  }));

  const line = (key: "mean" | "truth" | "clim") => {
    let d = "";
    let started = false;
    for (const p of pairs) {
      const v = p[key];
      if (v === null || Number.isNaN(v)) continue;
      const x = tToX(v);
      const y = zToY(p.z);
      d += started ? ` L ${x.toFixed(1)} ${y.toFixed(1)}` : ` M ${x.toFixed(1)} ${y.toFixed(1)}`;
      started = true;
    }
    return d;
  };

  // uncertainty band polygon
  const bandUp: string[] = [];
  const bandDn: string[] = [];
  for (const p of pairs) {
    if (p.mean === null || p.spread === null) continue;
    bandUp.push(`${tToX(p.mean + p.spread).toFixed(1)},${zToY(p.z).toFixed(1)}`);
    bandDn.unshift(`${tToX(p.mean - p.spread).toFixed(1)},${zToY(p.z).toFixed(1)}`);
  }
  const bandD = bandUp.length ? `M ${bandUp.join(" L ")} L ${bandDn.join(" L ")} Z` : "";

  const ticksZ = [0, 50, 100, 200, 500, 1000];
  const ticksT: number[] = [];
  const step = tMax - tMin > 12 ? 5 : tMax - tMin > 6 ? 2 : 1;
  for (let t = Math.ceil(tMin / step) * step; t <= tMax; t += step) ticksT.push(t);

  return (
    <div>
      <svg
        role="img"
        aria-label={`Temperature profile at ${profile.lat}°N ${profile.lon}°E on ${profile.date}`}
        width="100%"
        viewBox={`0 0 ${W} ${h}`}
        style={{ display: "block" }}
      >
        {/* grid */}
        {ticksT.map((t) => (
          <g key={t}>
            <line x1={tToX(t)} x2={tToX(t)} y1={pad.t} y2={h - pad.b} stroke="rgba(148,192,240,0.09)" />
            <text x={tToX(t)} y={h - pad.b + 13} fill="#5d7793" fontSize="9" textAnchor="middle" fontFamily="var(--font-mono)">
              {t}°
            </text>
          </g>
        ))}
        {ticksZ.map((z) => (
          <g key={z}>
            <line x1={pad.l} x2={W - pad.r} y1={zToY(z)} y2={zToY(z)} stroke="rgba(148,192,240,0.09)" />
            <text x={pad.l - 5} y={zToY(z) + 3} fill="#5d7793" fontSize="9" textAnchor="end" fontFamily="var(--font-mono)">
              {z}
            </text>
          </g>
        ))}
        <text x={pad.l - 30} y={pad.t + 4} fill="#6f8aa6" fontSize="9">
          m
        </text>

        {/* uncertainty band */}
        <path d={bandD} fill="rgba(69, 214, 255, 0.14)" stroke="none" />

        {/* climatology */}
        {showClim && <path d={line("clim")} fill="none" stroke="#6f8aa6" strokeWidth="1.2" strokeDasharray="3 3" />}

        {/* truth (GLORYS stand-in) */}
        <path d={line("truth")} fill="none" stroke="#4ade80" strokeWidth="1.6" />

        {/* reconstruction */}
        <path d={line("mean")} fill="none" stroke="#45d6ff" strokeWidth="2.2" />

        {/* argo points */}
        {showArgo &&
          profile.argo.map((a) =>
            a.temp.map((t, i) =>
              t === null || Number.isNaN(t) ? null : (
                <circle key={`${a.floatId}-${i}`} cx={tToX(t)} cy={zToY(profile.depths[i])} r="2.4" fill="none" stroke="#ffd166" strokeWidth="1.3" />
              ),
            ),
          )}
      </svg>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 6, fontSize: "var(--fs-xs)", color: "var(--text-2)" }}>
        <Legend color="#45d6ff" label="Reconstruction" />
        <Legend color="#4ade80" label="GLORYS" />
        {showClim && <Legend color="#6f8aa6" label="Climatology B0" dashed />}
        {showArgo && profile.argo.length > 0 && <Legend color="#ffd166" label="Argo (nearby)" hollow />}
      </div>

      <div style={{ display: "flex", gap: 14, marginTop: 8, fontSize: "var(--fs-xs)", color: "var(--text-2)" }}>
        <span>
          Profile RMSE 0–300 m:{" "}
          <b className="num" style={{ color: "var(--text-0)" }}>
            {fmtNum(profile.rmse03, 2)} °C
          </b>
        </span>
        <span>
          {profile.argo.length > 0
            ? `${profile.argo.length} Argo profile${profile.argo.length > 1 ? "s" : ""} within ~420 km`
            : "No Argo profiles within 420 km"}
        </span>
      </div>
      <div style={{ marginTop: 6, fontSize: "var(--fs-xs)", color: "var(--text-3)" }}>
        Depth axis is √-scaled to give the upper ocean more room; {maxZ} m max.
      </div>
    </div>
  );
}

function Legend({ color, label, dashed = false, hollow = false }: { color: string; label: string; dashed?: boolean; hollow?: boolean }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
      {hollow ? (
        <span style={{ width: 9, height: 9, borderRadius: "50%", border: `1.4px solid ${color}`, display: "inline-block" }} />
      ) : (
        <span
          style={{
            width: 14,
            height: 0,
            borderTop: `${dashed ? "2px dashed" : "2.4px solid"} ${color}`,
            display: "inline-block",
          }}
        />
      )}
      {label}
    </span>
  );
}
