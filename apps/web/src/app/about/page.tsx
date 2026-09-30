"use client";

/** About — model card, data lineage, stack, and honest demo limitations. */

import { Badge, DataTable, Panel, useProvenance } from "@/components/ui";
import { useMeta } from "@/components/app-shell";
import {
  INPUT_CHANNELS,
  INCOIS_ARGO,
  LIMITATIONS,
  MODEL,
  RUN,
  STACK,
  TARGET_SOURCE,
} from "@/lib/sim/meta";

const PIPELINE = [
  {
    step: "1 · Ingest",
    title: "Satellite & reanalysis channels",
    body: "Seven daily surface fields (SST, SSS, SLA, currents, winds) are aligned to the 0.25° NIO contract grid with per-source tier labels.",
  },
  {
    step: "2 · Encode",
    title: "E1 CNN + MAE pretrain",
    body: "A ConvNeXt-style encoder maps the multichannel stack into a latent field; masked autoencoding on historical stacks teaches spatial structure before fine-tuning.",
  },
  {
    step: "3 · Decode",
    title: "Depth-wise reconstruction",
    body: "A heteroscedastic head emits temperature at 15 standard levels plus an ensemble spread used for uncertainty and the Advisor gap score.",
  },
  {
    step: "4 · Validate",
    title: "Skill, calibration, cases",
    body: "Metrics vs baselines and ARMOR3D, reliability diagrams, and held-out profile cases — with the GLORYS/Argo independence caveat surfaced in the UI.",
  },
  {
    step: "5 · Advise",
    title: "Gap map + mini-OSSE",
    body: "Greedy top-K float sites from uncertainty × distance-to-Argo, backed by a small OSSE that states its GLORYS-as-truth limitation.",
  },
];

export default function AboutPage() {
  const meta = useMeta();
  const openProv = useProvenance();

  const tierTone = (t: string): "ok" | "warn" | "accent" =>
    t === "final" ? "ok" : t === "interim" ? "warn" : "accent";

  return (
    <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 14, overflowY: "auto", flex: 1, minHeight: 0 }}>
      {/* hero */}
      <section
        style={{
          borderRadius: "var(--r-lg)",
          border: "1px solid var(--panel-border)",
          background: "linear-gradient(135deg, rgba(69, 214, 255, 0.08) 0%, rgba(5, 12, 22, 0.95) 55%)",
          padding: "28px 24px 24px",
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 10 }}>
          <Badge tone="accent">OceanEmbed</Badge>
          <Badge tone="neutral">{MODEL.version}</Badge>
          <Badge tone="violet">Demo simulator</Badge>
        </div>
        <h1 style={{ margin: "0 0 10px", fontSize: "var(--fs-xl)", fontWeight: 650, letterSpacing: "-0.02em" }}>
          North Indian Ocean 3-D temperature — evidence-first demo
        </h1>
        <p style={{ margin: 0, maxWidth: 720, fontSize: "var(--fs-md)", lineHeight: 1.65, color: "var(--text-2)" }}>
          This frontend exercises the full HCI contract — loading states, provenance, validation caveats, and keyboard navigation — on a deterministic simulator
          until the trained GLORYS bundle is served from FastAPI.
        </p>
        <p style={{ margin: "12px 0 0", fontSize: "var(--fs-sm)", color: "var(--warn)", lineHeight: 1.6 }}>
          {RUN.demoNote}
        </p>
        <button
          type="button"
          onClick={openProv}
          style={{
            marginTop: 16,
            padding: "8px 14px",
            borderRadius: "var(--r-sm)",
            border: "1px solid var(--panel-border-strong)",
            background: "var(--accent-soft)",
            color: "var(--accent-strong)",
            fontSize: "var(--fs-sm)",
            cursor: "pointer",
          }}
        >
          Open provenance drawer
        </button>
      </section>

      {/* pipeline */}
      <Panel title="How it works" subtitle="End-to-end path from inputs to advisory views">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 10,
          }}
        >
          {PIPELINE.map((p) => (
            <article
              key={p.step}
              style={{
                padding: "12px 14px",
                borderRadius: "var(--r-md)",
                border: "1px solid var(--panel-border)",
                background: "rgba(6, 13, 24, 0.45)",
              }}
            >
              <div style={{ fontSize: "var(--fs-xs)", color: "var(--accent-strong)", fontWeight: 600, marginBottom: 6 }}>{p.step}</div>
              <h3 style={{ margin: "0 0 6px", fontSize: "var(--fs-sm)", fontWeight: 600 }}>{p.title}</h3>
              <p style={{ margin: 0, fontSize: "var(--fs-xs)", lineHeight: 1.6, color: "var(--text-2)" }}>{p.body}</p>
            </article>
          ))}
        </div>
      </Panel>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 1fr)", gap: 12, alignItems: "start" }}>
        {/* data sources */}
        <Panel title="Data sources" subtitle="Contract inputs, training target, and in-situ validation">
          <DataTable
            dense
            maxHeight={360}
            columns={[
              { key: "label", label: "Channel" },
              { key: "source", label: "Source" },
              { key: "doi", label: "DOI / ID" },
              { key: "tier", label: "Tier" },
            ]}
            rows={INPUT_CHANNELS.map((ch) => ({
              label: `${ch.label} (${ch.units})`,
              source: ch.source,
              doi: ch.doi,
              tier: <Badge tone={tierTone(ch.tier)}>{ch.tier}</Badge>,
            }))}
            rowKey={(r) => String(r.label)}
          />
          <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8, fontSize: "var(--fs-xs)", lineHeight: 1.6, color: "var(--text-2)" }}>
            <p style={{ margin: 0 }}>
              <b style={{ color: "var(--text-1)" }}>Training target:</b> {TARGET_SOURCE.label} — DOI {TARGET_SOURCE.doi}. {TARGET_SOURCE.note}
            </p>
            <p style={{ margin: 0 }}>
              <b style={{ color: "var(--text-1)" }}>In-situ:</b> {INCOIS_ARGO.label} ({INCOIS_ARGO.doi}). {INCOIS_ARGO.note}
            </p>
          </div>
        </Panel>

        {/* model card */}
        <Panel title="Model card" subtitle={meta ? `Run ${meta.run.runId}` : "Loading run metadata…"}>
          <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "auto 1fr", gap: "8px 14px", fontSize: "var(--fs-sm)" }}>
            <dt style={{ color: "var(--text-3)" }}>Architecture</dt>
            <dd style={{ margin: 0 }}>{MODEL.encoder}</dd>
            <dt style={{ color: "var(--text-3)" }}>Parameters</dt>
            <dd style={{ margin: 0 }}>{MODEL.params}</dd>
            <dt style={{ color: "var(--text-3)" }}>Ensemble</dt>
            <dd style={{ margin: 0 }}>{MODEL.ensemble}</dd>
            <dt style={{ color: "var(--text-3)" }}>Train / val / test</dt>
            <dd style={{ margin: 0 }}>
              {MODEL.trainSpan} · val {MODEL.valSpan} · test {MODEL.testSpan}
            </dd>
            <dt style={{ color: "var(--text-3)" }}>Grid</dt>
            <dd style={{ margin: 0 }}>{MODEL.grid}</dd>
            <dt style={{ color: "var(--text-3)" }}>Depths</dt>
            <dd style={{ margin: 0 }}>{MODEL.depths}</dd>
            <dt style={{ color: "var(--text-3)" }}>Data through</dt>
            <dd style={{ margin: 0 }}>{meta?.model.dataThrough ?? MODEL.dataThrough}</dd>
            <dt style={{ color: "var(--text-3)" }}>Contract</dt>
            <dd style={{ margin: 0 }}>{RUN.contractVersion}</dd>
          </dl>
        </Panel>
      </div>

      <Panel title="Known limitations" subtitle="Surfaced in Validation and Advisor — not buried in a README">
        <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 8, fontSize: "var(--fs-sm)", lineHeight: 1.65, color: "var(--text-2)" }}>
          {LIMITATIONS.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </Panel>

      <Panel title="Stack" subtitle="Pinned versions for reproducibility (training + this UI)">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {STACK.map((s) => (
            <Badge key={s.name} tone="neutral" title={s.version}>
              {s.name} {s.version}
            </Badge>
          ))}
        </div>
      </Panel>
    </div>
  );
}
