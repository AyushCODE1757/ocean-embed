"use client";

import { useEffect, useState } from "react";
import { DataState } from "@/components/feedback/DataState";

/* About: pipeline, data sources with provenance (run manifest from
   /v1/provenance), limitations, and what we refuse to claim. */

const SOURCES: [string, string, string][] = [
  ["GLORYS12V1", "daily 1/12° reanalysis → 0.25°, 15 depths (PCHIP)", "training target (assimilates Argo)"],
  ["OSTIA SST", "daily 0.05° L4 → 0.25°", "input · skin temperature"],
  ["SMOS+SMAP SSS", "daily multi-product → 0.25° (2025: NRT)", "input · salinity"],
  ["DUACS SLA", "daily 0.125° L4 → 0.25°", "input · sea-level anomaly"],
  ["OSCAR currents", "daily L4 final V2.0 → 0.25°", "input · surface u/v"],
  ["CCMP winds", "6-hourly V3.1 → daily u/v → 0.25°", "input · wind stress proxy"],
  ["Argo", "raw profiles via argopy, QC-flagged", "independent-ish validation"],
  ["ARMOR3D", "daily 0.125° → 0.25°", "benchmark (assimilates Argo)"],
  ["IBTrACS v04r01", "best tracks, NI basin 2024", "cyclone case study"],
];

export default function About() {
  const [manifest, setManifest] = useState<Record<string, unknown> | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/v1/provenance`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(setManifest)
      .catch((e) => setErr(String(e?.message ?? e)));
  }, []);

  return (
    <div className="container" style={{ padding: "var(--s5) var(--s5) var(--s6)" }}>
      <p className="eyebrow">About</p>
      <h1 className="h2" style={{ margin: "6px 0 var(--s4)" }}>Built to be checked.</h1>

      {err && <DataState error={`Provenance unavailable (${err}) — the API may not be running.`} />}

      <div className="row wrap" style={{ gap: "var(--s4)", alignItems: "flex-start" }}>
        <div className="panel panel-pad" style={{ flex: "1 1 420px" }}>
          <p className="eyebrow muted">Data sources</p>
          <div className="table-wrap" style={{ marginTop: 8 }}>
            <table className="data">
              <thead><tr><th scope="col">Product</th><th scope="col">Use</th><th scope="col">Role</th></tr></thead>
              <tbody>
                {SOURCES.map(([n, u, r]) => (
                  <tr key={n}><td>{n}</td><td style={{ whiteSpace: "normal", textAlign: "left" }}>{u}</td><td style={{ whiteSpace: "normal", textAlign: "left" }}>{r}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="tiny" style={{ marginTop: 10 }}>
            All products regridded to the contract grid (5–30°N, 45–105°E, 0.25°, daily). Splits:
            train 2019–2022 · validate 2023 · test 2024–2025, with a 15-day gap between periods.
          </p>
        </div>

        <div className="col" style={{ flex: "1 1 340px", gap: "var(--s4)" }}>
          <div className="panel panel-pad">
            <p className="eyebrow muted">Run provenance</p>
            {manifest ? (
              <>
                <p className="small" style={{ margin: "8px 0 4px" }}>
                  run <b className="num">{String(manifest.run_id)}</b> · model{" "}
                  <b className="num">{String(manifest.model_id)}</b>
                </p>
                <p className="tiny" style={{ margin: 0 }}>
                  built {String(manifest.created_utc)} ·{" "}
                  {Array.isArray(manifest.input_files)
                    ? `${manifest.input_files.length} input files`
                    : `${Object.keys((manifest.input_files as Record<string, unknown>) ?? {}).length} input files`}{" "}
                  hashed with SHA-256 into <code>runs/current/run_manifest.json</code>. Served arrays
                  decode from int16 (scale 0.01, nodata −32768) exactly as exported by the training
                  pipeline.
                </p>
              </>
            ) : (
              <p className="tiny">Provenance loads when the API is up. Nothing on this site is
              hard-coded — numbers come from computed files.</p>
            )}
          </div>

          <div className="panel panel-pad">
            <p className="eyebrow muted">Limitations, plainly</p>
            <ul className="small" style={{ margin: "8px 0 0", paddingLeft: 18, display: "grid", gap: 6 }}>
              <li>No skill below ~500 m; 1000 m is effectively climatology.</li>
              <li>Warm bias vs Argo at 100–125 m (~+0.8 °C).</li>
              <li>GLORYS-as-teacher: errors of the reanalysis can pass through to the model.</li>
              <li>Uncertainty / advisor layers need a seed ensemble — not in this run.</li>
              <li>2025 SSS &amp; ARMOR3D are near-real-time versions.</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="panel panel-pad" style={{ marginTop: "var(--s4)" }}>
        <p className="eyebrow muted">Reproduce it</p>
        <div className="row wrap" style={{ gap: 8, marginTop: 8, fontFamily: "var(--mono)", fontSize: 12.5 }}>
          {[
            "make setup",
            "make artifacts",
            "make serve   # API :8000",
            "make web     # UI :3000",
          ].map((c) => (
            <code key={c} style={{ background: "rgba(8,24,40,0.9)", border: "1px solid var(--hairline)", borderRadius: 8, padding: "6px 10px" }}>{c}</code>
          ))}
        </div>
        <p className="tiny" style={{ marginTop: 10 }}>
          Training code (Kaggle pipeline: downloads → cube → masked-autoencoder → export) lives in{" "}
          <code>training/</code>, byte-for-byte as it ran. Metrics are recomputed from{" "}
          <code>results/*.json</code> — the same files that produced the README tables.
        </p>
      </div>
    </div>
  );
}
