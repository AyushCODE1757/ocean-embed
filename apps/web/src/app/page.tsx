"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { api, cachedMeta, type Meta, type Metrics } from "@/lib/api-client";
import { fieldToDataURL, stretch, rampFor } from "@/lib/colormaps";
import { DataState, useMeta } from "@/components/feedback/DataState";

/* Landing. The hero renders a REAL slice (2024-01-01, 0 m) fetched from the
   API — the product visual is the product. If the API is down, a plain
   gradient shows instead. No synthetic imagery anywhere. */

export default function Landing() {
  const { meta, error } = useMeta();
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [heroArt, setHeroArt] = useState<string | null>(null);

  useEffect(() => {
    api.metrics().then(setMetrics).catch(() => {});
  }, []);

  useEffect(() => {
    let on = true;
    api.slice("2024-01-01", 0, "model")
      .then((s) => {
        if (!on) return;
        const flat = s.values.flat().filter((v): v is number => v !== null);
        const { lo, hi } = stretch(flat);
        // grid rows run south-first; flip so north is up in the hero art.
        // 8x stepped bilinear so the coastline is antialiased at hero size.
        setHeroArt(fieldToDataURL([...s.values].reverse(), { ramp: rampFor("model"), lo, hi, smooth: 8 }));
      })
      .catch(() => {});
    return () => { on = false; };
  }, []);

  return (
    <>
      {/* ---------------- hero ---------------- */}
      <section className="hero">
        <div className="hero-fallback" aria-hidden />
        {heroArt && <div className="hero-art" style={{ backgroundImage: `url(${heroArt})` }} aria-hidden />}
        <div className="container hero-inner">
          <p className="eyebrow">Smart India Hackathon 26066 · North Indian Ocean</p>
          <h1 className="display" style={{ maxWidth: "20ch" }}>
            See beneath the surface of the Indian Ocean.
          </h1>
          <p className="lede" style={{ marginTop: "var(--s4)" }}>
            Argo floats measure the ocean interior, but only where they drift. OceanEmbed turns{" "}
            <b>seven satellite surface observations</b> into a daily 0.25° temperature field down
            to 1000 m — and shows its validation against the floats themselves, including where it
            loses.
          </p>
          <div className="cta-row">
            <Link href="/explorer" className="btn primary">Open the explorer</Link>
            <Link href="/validation" className="btn">Read the validation</Link>
          </div>
          <p className="tiny" style={{ marginTop: "var(--s4)" }}>
            {meta
              ? <>run <span className="num">{meta.provenance.run_id}</span> · test years 2024–2025 · data through {meta.data_through} · no synthetic data anywhere</>
              : "loading run information…"}
          </p>
        </div>
      </section>

      <DataState error={error} />

      {/* ---------------- stats ---------------- */}
      <section className="section-tight">
        <div className="container">
          <div className="stats">
            <div className="stat"><b className="num">15</b><span>depths, 0–1000 m</span></div>
            <div className="stat"><b className="num">0.25°</b><span>daily grid, 101×241</span></div>
            <div className="stat"><b className="num">{metrics ? Math.max(...metrics.rows.filter((r) => r.season === "all" && r.basin === "all").map((r) => r.n), 0).toLocaleString("en-IN") : "6,801"}</b><span>Argo profiles matched</span></div>
            <div className="stat"><b className="num">{meta ? meta.dates.length : "366"}</b><span>reconstructed days</span></div>
            <div className="stat"><b className="num">7</b><span>satellite inputs</span></div>
          </div>
        </div>
      </section>

      {/* ---------------- problem ---------------- */}
      <section className="section">
        <div className="container col" style={{ gap: "var(--s4)" }}>
          <p className="eyebrow">The problem</p>
          <h2 className="h2" style={{ maxWidth: "30ch" }}>The ocean&apos;s heat is where we can&apos;t see it.</h2>
          <div className="row wrap" style={{ gap: "var(--s4)", alignItems: "flex-start" }}>
            <p className="lede" style={{ flex: "1 1 380px" }}>
              Subsurface temperature decides how much heat a cyclone can pump out of the sea, where
              fish gather, and how marine heatwaves develop. Yet the only direct observer — the
              Argo program — samples this 19-million-km² region with a few hundred drifting floats,
              each surfacing every 10 days. Satellites see only the skin.
            </p>
            <div className="panel panel-pad" style={{ flex: "1 1 300px" }}>
              <p className="eyebrow muted">What we reconstruct</p>
              <p className="small" style={{ marginTop: 8 }}>
                Temperature at 15 depths from 0 to 1000 m, every day of 2024–2025, on a 0.25° grid
                (5–30°N, 45–105°E) — the Arabian Sea, the Bay of Bengal and the equatorial Indian
                Ocean.
              </p>
              <p className="tiny" style={{ marginTop: 8 }}>
                Inputs: OSTIA SST · SMOS/SMAP SSS · DUACS SLA · OSCAR currents · CCMP winds.
                Training target: GLORYS12 reanalysis.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- how it works ---------------- */}
      <section className="section-tight">
        <div className="container">
          <p className="eyebrow">How it works</p>
          <h2 className="h2" style={{ margin: "8px 0 var(--s5)" }}>From photons to profiles.</h2>
          <div className="step-grid">
            {[
              ["01", "Harmonize", "All products regridded to one 0.25° daily cube with masks, QC and per-variable provenance."],
              ["02", "Embed", "A masked-autoencoder learns the ocean's surface patterns from the 7 input channels — no labels needed."],
              ["03", "Reconstruct", "A decoder maps the embedding to temperature anomalies at 15 depths, trained on GLORYS anomalies."],
              ["04", "Validate", "Scored on held-out years and against raw Argo profiles the model never saw — baselines on the same footing."],
            ].map(([n, t, b]) => (
              <div key={n} className="step-card">
                <span className="step-n">{n}</span>
                <h3 className="h3" style={{ margin: "6px 0" }}>{t}</h3>
                <p className="small">{b}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- validation preview ---------------- */}
      <section className="section">
        <div className="container col" style={{ gap: "var(--s4)" }}>
          <p className="eyebrow amber">Honest validation</p>
          <h2 className="h2" style={{ maxWidth: "34ch" }}>Beat climatology at thermocline depth — lose to ARMOR3D, and say so.</h2>
          <ValidationPreview metrics={metrics} />
          <Link href="/validation" className="btn small" style={{ alignSelf: "flex-start" }}>
            Full tables, baselines &amp; caveats →
          </Link>
        </div>
      </section>

      {/* ---------------- applications ---------------- */}
      <section className="section-tight">
        <div className="container">
          <div className="row wrap" style={{ gap: "var(--s4)", alignItems: "stretch" }}>
            <Link href="/cyclone" className="panel panel-pad" style={{ flex: "1 1 300px", color: "inherit", textDecoration: "none" }}>
              <p className="eyebrow">Application · cyclones</p>
              <h3 className="h3" style={{ margin: "8px 0" }}>Cyclone heat potential</h3>
              <p className="small">
                Pre-storm oceanic heat content and the 26 °C isotherm along the tracks of Remal
                (May 2024) and Fengal (Nov 2024), from IBTrACS best tracks — a diagnostic of the
                reconstructed ocean state, not a forecast.
              </p>
            </Link>
            <Link href="/advisor" className="panel panel-pad" style={{ flex: "1 1 300px", color: "inherit", textDecoration: "none" }}>
              <p className="eyebrow">Application · argo program</p>
              <h3 className="h3" style={{ margin: "8px 0" }}>Where should the next float go?</h3>
              <p className="small">
                The plan: ensemble uncertainty × distance-to-Argo → top-K float placement, proved
                with a mini-OSSE. The status of that pipeline in this run is shown transparently on
                the advisor page.
              </p>
            </Link>
          </div>
        </div>
      </section>

      {/* ---------------- limitations ---------------- */}
      <section className="section-tight">
        <div className="container">
          <div className="note">
            <b>Read this before quoting numbers.</b> GLORYS is our training target and assimilates
            Argo, so Argo validation is not fully independent — GLORYS-vs-Argo and ARMOR3D-vs-Argo
            are shown beside ours for that reason. The model has no skill below ~500 m. Some 2025
            inputs are near-real-time. Details on <Link href="/about">About</Link>.
          </div>
        </div>
      </section>
    </>
  );
}

function ValidationPreview({ metrics }: { metrics: Metrics | null }) {
  if (!metrics) {
    return <div className="skeleton" style={{ height: 200, maxWidth: 620 }} aria-label="Loading validation numbers" />;
  }
  const row = (m: string, season = "all", argo = false) =>
    metrics.rows.find((r) => r.method === m && r.depth_m === 100 && r.season === season && r.basin === "all" && (!argo || r.n > 0));
  return (
    <div className="panel" style={{ maxWidth: 620 }}>
      <div className="panel-head spread">
        <b style={{ fontSize: 14 }}>RMSE at 100 m — the thermocline</b>
        <span className="badge info">test years 2024–2025</span>
      </div>
      <div className="panel-pad table-wrap">
        <table className="data">
          <thead>
            <tr><th scope="col">Method</th><th scope="col">vs GLORYS (°C)</th><th scope="col">vs Argo (°C)</th></tr>
          </thead>
          <tbody>
            {["climatology", "armor3d", "glorys", "oceanembed"].map((m) => {
              const vsArgo = row(m, "all", true);
              const vsGlorys = row(m);
              return (
                <tr key={m}>
                  <td>{label(m)}</td>
                  <td className={vsGlorys?.rmse !== null && vsGlorys?.rmse !== undefined && vsGlorys.rmse < 1.837 ? "best" : ""}>
                    {vsGlorys?.rmse?.toFixed(3) ?? "—"}
                  </td>
                  <td>{vsArgo && vsArgo.n > 0 ? vsArgo.rmse?.toFixed(3) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="tiny" style={{ marginTop: 10 }}>
          Against GLORYS the model cuts climatology&apos;s error 1.837 → 1.381 °C. Against raw Argo
          it beats climatology but not ARMOR3D — the independence caveat above applies.
        </p>
      </div>
    </div>
  );
}

function label(m: string) {
  return { oceanembed: "OceanEmbed", climatology: "Climatology", glorys: "GLORYS", armor3d: "ARMOR3D" }[m] ?? m;
}
