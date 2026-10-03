"use client";

import { useEffect, useRef } from "react";
import { Map as MlMap, setWorkerUrl, type ImageSource, type GeoJSONSource } from "maplibre-gl";
import type { ArgoObservation, TrackPoint } from "@/lib/api-client";

/* Next.js/Turbopack cannot resolve maplibre's import.meta.url worker, so the
   worker + shared chunk are copied to /public and wired here. */
setWorkerUrl("/maplibre-gl-worker.mjs");

/* MapLibre wrapper: raster field overlay (client-rendered dataURL image
   source, the technique B's v1 explorer proved) + optional Argo dots and
   a cyclone track line. The grid's row 0 is the SOUTH edge (lat ascending),
   so rows are flipped before rendering to place north at the top. */

export interface OceanMapProps {
  field?: string | null; // dataURL of the raster (cols x rows, south-first rows)
  lon0: number; lat0: number; lon1: number; lat1: number;
  values?: (number | null)[][]; // raw grid for the cursor readout (south-first rows)
  onHover?: (r: { lat: number; lon: number; temp: number | null } | null) => void;
  projection?: "globe" | "mercator";
  argo?: ArgoObservation[];
  track?: TrackPoint[];
  marker?: { lat: number; lon: number } | null;
  onPoint?: (lat: number, lon: number) => void;
  interactive?: boolean;
}

const STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

function coordsBox(lon0: number, lat0: number, lon1: number, lat1: number) {
  // image source wants TL, TR, BR, BL
  return [
    [lon0, lat1],
    [lon1, lat1],
    [lon1, lat0],
    [lon0, lat0],
  ] as [[number, number], [number, number], [number, number], [number, number]];
}

export default function OceanMap(props: OceanMapProps) {
  const holder = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MlMap | null>(null);
  const readyRef = useRef(false);
  const cbRef = useRef(props.onPoint);
  cbRef.current = props.onPoint;
  const hoverRef = useRef(props.onHover);
  hoverRef.current = props.onHover;
  const valsRef = useRef(props.values);
  valsRef.current = props.values;
  const boxRef = useRef({ lon0: props.lon0, lat0: props.lat0, lon1: props.lon1, lat1: props.lat1 });
  boxRef.current = { lon0: props.lon0, lat0: props.lat0, lon1: props.lon1, lat1: props.lat1 };
  const projRef = useRef(props.projection);
  projRef.current = props.projection;

  const applyProjection = (map: MlMap) => {
    try {
      map.setProjection({ type: projRef.current === "globe" ? "globe" : "mercator" });
    } catch { /* style without projection support */ }
  };

  // create map once
  useEffect(() => {
    if (!holder.current || mapRef.current) return;
    const map = new MlMap({
      container: holder.current,
      style: STYLE,
      center: [75, 17.5],
      zoom: 3.4,
      minZoom: 2.5,
      maxZoom: 9,
      interactive: props.interactive !== false,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.on("load", () => {
      readyRef.current = true;
      applyProjection(map);
      map.addSource("field", {
        type: "image",
        url: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
        coordinates: coordsBox(45, 5, 105, 30),
      });
      map.addLayer({ id: "field-layer", type: "raster", source: "field", paint: { "raster-opacity": 0.92, "raster-fade-duration": 180 } });
      map.addSource("argo", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: "argo-dots", type: "circle", source: "argo",
        paint: {
          "circle-radius": ["case", ["==", ["get", "mode"], "D"], 4.5, 3.5],
          "circle-color": ["case", ["==", ["get", "mode"], "D"], "#e9b45c", "#7f95ab"],
          "circle-stroke-width": 1, "circle-stroke-color": "rgba(5,14,24,0.85)",
        },
      });
      map.addSource("track", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({ id: "track-line", type: "line", source: "track", paint: { "line-color": "#f0705a", "line-width": 2.2 }, filter: ["==", "$type", "LineString"] });
      map.addLayer({ id: "track-dots", type: "circle", source: "track", paint: { "circle-radius": 3, "circle-color": "#f0705a", "circle-stroke-width": 1, "circle-stroke-color": "rgba(5,14,24,0.8)" }, filter: ["==", "$type", "Point"] });
      map.addSource("marker", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: "marker-dot", type: "circle", source: "marker",
        paint: { "circle-radius": 6, "circle-color": "rgba(0,0,0,0)", "circle-stroke-width": 2, "circle-stroke-color": "#ffffff" },
      });
      // initial paint with whatever prop is already here
      paint(map, props);
    });
    map.on("click", (e) => {
      cbRef.current?.(Number(e.lngLat.lat.toFixed(3)), Number(e.lngLat.lng.toFixed(3)));
    });
    map.on("mousemove", (e) => {
      const vals = valsRef.current;
      if (!vals || !hoverRef.current) return;
      const { lon0, lat0, lon1, lat1 } = boxRef.current;
      const { lat, lng } = e.lngLat;
      if (lat < lat0 || lat > lat1 || lng < lon0 || lng > lon1) {
        hoverRef.current(null);
        return;
      }
      const rows = vals.length, cols = rows ? vals[0].length : 0;
      const r = Math.min(rows - 1, Math.max(0, Math.round(((lat - lat0) / (lat1 - lat0)) * (rows - 1))));
      const c = Math.min(cols - 1, Math.max(0, Math.round(((lng - lon0) / (lon1 - lon0)) * (cols - 1))));
      hoverRef.current({ lat, lon: lng, temp: vals[r][c] });
    });
    map.on("mouseout", () => hoverRef.current?.(null));
    return () => { map.remove(); mapRef.current = null; readyRef.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // projection toggle (globe / flat)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current || !props.projection) return;
    applyProjection(map);
  }, [props.projection]);

  // repaint when props change
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!readyRef.current) {
      const t = setInterval(() => {
        if (readyRef.current) { clearInterval(t); paint(mapRef.current!, props); }
      }, 120);
      return () => clearInterval(t);
    }
    paint(map, props);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.field, props.argo, props.track, props.marker]);

  return (
    <div ref={holder} className="map-fill" role="application" aria-label="Interactive ocean map">
      <div
        style={{
          position: "absolute", left: 10, bottom: 6, zIndex: 5, pointerEvents: "none",
          fontSize: 10.5, color: "rgba(157,184,210,0.85)", letterSpacing: "0.02em",
          textShadow: "0 1px 4px rgba(2,8,15,0.9)",
        }}
      >
        Field: OceanEmbed reconstruction (GLORYS12-trained) · Basemap ©{" "}
        OpenStreetMap contributors, © CARTO
      </div>
    </div>
  );
}

function paint(map: MlMap, p: OceanMapProps) {
  const src = map.getSource("field") as ImageSource | undefined;
  if (src && p.field) {
    src.updateImage({ url: p.field, coordinates: coordsBox(p.lon0, p.lat0, p.lon1, p.lat1) });
  }
  const argo = map.getSource("argo") as GeoJSONSource | undefined;
  argo?.setData({
    type: "FeatureCollection",
    features: (p.argo ?? []).map((o) => ({
      type: "Feature" as const,
      properties: { mode: o.data_mode, temp: o.temp_c, depth: o.depth_m, platform: o.platform },
      geometry: { type: "Point" as const, coordinates: [o.lon, o.lat] },
    })),
  });
  const track = map.getSource("track") as GeoJSONSource | undefined;
  track?.setData({
    type: "FeatureCollection",
    features: (p.track?.length
      ? [
          { type: "Feature" as const, properties: {}, geometry: { type: "LineString" as const, coordinates: p.track.map((t) => [t.lon, t.lat]) } },
          ...p.track.filter((_, i) => i % 3 === 0).map((t) => ({ type: "Feature" as const, properties: { time: t.iso_time, wind: t.wind_kt ?? undefined }, geometry: { type: "Point" as const, coordinates: [t.lon, t.lat] } })),
        ]
      : []),
  });
  const mk = map.getSource("marker") as GeoJSONSource | undefined;
  mk?.setData({
    type: "FeatureCollection",
    features: (p.marker
      ? [{ type: "Feature" as const, properties: {}, geometry: { type: "Point" as const, coordinates: [p.marker.lon, p.marker.lat] } }]
      : []),
  });
}
