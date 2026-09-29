"use client";
import { useEffect, useState } from "react";
import { api, type Meta, type Profile, type Slice } from "@/lib/api-client";
import { StatusBar } from "@/components/status/StatusBar";
import { ProfilePanel } from "@/components/profile/ProfilePanel";

export default function Explorer() {
  const [meta, setMeta] = useState<Meta>();
  const [slice, setSlice] = useState<Slice>();
  const [profile, setProfile] = useState<Profile>();
  const [date, setDate] = useState<string>();
  const [depth, setDepth] = useState(0);
  const [error, setError] = useState<string>();

  useEffect(() => {
    api.meta().then((m) => { setMeta(m); setDate(m.data_through ?? m.dates[0]); })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!date) return;
    api.slice(date, depth).then(setSlice).catch((e) => setError(e.message));
  }, [date, depth]);

  const pick = (i: number, j: number) => {
    if (!slice || !date) return;
    api.profile(date, slice.lat[i], slice.lon[j]).then(setProfile).catch((e) => setError(e.message));
  };

  const flat = slice?.values.flat().filter((v): v is number => v !== null) ?? [];
  const lo = Math.min(...flat), hi = Math.max(...flat);
  const colour = (v: number | null) =>
    v === null ? "#ddd" : `hsl(${240 - 240 * ((v - lo) / (hi - lo || 1))} 80% 50%)`;

  return (
    <main style={{ padding: 16 }}>
      <StatusBar meta={meta} error={error} />
      {meta && date && (
        <form aria-label="Controls" style={{ display: "flex", gap: 16, margin: "12px 0" }}>
          <label>Date
            <select value={date} onChange={(e) => setDate(e.target.value)}>
              {meta.dates.map((d) => <option key={d}>{d}</option>)}
            </select>
          </label>
          <label>Depth (m)
            <select value={depth} onChange={(e) => setDepth(Number(e.target.value))}>
              {meta.depths_m.map((d) => <option key={d}>{d}</option>)}
            </select>
          </label>
        </form>
      )}
      {slice && (
        <svg role="img" aria-label={`Temperature at ${slice.depth_m} m on ${slice.date}`}
          viewBox={`0 0 ${slice.lon.length} ${slice.lat.length}`} style={{ width: "100%", maxWidth: 960 }}>
          {slice.values.map((row, i) => row.map((v, j) => (
            <rect key={`${i}-${j}`} x={j} y={slice.lat.length - 1 - i} width={1} height={1}
              fill={colour(v)} onClick={() => pick(i, j)} />
          )))}
        </svg>
      )}
      <ProfilePanel profile={profile} />
    </main>
  );
}
