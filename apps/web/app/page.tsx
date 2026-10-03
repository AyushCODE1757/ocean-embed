"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import maplibregl from "maplibre-gl";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const FIELDS = ["model", "truth", "clim", "error"];
const FIELD_LABELS: Record<string, string> = {
  model: "Model",
  truth: "GLORYS",
  clim: "Climatology",
  error: "Error",
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function colorFor(value: number, min: number, max: number) {
  const stops = [
    [45, 93, 140],
    [75, 162, 224],
    [143, 225, 208],
    [244, 236, 157],
    [245, 184, 110],
    [211, 93, 77],
    [122, 44, 56],
  ];

  if (!Number.isFinite(value)) {
    return [255, 255, 255, 0];
  }

  const normalized = clamp((value - min) / Math.max(1e-6, max - min), 0, 1);
  const scaled = normalized * (stops.length - 1);
  const lower = Math.floor(scaled);
  const upper = Math.min(stops.length - 1, lower + 1);
  const t = scaled - lower;
  const mix = (index: number) =>
    Math.round(stops[lower][index] * (1 - t) + stops[upper][index] * t);

  return [mix(0), mix(1), mix(2), 255] as const;
}

const IMAGE_COORDINATES: [[number, number], [number, number], [number, number], [number, number]] = [
  [45, 30],
  [105, 30],
  [105, 5],
  [45, 5],
];

function syncSliceImage(map: maplibregl.Map, canvas: HTMLCanvasElement) {
  const url = canvas.toDataURL("image/png");
  const source = map.getSource("slice-image") as maplibregl.ImageSource | undefined;
  if (source) {
    source.updateImage({ url });
    return;
  }
  if (!map.isStyleLoaded()) return;

  map.addSource("slice-image", {
    type: "image",
    url,
    coordinates: IMAGE_COORDINATES,
  });
  map.addLayer({
    id: "slice-layer",
    type: "raster",
    source: "slice-image",
  });
}

export default function Page() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);

  const [meta, setMeta] = useState<any>(null);
  const [dates, setDates] = useState<string[]>([]);
  const [dateIndex, setDateIndex] = useState(0);
  const [field, setField] = useState<string>("model");
  const [depth, setDepth] = useState<number>(0);
  const [selectedLatLon, setSelectedLatLon] = useState({ lat: 15.5, lon: 60.5 });
  const [sliceData, setSliceData] = useState<any>(null);
  const [sliceError, setSliceError] = useState<string | null>(null);
  const [profileData, setProfileData] = useState<any>(null);
  const [metrics, setMetrics] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const currentDate = dates[dateIndex] ?? "2024-01-01";

  const loadMeta = useCallback(async () => {
    const response = await fetch(`${API_BASE}/v1/meta`);
    const payload = await response.json();
    setMeta(payload.meta);
    setDates(payload.dates);
    if (!payload.dates.length) return;
    setDateIndex(payload.dates.length - 1);
  }, []);

  const loadMetrics = useCallback(async () => {
    const response = await fetch(`${API_BASE}/v1/metrics`);
    const payload = await response.json();
    setMetrics(payload);
  }, []);

  useEffect(() => {
    void loadMeta();
    void loadMetrics();
  }, [loadMeta, loadMetrics]);

  const loadSlice = useCallback(async () => {
    if (!currentDate) return;
    setLoading(true);
    setSliceError(null);
    try {
      const response = await fetch(
        `${API_BASE}/v1/slice?date=${encodeURIComponent(currentDate)}&depth=${depth}&field=${field}`,
      );
      if (!response.ok) throw new Error(`Slice request failed (${response.status})`);
      setSliceData(await response.json());
    } catch (error) {
      setSliceError(error instanceof Error ? error.message : "Unable to load this slice");
    } finally {
      setLoading(false);
    }
  }, [currentDate, depth, field]);

  useEffect(() => {
    void loadSlice();
  }, [loadSlice]);

  const loadProfile = useCallback(async (lat: number, lon: number) => {
    const response = await fetch(
      `${API_BASE}/v1/profile?date=${encodeURIComponent(currentDate)}&lat=${lat}&lon=${lon}`,
    );
    const payload = await response.json();
    setProfileData(payload);
  }, [currentDate]);

  useEffect(() => {
    if (!meta) return;
    void loadProfile(selectedLatLon.lat, selectedLatLon.lon);
  }, [currentDate, loadProfile, meta, selectedLatLon.lat, selectedLatLon.lon]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") {
        setDateIndex((value) => clamp(value + 1, 0, dates.length - 1));
      }
      if (event.key === "ArrowLeft") {
        setDateIndex((value) => clamp(value - 1, 0, dates.length - 1));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dates.length]);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: "https://demotiles.maplibre.org/style.json",
      center: [75, 17],
      zoom: 3,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    const syncImage = () => {
      if (overlayRef.current) syncSliceImage(map, overlayRef.current);
    };
    map.on("load", syncImage);
    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(mapContainerRef.current);
    requestAnimationFrame(() => map.resize());
    return () => {
      resizeObserver.disconnect();
      map.off("load", syncImage);
      map.remove();
      if (mapRef.current === map) mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const canvas = overlayRef.current;
    if (!canvas || !sliceData) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    const width = 241;
    const height = 101;
    if (sliceData.values.length !== height || sliceData.values.some((row: unknown[]) => row.length !== width)) {
      setSliceError("Slice has an unexpected grid shape; expected 101 × 241.");
      return;
    }
    canvas.width = width;
    canvas.height = height;
    const imageData = context.createImageData(width, height);
    const values = sliceData.values.flat();
    const finiteValues = values.filter((value: number | null) => value !== null && Number.isFinite(value)).sort((a: number, b: number) => a - b);
    const percentile = (fraction: number) => finiteValues[Math.floor((finiteValues.length - 1) * fraction)];
    const min = finiteValues.length ? percentile(0.02) : 0;
    const max = finiteValues.length ? percentile(0.98) : 1;

    sliceData.values.forEach((row: (number | null)[], latitudeIndex: number) => {
      row.forEach((value, longitudeIndex) => {
        const pixelIndex = ((height - 1 - latitudeIndex) * width + longitudeIndex) * 4;
        if (value === null || !Number.isFinite(value)) {
          imageData.data[pixelIndex + 3] = 0;
          return;
        }
        const [r, g, b, a] = colorFor(value, min, max);
        imageData.data[pixelIndex] = r;
        imageData.data[pixelIndex + 1] = g;
        imageData.data[pixelIndex + 2] = b;
        imageData.data[pixelIndex + 3] = a;
      });
    });

    context.putImageData(imageData, 0, 0);
    if (mapRef.current) syncSliceImage(mapRef.current, canvas);
  }, [sliceData]);

  const profileTrace = useMemo<any[]>(() => {
    if (!profileData) return [];
    return [
      {
        x: profileData.model,
        y: profileData.depths,
        mode: "lines+markers",
        type: "scatter",
        name: "Model",
        line: { color: "#5cc8ff" },
      },
      {
        x: profileData.truth,
        y: profileData.depths,
        mode: "lines+markers",
        type: "scatter",
        name: "GLORYS",
        line: { color: "#ffd166" },
      },
      {
        x: profileData.clim,
        y: profileData.depths,
        mode: "lines+markers",
        type: "scatter",
        name: "Climatology",
        line: { color: "#7ae582" },
      },
    ];
  }, [profileData]);

  const plotLayout = useMemo<any>(() => ({
    paper_bgcolor: "transparent",
    plot_bgcolor: "transparent",
    font: { color: "#edf5ff" },
    margin: { l: 40, r: 20, t: 10, b: 40 },
    xaxis: { title: meta?.units ?? "degC", showgrid: true },
    yaxis: { autorange: "reversed", title: { text: "Depth (m)" } },
  }), [meta?.units]);

  const onMapClick = (event: MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    const lon = 45 + x * 60;
    const lat = 30 - y * 25;
    setSelectedLatLon({ lat, lon });
  };

  const currentDepth = sliceData?.depth ?? depth;
  const skillBadge = currentDepth >= 500 ? "Low skill below 300 m - near-climatological" : null;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">OceanEmbed</div>
        <div className="toolbar">
          <div className="control-group">
            <label htmlFor="date-slider">Date</label>
            <input
              id="date-slider"
              type="range"
              min={0}
              max={Math.max(dates.length - 1, 0)}
              value={dateIndex}
              onChange={(event) => setDateIndex(Number(event.target.value))}
            />
            <span>{currentDate}</span>
          </div>
          <div className="control-group">
            <label htmlFor="depth-select">Depth</label>
            <select
              id="depth-select"
              value={depth}
              onChange={(event) => setDepth(Number(event.target.value))}
            >
              {(meta?.depths ?? [0, 5, 10, 20, 30, 50, 75, 100, 125, 150, 200, 300, 500, 700, 1000]).map((value: number) => (
                <option key={value} value={value}>{value} m</option>
              ))}
            </select>
          </div>
          <div className="control-group">
            <label htmlFor="field-select">Field</label>
            <select
              id="field-select"
              value={field}
              onChange={(event) => setField(event.target.value)}
            >
              {FIELDS.map((item) => (
                <option key={item} value={item}>{FIELD_LABELS[item]}</option>
              ))}
            </select>
          </div>
          <button onClick={() => setDateIndex((value) => (value < dates.length - 1 ? value + 1 : value))}>Play</button>
        </div>
      </header>

      <div className="status-bar">
        <span>Data through: {currentDate}</span>
        <span>Split: {meta?.split ?? "test"}</span>
        <span>SSS and ARMOR3D 2025 = near-real-time</span>
        {skillBadge ? <span className="badge">{skillBadge}</span> : null}
      </div>

      <main className="main-grid">
        <section className="panel map-panel">
          <div className="map-shell">
            <div ref={mapContainerRef} className="map-box" onClick={onMapClick} />
            <canvas ref={overlayRef} width={241} height={101} className="map-data-canvas" />
            {sliceError ? <div className="map-error" role="alert">{sliceError}</div> : null}
          </div>
          <div style={{ padding: "0.8rem 1rem 1rem" }}>
            <div className="legend">
              <span>{FIELD_LABELS[field]}</span>
              <div className="legend-bar" />
              <span>{meta?.units ?? "degC"}</span>
            </div>
          </div>
        </section>

        <aside className="panel side-panel">
          <div className="chart-card">
            <h3>Profile at selected point</h3>
            <div style={{ fontSize: 13, color: "#9bb0c7", marginBottom: 8 }}>
              Lat {selectedLatLon.lat.toFixed(2)} · Lon {selectedLatLon.lon.toFixed(2)}
            </div>
            {profileData ? (
              <Plot
                data={profileTrace}
                layout={plotLayout}
                style={{ width: "100%", height: 340 }}
                config={{ displayModeBar: false, responsive: true }}
              />
            ) : null}
          </div>

          <div className="chart-card" style={{ marginTop: 16 }}>
            <h3>Metrics</h3>
            {metrics ? (
              <table className="metrics-table">
                <thead>
                  <tr>
                    <th>Depth</th>
                    <th>Model RMSE</th>
                    <th>Clim RMSE</th>
                  </tr>
                </thead>
                <tbody>
                  {(metrics.results?.test?.depth ?? []).map((depthValue: number, index: number) => (
                    <tr key={depthValue}>
                      <td>{depthValue}</td>
                      <td>{(metrics.results?.test?.model_rmse ?? [])[index]?.toFixed?.(3) ?? "—"}</td>
                      <td>{(metrics.results?.test?.clim_rmse ?? [])[index]?.toFixed?.(3) ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
            <div className="meta-box">
              Argo independence caveat: the real Argo set is used only for validation and is not part of the training target.
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}
