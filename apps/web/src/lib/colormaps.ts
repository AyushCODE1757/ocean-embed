/** Perceptually uniform, colour-blind-safe colormaps (cmocean-inspired stops),
 * hand-tuned for the dark theme. Interpolation in sRGB is acceptable here
 * because stops are close; primary requirement is recognisability. */

export type Rgb = [number, number, number];

function hex(h: string): Rgb {
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}

function ramp(stops: Rgb[]): (t: number) => Rgb {
  return (t: number) => {
    const x = Math.min(1, Math.max(0, t)) * (stops.length - 1);
    const i = Math.min(stops.length - 2, Math.floor(x));
    const f = x - i;
    return [
      stops[i][0] + (stops[i + 1][0] - stops[i][0]) * f,
      stops[i][1] + (stops[i + 1][1] - stops[i][1]) * f,
      stops[i][2] + (stops[i + 2 > stops.length - 1 ? i + 1 : i + 1][2] - stops[i][2]) * f,
    ];
  };
}

function mk(hexes: string[]) {
  const stops = hexes.map(hex);
  const f = ramp(stops);
  return {
    /** css color for t ∈ [0,1] */
    at: (t: number) => {
      const [r, g, b] = f(t);
      return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
    },
    rgb: f,
    css: `linear-gradient(90deg, ${hexes.map((h, i) => `${h} ${(i / (hexes.length - 1)) * 100}%`).join(", ")})`,
  };
}

/** Temperature (sequential, oceanographic): navy → cyan → sand → coral → wine. */
export const thermal = mk([
  "#082a5e", "#0d3f8c", "#145cb8", "#1e7fce", "#2ba3c9",
  "#4cc4be", "#8adcba", "#cfe8a8", "#f2d06b", "#f5a05a",
  "#e86a4a", "#c93a3c", "#8f1f3f",
]);

/** Anomaly / difference (diverging): blue — pale — red. */
export const diverging = mk([
  "#2166ac", "#4a7dbb", "#8fb0d6", "#d1e0ec", "#f4f4f4",
  "#f2d3bc", "#e8a97f", "#d65f4e", "#b2182b",
]);

/** Uncertainty (viridis-like). */
export const viridis = mk([
  "#440154", "#414487", "#2a788e", "#22a884", "#7ad151", "#fde725",
]);

/** Heat content (teal → amber, "matter"-like). */
export const matter = mk([
  "#0b0a2b", "#28156e", "#6a1a78", "#a52c60", "#cf5745",
  "#e88b4a", "#f4c95d", "#f9f871",
]);

/** Depth of isotherm (magenta→green, "haline"-like). */
export const haline = mk([
  "#2a0a3b", "#3e0f72", "#581883", "#772c8a", "#9b4a92",
  "#bc6ca2", "#d998b5", "#eec8d8", "#f4f4f4",
]);

/** Gap/advisor score (sunset). */
export const sunset = mk([
  "#1f2044", "#3b4a6b", "#7a5c8f", "#b16a86", "#dd7c6a",
  "#f2985f", "#fdbf77", "#f9efa9",
]);

export type ColormapKey = "thermal" | "diverging" | "viridis" | "matter" | "haline" | "sunset";

export const COLORMAPS: Record<ColormapKey, ReturnType<typeof mk>> = {
  thermal,
  diverging,
  viridis,
  matter,
  haline,
  sunset,
};

/** Fixed domain per layer so colours stay stable across dates (legend honesty). */
export function domainFor(layer: string): { min: number; max: number; cmap: ColormapKey; label: string; units: string } {
  switch (layer) {
    case "temp":
      return { min: 2, max: 32, cmap: "thermal", label: "Temperature", units: "°C" };
    case "truth":
      return { min: 2, max: 32, cmap: "thermal", label: "Temperature (GLORYS)", units: "°C" };
    case "anomaly":
      return { min: -3, max: 3, cmap: "diverging", label: "Anomaly vs climatology", units: "°C" };
    case "diff":
      return { min: -2, max: 2, cmap: "diverging", label: "Reconstruction − GLORYS", units: "°C" };
    case "uncertainty":
      return { min: 0, max: 1.2, cmap: "viridis", label: "Ensemble spread", units: "°C (1σ)" };
    case "ohc":
      return { min: 0, max: 140, cmap: "matter", label: "Ocean heat content (0–300 m)", units: "kJ/cm²" };
    case "d26":
      return { min: 0, max: 140, cmap: "haline", label: "26 °C isotherm depth (D26)", units: "m" };
    case "d20":
      return { min: 40, max: 260, cmap: "haline", label: "20 °C isotherm depth (D20)", units: "m" };
    default:
      return { min: 0, max: 1, cmap: "viridis", label: layer, units: "" };
  }
}
