"use client";

/** OceanMap — canvas renderer for the 101 × 241 analysis grid.
 * Equirectangular, wheel-zoom + drag-pan, coastline from embedded
 * Natural Earth asset, graticule, hover readout, pick-on-click, and
 * marker layers (Argo floats, advisor sites, cyclone track, selected cell). */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { LATS, LONS, N_LAT, N_LON } from "@/lib/sim/grid";
import { COLORMAPS, type ColormapKey } from "@/lib/colormaps";
import coastlineRings from "@/assets/coastline.json";

export type MapMarker = {
  lat: number;
  lon: number;
  kind: "argo" | "site" | "sel" | "track" | "wake";
  label?: string;
  rank?: number;
  windKt?: number;
};

type Props = {
  values: Float32Array | null; // NaN = land/no-data
  vmin: number;
  vmax: number;
  cmap: ColormapKey;
  markers?: MapMarker[];
  onPick?: (lat: number, lon: number) => void;
  hoverFormat?: (lat: number, lon: number, v: number) => string;
  ariaLabel?: string;
};

const MARGIN = { l: 44, r: 14, t: 10, b: 26 };

function colorize(
  values: Float32Array,
  vmin: number,
  vmax: number,
  cmap: ColormapKey,
): ImageData | null {
  const off = document.createElement("canvas");
  off.width = N_LON;
  off.height = N_LAT;
  const octx = off.getContext("2d");
  if (!octx) return null;
  const img = octx.createImageData(N_LON, N_LAT);
  const rgb = COLORMAPS[cmap].rgb;
  const span = vmax - vmin || 1;
  for (let r = 0; r < N_LAT; r++) {
    for (let c = 0; c < N_LON; c++) {
      const v = values[r * N_LON + c];
      const o = (r * N_LON + c) * 4;
      if (Number.isNaN(v)) {
        img.data[o + 3] = 0; // transparent → land drawn on top
        continue;
      }
      const [rr, gg, bb] = rgb((v - vmin) / span);
      img.data[o] = rr;
      img.data[o + 1] = gg;
      img.data[o + 2] = bb;
      img.data[o + 3] = 255;
    }
  }
  return img;
}

export function OceanMap({ values, vmin, vmax, cmap, markers = [], onPick, hoverFormat, ariaLabel }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const offRef = useRef<HTMLCanvasElement | null>(null);
  const coastRef = useRef<Path2D | null>(null);
  const [size, setSize] = useState({ w: 900, h: 400 });
  const [view, setView] = useState({ scale: 1, cx: 0.5, cy: 0.5 }); // grid-fraction center
  const viewRef = useRef(view);
  viewRef.current = view;
  const [hover, setHover] = useState<{ x: number; y: number; lat: number; lon: number; v: number } | null>(null);
  const dragRef = useRef<{ x: number; y: number; cx: number; cy: number; moved: boolean } | null>(null);

  /* ---- responsive sizing ---- */
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w > 0 && h > 0) setSize({ w, h });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* ---- coastline Path2D in grid-fraction coords ---- */
  const coastPath = useMemo(() => {
    if (typeof Path2D === "undefined") return null;
    const rings = coastlineRings as unknown as [number, number][][];
    const p = new Path2D();
    for (const ring of rings) {
      ring.forEach(([lon, lat], i) => {
        const x = (lon - LONS[0]) / (LONS[N_LON - 1] - LONS[0]);
        const y = 1 - (lat - LATS[0]) / (LATS[N_LAT - 1] - LATS[0]);
        if (i === 0) p.moveTo(x, y);
        else p.lineTo(x, y);
      });
      p.closePath();
    }
    return p;
  }, []);
  coastRef.current = coastPath;

  /* ---- colorize field to offscreen ---- */
  useEffect(() => {
    if (!values) return;
    const img = colorize(values, vmin, vmax, cmap);
    if (!img) return;
    let off = offRef.current;
    if (!off) {
      off = document.createElement("canvas");
      off.width = N_LON;
      off.height = N_LAT;
      offRef.current = off;
    }
    const octx = off.getContext("2d");
    octx?.putImageData(img, 0, 0);
  }, [values, vmin, vmax, cmap]);

  /* ---- main render ---- */
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    const off = offRef.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = size.w;
    const H = size.h;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // plot area (fixed grid aspect 241:101)
    const pw = W - MARGIN.l - MARGIN.r;
    const ph = H - MARGIN.t - MARGIN.b;
    const aspect = N_LON / N_LAT;
    let plotW = pw;
    let plotH = plotW / aspect;
    if (plotH > ph) {
      plotH = ph;
      plotW = plotH * aspect;
    }
    const px = MARGIN.l + (pw - plotW) / 2;
    const py = MARGIN.t + (ph - plotH) / 2;

    const { scale, cx, cy } = viewRef.current;
    const zoom = Math.max(1, scale);

    // ocean backdrop
    const grad = ctx.createLinearGradient(0, py, 0, py + plotH);
    grad.addColorStop(0, "#06101f");
    grad.addColorStop(1, "#050b16");
    ctx.fillStyle = grad;
    ctx.fillRect(px, py, plotW, plotH);

    ctx.save();
    ctx.beginPath();
    ctx.rect(px, py, plotW, plotH);
    ctx.clip();

    // transform: grid fraction → screen
    const toX = (fx: number) => px + (fx - (cx - 0.5 / zoom)) * zoom * plotW;
    const toY = (fy: number) => py + (fy - (cy - 0.5 / zoom)) * zoom * plotH;
    const sx = zoom * plotW;
    const sy = zoom * plotH;

    // field image
    if (off) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(off, toX(0), toY(0), sx, sy);
    }

    // land fill + coastline with cybernetic glow
    if (coastRef.current) {
      ctx.save();
      ctx.translate(toX(0), toY(0));
      ctx.scale(sx, sy);
      ctx.fillStyle = "#070e1b";
      ctx.fill(coastRef.current);
      ctx.lineWidth = Math.max(0.85, 1.2 / (zoom * 2));
      ctx.strokeStyle = "rgba(69, 214, 255, 0.65)";
      ctx.stroke(coastRef.current);
      ctx.restore();
    }

    // graticule
    ctx.lineWidth = 1;
    ctx.font = "10px ui-monospace, monospace";
    ctx.fillStyle = "var(--graticule-label)";
    for (let lat = 5; lat <= 30; lat += 5) {
      const fy = 1 - (lat - LATS[0]) / (LATS[N_LAT - 1] - LATS[0]);
      const y = toY(fy);
      ctx.strokeStyle = "rgba(69, 214, 255, 0.08)";
      ctx.beginPath();
      ctx.moveTo(px, y);
      ctx.lineTo(px + plotW, y);
      ctx.stroke();
      ctx.fillStyle = "#7db2f0";
      ctx.fillText(`${lat}°N`, px - 32, y + 3);
    }
    for (let lon = 45; lon <= 105; lon += 10) {
      const fx = (lon - LONS[0]) / (LONS[N_LON - 1] - LONS[0]);
      const x = toX(fx);
      ctx.strokeStyle = "rgba(69, 214, 255, 0.08)";
      ctx.beginPath();
      ctx.moveTo(x, py);
      ctx.lineTo(x, py + plotH);
      ctx.stroke();
      ctx.fillStyle = "#7db2f0";
      ctx.fillText(`${lon}°E`, x - 10, py + plotH + 16);
    }

    // markers
    for (const m of markers) {
      const fx = (m.lon - LONS[0]) / (LONS[N_LON - 1] - LONS[0]);
      const fy = 1 - (m.lat - LATS[0]) / (LATS[N_LAT - 1] - LATS[0]);
      const x = toX(fx);
      const y = toY(fy);
      if (m.kind === "argo") {
        // Glowing sensor pulse halo
        ctx.beginPath();
        ctx.arc(x, y, 6.5, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(69, 214, 255, 0.22)";
        ctx.fill();

        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fillStyle = "#45d6ff";
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = "#ffffff";
        ctx.stroke();
      } else if (m.kind === "site") {
        // pin
        ctx.beginPath();
        ctx.arc(x, y, 8, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255, 180, 84, 0.25)";
        ctx.fill();
        ctx.strokeStyle = "#ffb454";
        ctx.lineWidth = 1.6;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, y, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = "#ffb454";
        ctx.fill();
        if (m.rank) {
          ctx.fillStyle = "#ffd9a3";
          ctx.font = "600 10px ui-sans-serif, system-ui";
          ctx.fillText(String(m.rank), x + 10, y - 6);
        }
      } else if (m.kind === "sel") {
        const rr = 10;
        ctx.strokeStyle = "#45d6ff";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, rr, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x - rr - 6, y);
        ctx.lineTo(x - rr + 1, y);
        ctx.moveTo(x + rr - 1, y);
        ctx.lineTo(x + rr + 6, y);
        ctx.moveTo(x, y - rr - 6);
        ctx.lineTo(x, y - rr + 1);
        ctx.moveTo(x, y + rr - 1);
        ctx.lineTo(x, y + rr + 6);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, y, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = "#45d6ff";
        ctx.fill();
      } else if (m.kind === "track") {
        const r = 3 + Math.hypot(0, (m.windKt ?? 30) / 30) * 2;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255, 107, 94, 0.35)";
        ctx.fill();
        ctx.strokeStyle = "#ff6b5e";
        ctx.lineWidth = 1.6;
        ctx.stroke();
      }
    }
    ctx.restore();

    // frame with cyber-HUD reticle corners
    ctx.strokeStyle = "rgba(69, 214, 255, 0.35)";
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 0.5, py + 0.5, plotW - 1, plotH - 1);

    // Corner brackets
    const bLen = 10;
    ctx.strokeStyle = "#45d6ff";
    ctx.lineWidth = 2;
    // Top-left
    ctx.beginPath();
    ctx.moveTo(px, py + bLen);
    ctx.lineTo(px, py);
    ctx.lineTo(px + bLen, py);
    ctx.stroke();
    // Top-right
    ctx.beginPath();
    ctx.moveTo(px + plotW - bLen, py);
    ctx.lineTo(px + plotW, py);
    ctx.lineTo(px + plotW, py + bLen);
    ctx.stroke();
    // Bottom-left
    ctx.beginPath();
    ctx.moveTo(px, py + plotH - bLen);
    ctx.lineTo(px, py + plotH);
    ctx.lineTo(px + bLen, py + plotH);
    ctx.stroke();
    // Bottom-right
    ctx.beginPath();
    ctx.moveTo(px + plotW - bLen, py + plotH);
    ctx.lineTo(px + plotW, py + plotH);
    ctx.lineTo(px + plotW, py + plotH - bLen);
    ctx.stroke();
  }, [size, markers]);

  useEffect(() => {
    render();
  }, [render]);

  /* ---- interactions ---- */
  const fracFromEvent = (e: { clientX: number; clientY: number }) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const W = size.w;
    const H = size.h;
    const pw = W - MARGIN.l - MARGIN.r;
    const ph = H - MARGIN.t - MARGIN.b;
    const aspect = N_LON / N_LAT;
    let plotW = pw;
    let plotH = plotW / aspect;
    if (plotH > ph) {
      plotH = ph;
      plotW = plotH * aspect;
    }
    const px = MARGIN.l + (pw - plotW) / 2;
    const py = MARGIN.t + (ph - plotH) / 2;
    const { scale, cx, cy } = viewRef.current;
    const zoom = Math.max(1, scale);
    const gx = ((e.clientX - rect.left - px) / (zoom * plotW) + (cx - 0.5 / zoom));
    const gy = ((e.clientY - rect.top - py) / (zoom * plotH) + (cy - 0.5 / zoom));
    if (gx < 0 || gx > 1 || gy < 0 || gy > 1) return null;
    return { gx, gy };
  };

  const onWheel = useCallback((e: ReactWheelEvent) => {
    e.preventDefault();
    const { scale, cx, cy } = viewRef.current;
    const dir = e.deltaY < 0 ? 1.2 : 1 / 1.2;
    const next = Math.min(8, Math.max(1, scale * dir));
    if (next === 1) {
      setView({ scale: 1, cx: 0.5, cy: 0.5 });
      return;
    }
    const f = fracFromEvent(e);
    if (f && next > scale) {
      // zoom toward the cursor
      const ncx = cx + (f.gx - cx) * (1 - scale / next);
      const ncy = cy + (f.gy - cy) * (1 - scale / next);
      setView({ scale: next, cx: Math.min(1, Math.max(0, ncx)), cy: Math.min(1, Math.max(0, ncy)) });
    } else {
      setView({ scale: next, cx, cy });
    }
  }, [size]);

  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    dragRef.current = { x: e.clientX, y: e.clientY, cx: view.cx, cy: view.cy, moved: false };
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (drag) {
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
      if (viewRef.current.scale > 1) {
        const pw = size.w - MARGIN.l - MARGIN.r;
        const ph = size.h - MARGIN.t - MARGIN.b;
        const aspect = N_LON / N_LAT;
        let plotW = pw;
        let plotH = plotW / aspect;
        if (plotH > ph) plotW = plotH * aspect;
        const zoom = viewRef.current.scale;
        const ncx = drag.cx - dx / (zoom * plotW);
        const ncy = drag.cy - dy / (zoom * plotH);
        setView({ scale: zoom, cx: Math.min(1, Math.max(0, ncx)), cy: Math.min(1, Math.max(0, ncy)) });
      }
    }
    // hover readout
    const f = fracFromEvent(e);
    if (!f || !values) {
      setHover(null);
      return;
    }
    const lat = LATS[0] + (1 - f.gy) * (LATS[N_LAT - 1] - LATS[0]);
    const lon = LONS[0] + f.gx * (LONS[N_LON - 1] - LONS[0]);
    const r = Math.min(N_LAT - 1, Math.max(0, Math.round((1 - f.gy) * (N_LAT - 1))));
    const c = Math.min(N_LON - 1, Math.max(0, Math.round(f.gx * (N_LON - 1))));
    const v = values[r * N_LON + c];
    const rect = canvas.getBoundingClientRect();
    setHover({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      lat,
      lon,
      v,
    });
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag || drag.moved) return;
    const f = fracFromEvent(e);
    if (f && onPick) {
      const lat = Math.round((LATS[0] + (1 - f.gy) * (LATS[N_LAT - 1] - LATS[0])) * 4) / 4;
      const lon = Math.round((LONS[0] + f.gx * (LONS[N_LON - 1] - LONS[0])) * 4) / 4;
      onPick(lat, lon);
    }
  };

  const hoverText =
    hover && hoverFormat && !Number.isNaN(hover.v)
      ? hoverFormat(hover.lat, hover.lon, hover.v)
      : hover
        ? `${hover.lat.toFixed(2)}°N, ${hover.lon.toFixed(2)}°E`
        : "";

  return (
    <div
      ref={wrapRef}
      style={{ position: "relative", width: "100%", height: "100%", minHeight: 260 }}
    >
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={ariaLabel ?? "Ocean temperature map"}
        style={{
          width: "100%",
          height: "100%",
          display: "block",
          cursor: view.scale > 1 ? "grab" : "crosshair",
          touchAction: "none",
        }}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => {
          setHover(null);
          dragRef.current = null;
        }}
        onDoubleClick={() => setView({ scale: 1, cx: 0.5, cy: 0.5 })}
      />
      {hover && (
        <div
          style={{
            position: "absolute",
            left: Math.min(hover.x + 14, size.w - 190),
            top: Math.max(4, hover.y - 34),
            pointerEvents: "none",
            background: "rgba(5, 12, 22, 0.92)",
            border: "1px solid var(--panel-border-strong)",
            borderRadius: 8,
            padding: "5px 9px",
            fontSize: "var(--fs-xs)",
            fontFamily: "var(--font-mono)",
            color: "var(--text-0)",
            whiteSpace: "nowrap",
            boxShadow: "var(--shadow-1)",
            zIndex: 5,
          }}
        >
          {hoverText}
        </div>
      )}
    </div>
  );
}

/* ---------------- Legend ---------------- */

export function MapLegend({
  cmap,
  min,
  max,
  units,
  label,
  ticks = 5,
}: {
  cmap: ColormapKey;
  min: number;
  max: number;
  units: string;
  label: string;
  ticks?: number;
}) {
  const t = Array.from({ length: 40 }, (_, i) => i / 39);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: "var(--fs-xs)", color: "var(--text-2)", marginBottom: 3 }}>{label}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span className="num" style={{ fontSize: "var(--fs-xs)", color: "var(--text-1)" }}>
            {Math.round(min * 10) / 10}
          </span>
          <div
            aria-hidden="true"
            style={{
              width: 150,
              height: 9,
              borderRadius: 5,
              background: COLORMAPS[cmap].css,
              border: "1px solid rgba(148, 192, 240, 0.25)",
            }}
          />
          <span className="num" style={{ fontSize: "var(--fs-xs)", color: "var(--text-1)" }}>
            {Math.round(max * 10) / 10}
          </span>
          <span style={{ fontSize: "var(--fs-xs)", color: "var(--text-2)" }}>{units}</span>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, fontSize: "var(--fs-xs)", color: "var(--text-3)" }}>
        {ticks > 0 &&
          Array.from({ length: ticks }, (_, i) => {
            const v = min + ((max - min) * i) / (ticks - 1);
            return <span key={i}>{v.toFixed(Math.abs(max - min) < 5 ? 1 : 0)}</span>;
          })}
      </div>
    </div>
  );
}
