/* Colour ramps and field rendering.
   Ramps are hand-tuned piecewise-linear stops (perceptually ordered,
   colour-blind defensible: temperature varies lightness monotonically,
   the error ramp is the classic blue-white-red diverging scheme). */

export type RGB = [number, number, number];

function hex(h: string): RGB {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export interface Ramp {
  stops: RGB[];
  /* domain positions 0..1 of each stop */
  pos?: number[];
}

/* temperature: deep water blue -> shallow teal -> warm yellow -> hot red */
export const TEMP_RAMP: Ramp = {
  stops: [
    hex("#12294e"), hex("#19517e"), hex("#1e7f9e"), hex("#2aa79c"),
    hex("#5cc579"), hex("#a8d95c"), hex("#e6c84f"), hex("#efa03c"),
    hex("#e56a35"), hex("#cf3040"),
  ],
};

/* anomaly/error: diverging blue <- 0 -> red */
export const ERROR_RAMP: Ramp = {
  stops: [hex("#2166ac"), hex("#6fa7d0"), hex("#f2f4f6"), hex("#e69b7e"), hex("#b2182b")],
};

/* heat content / isotherm depth: dark -> cyan -> yellow (monotone lightness) */
export const HEAT_RAMP: Ramp = {
  stops: [hex("#0c2233"), hex("#14536e"), hex("#1e8f95"), hex("#4fc387"), hex("#a8d95c"), hex("#e6c84f")],
};

export function sampleRamp(ramp: Ramp, t: number): RGB {
  const x = Math.min(1, Math.max(0, t));
  const pos = ramp.pos ?? ramp.stops.map((_, i) => i / (ramp.stops.length - 1));
  let i = 0;
  while (i < pos.length - 2 && x > pos[i + 1]) i++;
  const [a, b] = [ramp.stops[i], ramp.stops[i + 1]];
  const f = (x - pos[i]) / (pos[i + 1] - pos[i] || 1);
  return [
    Math.round(a[0] + f * (b[0] - a[0])),
    Math.round(a[1] + f * (b[1] - a[1])),
    Math.round(a[2] + f * (b[2] - a[2])),
  ];
}

export function rampCss(ramp: Ramp): string {
  const pos = ramp.pos ?? ramp.stops.map((_, i) => i / (ramp.stops.length - 1));
  return ramp.stops
    .map((s, i) => `rgb(${s[0]},${s[1]},${s[2]}) ${(pos[i] * 100).toFixed(1)}%`)
    .join(", ");
}

export function rampFor(field: string): Ramp {
  if (field === "error") return ERROR_RAMP;
  if (field === "ohc" || field === "d26" || field === "d20") return HEAT_RAMP;
  return TEMP_RAMP;
}

/* 2nd-98th percentile stretch (matches B's exporter technique) */
export function stretch(values: number[]): { lo: number; hi: number } {
  const s = [...values].sort((a, b) => a - b);
  const q = (p: number) => s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))];
  const lo = q(0.02);
  const hi = q(0.98);
  return hi > lo ? { lo, hi } : { lo, hi: lo + 1e-6 };
}

/* Render a [rows][cols] grid of values to a dataURL.
   `smooth` = stepped bilinear upscale factor: the grid is 241x101, and
   nearest-neighbor stretching looks blocky — two or three halving steps of
   high-quality canvas resampling give the smooth nullschool-style field.
   Rows are expected south-first for map use (flipped by the caller). */
export function fieldToDataURL(
  values: (number | null)[][],
  opts: { ramp: Ramp; lo: number; hi: number; smooth?: number },
): string {
  const rows = values.length;
  const cols = rows ? values[0].length : 0;
  if (!rows || !cols) return "";
  const canvas = document.createElement("canvas");
  canvas.width = cols;
  canvas.height = rows;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  const img = ctx.createImageData(cols, rows);
  const span = opts.hi - opts.lo;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const v = values[r][c];
      const o = (r * cols + c) * 4;
      if (v === null || !isFinite(v)) {
        img.data[o + 3] = 0; // transparent = land / nodata
        continue;
      }
      const [rr, gg, bb] = sampleRamp(opts.ramp, (v - opts.lo) / span);
      img.data[o] = rr;
      img.data[o + 1] = gg;
      img.data[o + 2] = bb;
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const factor = opts.smooth ?? 4;
  if (factor <= 1) return canvas.toDataURL();
  let src: HTMLCanvasElement = canvas;
  let grown = 1;
  while (grown < factor) {
    const step = Math.min(2, factor / grown);
    const next = document.createElement("canvas");
    next.width = Math.round(cols * grown * step);
    next.height = Math.round(rows * grown * step);
    const nctx = next.getContext("2d");
    if (!nctx) break;
    nctx.imageSmoothingEnabled = true;
    nctx.imageSmoothingQuality = "high";
    nctx.drawImage(src, 0, 0, next.width, next.height);
    src = next;
    grown *= step;
  }
  return src.toDataURL();
}

export function niceTicks(lo: number, hi: number, count = 5): number[] {
  const span = hi - lo;
  if (!(span > 0)) return [lo];
  const raw = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm >= 5 ? 5 : norm >= 2 ? 2 : 1) * mag;
  const start = Math.ceil(lo / step) * step;
  const out: number[] = [];
  for (let v = start; v <= hi + 1e-9; v += step) out.push(Number(v.toFixed(6)));
  return out;
}
