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

/* Render a [rows][cols] grid of values to a dataURL, evaluated at `smooth`×
   resolution (default 4×). The grid is 241×101; magnifying that bitmap always
   looks blocky, so instead we SAMPLE the field continuously at the target
   resolution: bicubic (Catmull-Rom) value interpolation + an anti-aliased
   coastline derived from the smoothstep of the interpolated land mask. This is
   the nullschool approach — smooth + sharp at any scale, not blurry.
   Rows are expected south-first for map use (flipped by the caller). */
export function fieldToDataURL(
  values: (number | null)[][],
  opts: {
    ramp: Ramp; lo: number; hi: number; smooth?: number;
    /* optional vector land clip (Natural Earth): destination-in evenodd fill
       gives true anti-aliased coastlines instead of the grid's staircase mask */
    landClip?: { path: Path2D } | null;
  },
): string {
  const rows = values.length;
  const cols = rows ? values[0].length : 0;
  if (!rows || !cols) return "";
  const factor = Math.max(1, opts.smooth ?? 4);
  const outW = Math.round(cols * factor);
  const outH = Math.round(rows * factor);
  const span = opts.hi - opts.lo;

  // flat arrays + 1024-entry colour LUT (hot loop stays tight)
  const val = new Float64Array(rows * cols).fill(NaN);
  const msk = new Uint8Array(rows * cols);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const v = values[r][c];
      const i = r * cols + c;
      if (v !== null && isFinite(v)) val[i] = v;
      msk[i] = v !== null && isFinite(v) ? 1 : 0;
    }
  }
  const lut = new Uint8Array(1024 * 3);
  for (let i = 0; i < 1024; i++) {
    const [rr, gg, bb] = sampleRamp(opts.ramp, i / 1023);
    lut[i * 3] = rr; lut[i * 3 + 1] = gg; lut[i * 3 + 2] = bb;
  }

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  const img = ctx.createImageData(outW, outH);
  const data = img.data;

  const g = (c: number, r: number) =>
    (c < 0 ? 0 : c >= cols ? cols - 1 : c) + (r < 0 ? 0 : r >= rows ? rows - 1 : r) * cols;
  const smoothstep = (a: number, b: number, x: number) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };

  for (let py = 0; py < outH; py++) {
    const gy = (py + 0.5) / factor - 0.5;
    const iy = Math.floor(gy);
    const ty = gy - iy;
    for (let px = 0; px < outW; px++) {
      const gx = (px + 0.5) / factor - 0.5;
      const ix = Math.floor(gx);
      const tx = gx - ix;
      const o = (py * outW + px) * 4;

      // anti-aliased coast: continuous mask from bilinear of the 0/1 mask
      const m =
        msk[g(ix, iy)] * (1 - tx) * (1 - ty) +
        msk[g(ix + 1, iy)] * tx * (1 - ty) +
        msk[g(ix, iy + 1)] * (1 - tx) * ty +
        msk[g(ix + 1, iy + 1)] * tx * ty;
      const alpha = smoothstep(0.32, 0.62, m);
      if (alpha <= 0) continue; // stays transparent (land)

      // bicubic (Catmull-Rom) value sample with null-tolerant fallback
      const wx0 = -0.5 * tx * tx * tx + tx * tx - 0.5 * tx;
      const wx1 = 1.5 * tx * tx * tx - 2.5 * tx * tx + 1;
      const wx2 = -1.5 * tx * tx * tx + 2 * tx * tx + 0.5 * tx;
      const wx3 = 0.5 * tx * tx * tx - 0.5 * tx * tx;
      const wy0 = -0.5 * ty * ty * ty + ty * ty - 0.5 * ty;
      const wy1 = 1.5 * ty * ty * ty - 2.5 * ty * ty + 1;
      const wy2 = -1.5 * ty * ty * ty + 2 * ty * ty + 0.5 * ty;
      const wy3 = 0.5 * ty * ty * ty - 0.5 * ty * ty;
      let acc = 0, wsum = 0, bilAcc = 0, bilW = 0;
      for (let j = 0; j < 4; j++) {
        const wy = j === 0 ? wy0 : j === 1 ? wy1 : j === 2 ? wy2 : wy3;
        for (let i2 = 0; i2 < 4; i2++) {
          const wx = i2 === 0 ? wx0 : i2 === 1 ? wx1 : i2 === 2 ? wx2 : wx3;
          const v = val[g(ix - 1 + i2, iy - 1 + j)];
          const w = wx * wy;
          if (isFinite(v)) { acc += v * w; wsum += w; }
        }
      }
      if (wsum > 0.02 && Math.abs(wsum - 1) < 0.25) {
        acc /= wsum;
      } else {
        // fallback: valid-weighted bilinear at the 4 nearest cells
        for (let j = 0; j < 2; j++) {
          for (let i2 = 0; i2 < 2; i2++) {
            const v = val[g(ix + i2, iy + j)];
            const w =
              (i2 === 0 ? 1 - tx : tx) * (j === 0 ? 1 - ty : ty) *
              (isFinite(v) ? 1 : 0);
            if (w > 0) { bilAcc += v * w; bilW += w; }
          }
        }
        if (bilW <= 0) continue; // fully nodata
        acc = bilAcc / bilW;
      }

      const idx = Math.max(0, Math.min(1023, Math.round(((acc - opts.lo) / span) * 1023)));
      data[o] = lut[idx * 3];
      data[o + 1] = lut[idx * 3 + 1];
      data[o + 2] = lut[idx * 3 + 2];
      data[o + 3] = Math.round(255 * alpha);
    }
  }
  ctx.putImageData(img, 0, 0);
  if (opts.landClip) {
    ctx.globalCompositeOperation = "destination-in";
    ctx.fill(opts.landClip.path, "evenodd");
    ctx.globalCompositeOperation = "source-over";
  }
  return canvas.toDataURL();
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
