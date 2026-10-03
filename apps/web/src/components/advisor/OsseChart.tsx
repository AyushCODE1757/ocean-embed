import type { Osse } from "@/lib/api-client";

export function OsseChart({ osse }: { osse: Osse }) {
  const max = Math.max(...osse.arms.map((a) => a.mean_rmse + a.std_rmse));
  const W = 480, rowH = 32, pad = 150;
  const x = (v: number) => pad + (v / max) * (W - pad - 10);
  return (
    <figure>
      <svg role="img" width={W} height={osse.arms.length * rowH + 10}
        aria-label={`Domain RMSE by placement strategy, K=${osse.k}`}>
        {osse.arms.map((a, i) => (
          <g key={a.name} transform={`translate(0 ${i * rowH + 6})`}>
            <text x={0} y={16} fontSize={13}>{a.name}</text>
            <rect x={pad} y={4} height={18} width={x(a.mean_rmse) - pad} fill="currentColor" opacity={0.6} />
            <line x1={x(a.mean_rmse - a.std_rmse)} x2={x(a.mean_rmse + a.std_rmse)} y1={13} y2={13}
              stroke="currentColor" strokeWidth={2} />
          </g>
        ))}
      </svg>
      <figcaption>
        Bars: mean RMSE. Lines: ±1 std over {osse.n_seeds} seeds and {osse.n_dates} dates. If lines
        overlap, the difference is within run-to-run noise.
      </figcaption>
    </figure>
  );
}
