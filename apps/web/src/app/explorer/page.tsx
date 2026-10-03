"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import OceanMap from "@/components/map/OceanMap";
import ProfileChart from "@/components/profile/ProfileChart";
import { ChipRow, Colorbar, DateSlider } from "@/components/controls/Controls";
import { DataState, useMeta } from "@/components/feedback/DataState";
import { api, cachedSlice, prefetchSlices, type Profile, type SliceField } from "@/lib/api-client";
import { fieldToDataURL, stretch, rampFor } from "@/lib/colormaps";
import { fmtDate } from "@/lib/format";
import { parseShareState, toShareState } from "@/lib/url-state";

/* Map explorer: date/depth/field chips over a live raster, click for the
   reconstructed profile with Argo overlay. State lives in the URL so views
   are shareable and the back button works. */

const FIELDS: { value: SliceField; label: string }[] = [
  { value: "model", label: "OceanEmbed" },
  { value: "truth", label: "GLORYS" },
  { value: "clim", label: "Climatology" },
  { value: "error", label: "Error" },
];

export default function Explorer() {
  const { meta, error } = useMeta();
  const params = useMemo(() => parseShareState(typeof window !== "undefined" ? window.location.search : ""), []);
  const [dateIdx, setDateIdx] = useState(() => {
    const i = meta?.dates.indexOf(params.date ?? "");
    return i && i > 0 ? i : 0;
  });
  const [depth, setDepth] = useState(params.depth ?? 0);
  const [field, setField] = useState<SliceField>((params.field as SliceField) ?? "model");
  const [point, setPoint] = useState(params.lat != null && params.lon != null ? { lat: params.lat, lon: params.lon } : null);
  const [playing, setPlaying] = useState(false);
  const [fieldUrl, setFieldUrl] = useState<string | null>(null);
  const [range, setRange] = useState<{ lo: number; hi: number } | null>(null);
  const [sliceErr, setSliceErr] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileErr, setProfileErr] = useState<string | null>(null);
  const [projection, setProjection] = useState<"globe" | "mercator">("globe");
  const [cursor, setCursor] = useState<{ lat: number; lon: number; temp: number | null } | null>(null);
  const [grid, setGrid] = useState<(number | null)[][] | null>(null);
  const reqId = useRef(0);

  const dates = meta?.dates ?? [];
  const date = dates[dateIdx] ?? "";

  // keep URL in sync (shareable views)
  useEffect(() => {
    if (!date) return;
    const qs = toShareState({ date, depth, field, lat: point?.lat, lon: point?.lon });
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [date, depth, field, point]);

  // fetch current slice (+ prefetch next dates for smooth scrubbing)
  useEffect(() => {
    if (!date || !meta) return;
    const id = ++reqId.current;
    setLoaded(false);
    cachedSlice(date, depth, field)
      .then((s) => {
        if (id !== reqId.current) return;
        const flat = s.values.flat().filter((v): v is number => v !== null);
        if (flat.length) {
          const r = field === "error" ? symmetric(flat) : stretch(flat);
          setRange(r);
          setFieldUrl(fieldToDataURL([...s.values].reverse(), { ramp: rampFor(field), lo: r.lo, hi: r.hi }));
        }
        setGrid(s.values);
        setSliceErr(null);
        setLoaded(true);
        const next = dates.slice(dateIdx + 1, dateIdx + 4);
        prefetchSlices(next, depth, field);
      })
      .catch((e) => id === reqId.current && setSliceErr(String(e?.message ?? e)));
  }, [date, depth, field, meta, dates, dateIdx]);

  // keyboard: arrows for date, +/- for depth
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT" || (e.target as HTMLElement)?.tagName === "SELECT") return;
      if (e.key === "ArrowRight" && dateIdx < dates.length - 1) setDateIdx(dateIdx + 1);
      else if (e.key === "ArrowLeft" && dateIdx > 0) setDateIdx(dateIdx - 1);
      else if ((e.key === "+" || e.key === "=") && meta) {
        const i = meta.depths_m.indexOf(depth);
        if (i >= 0 && i < meta.depths_m.length - 1) setDepth(meta.depths_m[i + 1]);
      } else if (e.key === "-" && meta) {
        const i = meta.depths_m.indexOf(depth);
        if (i > 0) setDepth(meta.depths_m[i - 1]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dateIdx, dates.length, depth, meta]);

  const onPoint = useCallback((lat: number, lon: number) => setPoint({ lat, lon }), []);

  // profile at the clicked point (model + GLORYS + climatology + real Argo)
  useEffect(() => {
    if (!point || !date) return;
    let on = true;
    setProfileErr(null);
    api.profile(date, point.lat, point.lon)
      .then((p) => on && setProfile(p))
      .catch((e) => on && setProfileErr(String(e?.message ?? e)));
    return () => { on = false; };
  }, [point, date]);

  if (error) return <DataState error={error} />;

  return (
    <div className="map-page">
      <OceanMap
        field={fieldUrl}
        lon0={meta?.lon[0] ?? 45} lat0={meta?.lat[0] ?? 5}
        lon1={meta?.lon[meta.lon.length - 1] ?? 105} lat1={meta?.lat[meta.lat.length - 1] ?? 30}
        values={grid ?? undefined}
        onHover={setCursor}
        projection={projection}
        marker={point}
        onPoint={onPoint}
      />

      {/* cursor readout (nullschool-style) */}
      <div
        style={{
          position: "absolute", bottom: 14, left: "50%", transform: "translateX(-50%)",
          zIndex: 10, pointerEvents: "none",
        }}
        aria-live="off"
      >
        {cursor && (
          <div className="panel panel-pad num" style={{ padding: "6px 14px", fontSize: 13, display: "flex", gap: 10 }}>
            <span style={{ color: "var(--text-2)" }}>
              {cursor.lat.toFixed(2)}°N {cursor.lon.toFixed(2)}°E
            </span>
            <b style={{ color: cursor.temp === null ? "var(--text-3)" : "var(--amber)" }}>
              {cursor.temp === null ? "land / no data" : `${cursor.temp.toFixed(2)} °C`}
            </b>
          </div>
        )}
      </div>

      {/* controls panel */}
      <div className="float-panel tl panel panel-pad col" style={{ gap: 14 }}>
        {dates.length === 0 ? (
          <>
            <div className="skeleton" style={{ height: 16 }} />
            <div className="skeleton" style={{ height: 16, width: "70%" }} />
            <div className="skeleton" style={{ height: 16, width: "50%" }} />
          </>
        ) : (
          <>
            <DateSlider dates={dates} index={dateIdx} onIndex={setDateIdx} playing={playing} onPlaying={setPlaying} />
            <ChipRow
              label="Depth"
              options={(meta?.depths_m ?? []).map((d) => ({ value: String(d), label: `${d} m` }))}
              value={String(depth)}
              onChange={(v) => setDepth(Number(v))}
              ariaLabel="Depth"
            />
            <ChipRow label="Field" options={FIELDS} value={field} onChange={(v) => setField(v as SliceField)} ariaLabel="Field" />
            <ChipRow
              label="View"
              options={[
                { value: "globe", label: "Globe 3D" },
                { value: "mercator", label: "Flat" },
              ]}
              value={projection}
              onChange={(v) => setProjection(v as "globe" | "mercator")}
              ariaLabel="Map projection"
            />
            {range && <Colorbar field={field} lo={range.lo} hi={range.hi} units="°C" />}
            {field === "error" && (
              <p className="tiny">model − GLORYS: blue = model colder, red = model warmer.</p>
            )}
            <p className="tiny" style={{ margin: 0 }}>
              {sliceErr ? <span style={{ color: "var(--coral)" }}>{sliceErr}</span> : loaded ? (
                <>{fmtDate(date)} · {depth} m · click the map for a profile · <span className="kbd">←</span> <span className="kbd">→</span> date, <span className="kbd">+</span><span className="kbd">−</span> depth</>
              ) : "loading slice…"}
            </p>
            <p className="tiny" style={{ margin: 0, borderTop: "1px solid var(--hairline)", paddingTop: 8 }}>
              Coverage is the SIH26066 contract domain — <b>5–30°N, 45–105°E</b> (Arabian Sea,
              Bay of Bengal, equatorial Indian Ocean). Dark patches are land or ice-free
              nodata; the rest of the globe is outside this problem&apos;s scope.
            </p>
          </>
        )}
      </div>

      {/* profile panel */}
      <div className="float-panel tr panel">
        <div className="panel-head spread">
          <b style={{ fontSize: 14 }}>Water column</b>
          {point && (
            <span className="num tiny">
              {point.lat.toFixed(2)}°N {point.lon.toFixed(2)}°E{" "}
              <button type="button" className="chip" onClick={downloadProfileCsv} title="Download profile as CSV">CSV</button>
            </span>
          )}
        </div>
        <div className="panel-pad">
          {profileErr ? (
            <div className="note bad" style={{ margin: 0 }}>{profileErr}</div>
          ) : profile ? (
            <ProfileChart profile={profile} />
          ) : (
            <ProfileChart profile={null} />
          )}
        </div>
      </div>
    </div>
  );

  function downloadProfileCsv() {
    if (!profile || !point) return;
    const rows = [["depth_m", "oceanembed_c", "glorys_c", "climatology_c", "argo_profiles_nearby"]];
    profile.depths_m.forEach((d, i) => {
      rows.push([
        String(d),
        profile.mean[i]?.toFixed(3) ?? "",
        profile.truth[i]?.toFixed(3) ?? "",
        profile.clim[i]?.toFixed(3) ?? "",
        "",
      ]);
    });
    for (const o of profile.argo) rows.push([`argo,${o.platform},${o.cycle},${o.time},${o.depth_m},${o.temp_c}`]);
    const blob = new Blob([rows.map((r) => r.join(",")).join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `oceanembed_${profile.date}_${point.lat}_${point.lon}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
}

function symmetric(flat: number[]) {
  const m = Math.max(...flat.map(Math.abs));
  return { lo: -m, hi: m };
}
