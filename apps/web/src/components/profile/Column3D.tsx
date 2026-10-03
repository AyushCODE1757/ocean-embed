"use client";

import { useEffect, useRef } from "react";
import type { Profile } from "@/lib/api-client";
import { sampleRamp, TEMP_RAMP } from "@/lib/colormaps";

/* 3D reconstructed water column: a cone from the surface (wide, the top face
   showing the surface field) down to 1000 m (apex). Each depth band is colored
   by the reconstructed temperature at that depth; the dashed isotherm rings on
   the top face and the meridian line rotate (auto + drag). Pure canvas 2D. */

const W = 384, H = 420;
const CX = W / 2, Y0 = 92, SPAN = 268, RX = 122, RY = 0.32, SHRINK = 0.9;

export default function Column3D({ profile }: { profile: Profile | null }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rotRef = useRef(0.6);
  const dragRef = useRef<{ x: number; idleUntil: number } | null>(null);
  const profileRef = useRef(profile);
  profileRef.current = profile;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = W * dpr;
    canvas.height = H * dpr;

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const yOf = (d: number) => Y0 + (d / 1000) * SPAN;
    const rOf = (d: number) => RX * (1 - (SHRINK * d) / 1000);

    let raf = 0;
    let stopped = false;

    const draw = () => {
      const p = profileRef.current;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      // backdrop
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, "rgba(8,24,40,0.55)");
      bg.addColorStop(1, "rgba(5,14,24,0.15)");
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.roundRect(0, 0, W, H, 10);
      ctx.fill();

      // depth ticks
      ctx.font = "10px " + getComputedStyle(document.body).fontFamily;
      ctx.fillStyle = "rgba(156,184,210,0.75)";
      ctx.textAlign = "right";
      for (const d of [0, 250, 500, 750, 1000]) {
        ctx.fillText(`${d} m`, CX - RX - 16, yOf(d) + 3);
        ctx.strokeStyle = "rgba(148,197,255,0.14)";
        ctx.beginPath();
        ctx.moveTo(CX - RX - 10, yOf(d));
        ctx.lineTo(CX - RX - 4, yOf(d));
        ctx.stroke();
      }

      if (!p) {
        ctx.fillStyle = "rgba(157,184,210,0.9)";
        ctx.textAlign = "center";
        ctx.font = "13px " + getComputedStyle(document.body).fontFamily;
        ctx.fillText("Click the map to build the water column", CX, H / 2);
        return;
      }

      const pairs = p.depths_m
        .map((d, i) => ({ d, t: p.mean[i] }))
        .filter((x) => x.t !== null && isFinite(x.t)) as { d: number; t: number }[];
      if (pairs.length < 2) return;
      const lo = Math.min(...pairs.map((x) => x.t)) - 0.4;
      const hi = Math.max(...pairs.map((x) => x.t)) + 0.4;
      const color = (t: number, light: number) => {
        const [r, g, b] = sampleRamp(TEMP_RAMP, (t - lo) / (hi - lo));
        return `rgb(${Math.round(r * light)},${Math.round(g * light)},${Math.round(b * light)})`;
      };
      const tAt = (d: number) => {
        const a = pairs.findIndex((x) => x.d >= d);
        if (a <= 0) return pairs[Math.max(0, a)].t;
        const p0 = pairs[a - 1], p1 = pairs[a];
        const f = (d - p0.d) / (p1.d - p0.d || 1);
        return p0.t * (1 - f) + p1.t * f;
      };

      const rot = rotRef.current;

      // side surface: stacked elliptical bands, top -> bottom
      for (let i = 0; i < pairs.length - 1; i++) {
        const dT = pairs[i].d, dB = pairs[i + 1].d;
        const rT = rOf(dT), rB = rOf(dB);
        const yT = yOf(dT), yB = yOf(dB);
        const tm = tAt((dT + dB) / 2);
        const grad = ctx.createLinearGradient(0, yT, 0, yB);
        grad.addColorStop(0, color(tm, 1.06));
        grad.addColorStop(1, color(tm, 0.72));
        ctx.fillStyle = grad;
        ctx.beginPath();
        // front half of the top rim (right -> left through the bottom of the ellipse)
        ctx.ellipse(CX, yT, rT, rT * RY, 0, 0, Math.PI, false);
        // line to the left edge of the band's bottom rim
        ctx.lineTo(CX - rB, yB);
        // front half of the bottom rim, right <- left (reversed)
        ctx.ellipse(CX, yB, rB, rB * RY, 0, Math.PI, 0, true);
        ctx.closePath();
        ctx.fill();
      }

      // top face: the "surface of the ocean"
      const surf = pairs[0].t;
      const tg = ctx.createRadialGradient(CX - RX * 0.35, Y0 - 8, 6, CX, Y0, RX);
      tg.addColorStop(0, color(surf, 1.22));
      tg.addColorStop(1, color(surf, 0.82));
      ctx.fillStyle = tg;
      ctx.beginPath();
      ctx.ellipse(CX, Y0, RX, RX * RY, 0, 0, 2 * Math.PI);
      ctx.fill();
      ctx.strokeStyle = "rgba(230,242,252,0.75)";
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // rotating dashed isotherm rings on the surface face (logo motif)
      ctx.save();
      ctx.setLineDash([5, 6]);
      ctx.lineDashOffset = -rot * 40;
      for (const f of [0.68, 0.4]) {
        ctx.strokeStyle = "rgba(190,235,255,0.55)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(CX, Y0, RX * f, RX * f * RY, 0, 0, 2 * Math.PI);
        ctx.stroke();
      }
      ctx.restore();

      // rotating meridian sweep on the side surface
      const phi = rot % (2 * Math.PI);
      const mx = CX + Math.cos(phi) * rOf(0);
      const my = Y0 + Math.sin(phi) * rOf(0) * RY;
      const grad2 = ctx.createLinearGradient(mx, my, CX, yOf(1000));
      grad2.addColorStop(0, "rgba(232,242,252,0.9)");
      grad2.addColorStop(1, "rgba(232,242,252,0.08)");
      ctx.strokeStyle = grad2;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(mx, my);
      ctx.quadraticCurveTo(CX + Math.cos(phi) * rOf(500) * 0.55, yOf(500), CX, yOf(1000));
      ctx.stroke();

      // rim highlight
      ctx.strokeStyle = "rgba(127,220,247,0.5)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(CX, Y0, RX, RX * RY, 0, phi, phi + 1.6);
      ctx.stroke();

      // caption
      ctx.fillStyle = "rgba(156,184,210,0.9)";
      ctx.textAlign = "center";
      ctx.fillText(
        `surface ${surf.toFixed(2)} °C · 0–1000 m · drag to rotate`,
        CX, H - 10,
      );
    };

    let idle = 0;
    const loop = () => {
      if (stopped) return;
      if (!document.hidden) {
        if (dragRef.current && performance.now() < dragRef.current.idleUntil) {
          idle = 0; // user is dragging / recently dragged
        } else if (!reduced) {
          idle += 1;
          rotRef.current += 0.008 + 0.004 * Math.sin(idle / 160);
        }
        draw();
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const onDown = (e: PointerEvent) => {
      dragRef.current = { x: e.clientX, idleUntil: performance.now() + 400 };
      canvas.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!dragRef.current) return;
      rotRef.current += (e.clientX - dragRef.current.x) * 0.012;
      dragRef.current.x = e.clientX;
      dragRef.current.idleUntil = performance.now() + 2200;
    };
    const onUp = () => { dragRef.current = null; };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: "100%", maxWidth: W, display: "block", touchAction: "none" }}
      role="img"
      aria-label="3D reconstruction of the water column at the selected point, colored by temperature"
    />
  );
}
