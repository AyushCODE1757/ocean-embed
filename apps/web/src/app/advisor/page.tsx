"use client";

import { useEffect, useState } from "react";
import { ChipRow } from "@/components/controls/Controls";
import { DataState, useMeta } from "@/components/feedback/DataState";
import { api, type Gaps, type Osse } from "@/lib/api-client";
import { fmtDate, fmtKm } from "@/lib/format";

/* Argo Advisor: uncertainty-guided float placement + mini-OSSE.
   These artifacts only exist if the 3-seed ensemble run landed; the API
   returns 503 while they are absent and this page reports that honestly. */

export default function Advisor() {
  const { meta, error: metaErr } = useMeta();
  const dates = meta?.dates ?? [];
  const [dateIdx, setDateIdx] = useState(0);
  const [k, setK] = useState(10);
  const [gaps, setGaps] = useState<Gaps | null>(null);
  const [gapErr, setGapErr] = useState<string | null>(null);
  const [osse, setOsse] = useState<Osse | null>(null);
  const [osseErr, setOsseErr] = useState<string | null>(null);

  useEffect(() => {
    api.osse().then(setOsse).catch((e) => setOsseErr(e?.status === 503 ? "503" : String(e?.message ?? e)));
  }, []);

  useEffect(() => {
    const d = dates[dateIdx];
    if (!d) return;
    let on = true;
    setGapErr(null);
    api.gaps(d, k)
      .then((g) => on && setGaps(g))
      .catch((e) => {
        if (!on) return;
        setGaps(null);
        setGapErr(e?.status === 503 ? "503" : String(e?.message ?? e));
      });
    return () => { on = false; };
  }, [dates, dateIdx, k]);

  const off = (label: string, why: string) => (
    <div className="panel panel-pad col" style={{ gap: 10 }}>
      <div className="spread wrap">
        <b>{label}</b>
        <span className="badge bad">not computed in this run</span>
      </div>
      <p className="small" style={{ margin: 0 }}>{why}</p>
      <p className="tiny" style={{ margin: 0 }}>
        The shipped model is a single training run, so it has no ensemble spread — and we refuse to
        display invented uncertainty. The pipeline (calibration → gap map → top-K → mini-OSSE) is
        implemented and runs as soon as a seed-ensemble export lands in <code>artifacts/advisor/</code>.
      </p>
    </div>
  );

  return (
    <div className="container" style={{ padding: "var(--s5) var(--s5) var(--s6)" }}>
      <p className="eyebrow">Argo Advisor</p>
      <h1 className="h2" style={{ margin: "6px 0 var(--s2)" }}>Where should the next float drift?</h1>
      <p className="lede" style={{ marginBottom: "var(--s4)" }}>
        The differentiator we designed: combine predicted uncertainty with distance to the nearest
        recent Argo profile, rank candidate sites, and prove the placement with a controlled
        sampling experiment (mini-OSSE).
      </p>

      {(metaErr) && <DataState error={metaErr} />}

      <div className="row wrap" style={{ gap: "var(--s4)", alignItems: "stretch" }}>
        {/* ---- gap map / top-K ---- */}
        {gapErr === "503" || (!gaps && !gapErr) ? (
          <div style={{ flex: "1 1 420px" }}>
            {off(
              "Observation-gap map & top-K sites",
              "Requires per-pixel ensemble spread (temp_spread in the predictions store). This run shipped without it, so the API returns 503 for /v1/gaps — by design.",
            )}
          </div>
        ) : gapErr ? (
          <div className="note bad" style={{ flex: "1 1 420px" }} role="alert">{gapErr}</div>
        ) : gaps ? (
          <div className="panel table-wrap" style={{ flex: "1 1 420px", alignSelf: "flex-start" }}>
            <div className="panel-head col" style={{ gap: 10 }}>
              <div className="spread wrap">
                <b style={{ fontSize: 14 }}>Top-{gaps.sites.length} float sites · {fmtDate(gaps.date)}</b>
                <ChipRow
                  label="K"
                  options={[5, 10, 20].map((n) => ({ value: String(n), label: String(n) }))}
                  value={String(k)}
                  onChange={(v) => setK(Number(v))}
                />
              </div>
              {gaps.method_note && <p className="tiny" style={{ margin: 0 }}>{gaps.method_note}</p>}
            </div>
            <table className="data">
              <thead>
                <tr><th scope="col">#</th><th scope="col">Lat</th><th scope="col">Lon</th><th scope="col">Score</th><th scope="col">Uncertainty</th><th scope="col">Nearest Argo</th></tr>
              </thead>
              <tbody>
                {gaps.sites.map((s) => (
                  <tr key={s.rank}>
                    <td className="num">{s.rank}</td>
                    <td className="num">{s.lat.toFixed(2)}°</td>
                    <td className="num">{s.lon.toFixed(2)}°</td>
                    <td className="num">{s.score.toFixed(3)}</td>
                    <td className="num">{s.uncertainty?.toFixed(3) ?? "—"}</td>
                    <td className="num">{fmtKm(s.dist_to_argo_km)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {/* ---- OSSE ---- */}
        {osseErr === "503" || (!osse && !osseErr) ? (
          <div style={{ flex: "1 1 360px" }}>
            {off(
              "Mini-OSSE",
              "Replays history: sample virtual profiles at advisor-chosen vs random vs existing-layout sites, correct the model residual by optimal interpolation, compare errors over many dates and seeds. Needs the same ensemble spread.",
            )}
          </div>
        ) : osseErr ? (
          <div className="note bad" style={{ flex: "1 1 360px" }} role="alert">{osseErr}</div>
        ) : osse ? (
          <div className="panel panel-pad" style={{ flex: "1 1 360px", alignSelf: "flex-start" }}>
            <div className="col" style={{ gap: 8 }}>
              <b>OSSE · K={osse.k} sites · {osse.n_dates} dates · {osse.n_seeds} seeds</b>
              <OsseBars arms={osse.arms} />
              {osse.limitation_note && <p className="tiny" style={{ margin: 0 }}>{osse.limitation_note}</p>}
            </div>
          </div>
        ) : null}
      </div>

      <div className="note info" style={{ marginTop: "var(--s4)" }}>
        <b>Why we show empty panels instead of a demo.</b> A number without provenance is exactly
        what this project refuses to ship. The advisor components are implemented server-side and
        activate automatically when the ensemble artifacts exist.
      </div>
    </div>
  );
}

function OsseBars({ arms }: { arms: { name: string; mean_rmse: number; std_rmse: number }[] }) {
  const max = Math.max(...arms.map((a) => a.mean_rmse + a.std_rmse), 0.01);
  return (
    <div className="col" style={{ gap: 10 }} role="img" aria-label="OSSE arms, mean RMSE with spread">
      {arms.map((a) => (
        <div key={a.name} className="col" style={{ gap: 3 }}>
          <div className="spread tiny"><span>{a.name}</span><span className="num">{a.mean_rmse.toFixed(3)} ± {a.std_rmse.toFixed(3)}</span></div>
          <div style={{ height: 14, borderRadius: 7, background: "rgba(148,197,255,0.08)", position: "relative" }}>
            <div style={{ position: "absolute", inset: 0, width: `${(a.mean_rmse / max) * 100}%`, borderRadius: 7, background: "linear-gradient(90deg, var(--cyan), #7fdcf7)" }} />
          </div>
        </div>
      ))}
    </div>
  );
}
