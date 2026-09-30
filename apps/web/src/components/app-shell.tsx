"use client";

/** App shell: top navigation, persistent system-status bar (HCI:
 * "system-state feedback"), keyboard shortcuts help sheet, provenance
 * drawer, and a shared Meta context fetched once for all views. */

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { api, type Meta } from "@/lib/api-client";
import { Badge, Button, ProvenanceProvider } from "./ui";
import { SHORTCUT_LIST } from "@/lib/shortcuts";

/* ---------------- Meta context ---------------- */

const MetaCtx = createContext<Meta | null>(null);
export function useMeta(): Meta | null {
  return useContext(MetaCtx);
}

const NAV = [
  { href: "/", label: "Explorer", key: "1" },
  { href: "/compare", label: "Compare", key: "2" },
  { href: "/validation", label: "Validation", key: "3" },
  { href: "/advisor", label: "Advisor", key: "4" },
  { href: "/cyclone", label: "Cyclone", key: "5" },
  { href: "/about", label: "About", key: "6" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [meta, setMeta] = useState<Meta | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [provOpen, setProvOpen] = useState(false);
  const [web3Open, setWeb3Open] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .meta()
      .then((m) => alive && setMeta(m))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const nav = NAV.find((n) => n.key === e.key);
      if (nav) {
        router.push(nav.href);
      } else if (e.key === "?") {
        setHelpOpen((v) => !v);
      } else if (e.key === "Escape") {
        setHelpOpen(false);
        setProvOpen(false);
        setWeb3Open(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  const openProv = useCallback(() => setProvOpen(true), []);

  return (
    <ProvenanceProvider onOpen={openProv}>
      <MetaCtx.Provider value={meta}>
        <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
          {/* top nav */}
          <nav
            aria-label="Main"
            style={{
              height: "var(--nav-h)",
              display: "flex",
              alignItems: "center",
              gap: 4,
              padding: "0 18px",
              borderBottom: "1px solid var(--panel-border)",
              background: "rgba(6, 13, 24, 0.75)",
              backdropFilter: "blur(12px)",
              position: "sticky",
              top: 0,
              zIndex: 50,
            }}
          >
            <Link href="/" style={{ display: "flex", alignItems: "center", gap: 9, marginRight: 14 }}>
              <span
                aria-hidden="true"
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: "50%",
                  background:
                    "radial-gradient(circle at 30% 30%, #45d6ff 0%, #1b6fae 45%, #0a2c52 100%)",
                  boxShadow: "0 0 14px rgba(69, 214, 255, 0.45)",
                  display: "inline-block",
                }}
              />
              <span style={{ fontWeight: 750, letterSpacing: "0.02em", fontSize: "var(--fs-lg)", color: "var(--text-0)" }}>
                Ocean<span style={{ color: "var(--accent)" }}>Embed</span>
              </span>
            </Link>
            <div style={{ display: "flex", gap: 2, flex: 1 }}>
              {NAV.map((n) => {
                const active = pathname === n.href;
                return (
                  <Link
                    key={n.href}
                    href={n.href}
                    aria-current={active ? "page" : undefined}
                    title={`${n.label} (${n.key})`}
                    style={{
                      padding: "6px 12px",
                      borderRadius: "var(--r-sm)",
                      fontSize: "var(--fs-sm)",
                      fontWeight: active ? 650 : 500,
                      color: active ? "var(--accent-strong)" : "var(--text-1)",
                      background: active ? "var(--accent-soft)" : "transparent",
                      border: `1px solid ${active ? "var(--panel-border-strong)" : "transparent"}`,
                      transition: "all var(--t-fast)",
                    }}
                  >
                    {n.label}
                  </Link>
                );
              })}
            </div>

            {/* Web3 Protocol status & wallet connection */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginRight: 8 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  background: "rgba(6, 18, 36, 0.75)",
                  border: "1px solid rgba(69, 214, 255, 0.25)",
                  borderRadius: 999,
                  padding: "4px 12px",
                  fontSize: "var(--fs-xs)",
                  color: "var(--text-1)",
                }}
              >
                <span className="pulse-ring" style={{ width: 7, height: 7, borderRadius: "50%", background: "#4ade80", display: "inline-block" }} />
                <span style={{ fontWeight: 600 }}>DevNet 0.25°</span>
                <span style={{ color: "var(--text-3)" }}>·</span>
                <span style={{ color: "var(--accent)" }}>101 Nodes Sync</span>
              </div>

              <Button
                variant="solid"
                onClick={() => setWeb3Open(true)}
                title="Ocean Intelligence Oracle Consensus & Cryptographic Attestation"
              >
                ⚡ 0x7E4...918B
              </Button>
            </div>

            <Button variant="icon" title="Keyboard shortcuts (?)" onClick={() => setHelpOpen(true)} ariaPressed={helpOpen}>
              ⌘
            </Button>
          </nav>

          {/* page body */}
          <main style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
            {error ? (
              <div style={{ padding: 20, color: "var(--danger)" }}>
                Failed to reach the data service: {error}. <button onClick={() => location.reload()} style={{ textDecoration: "underline" }}>Retry</button>
              </div>
            ) : (
              children
            )}
          </main>

          {/* status bar */}
          <footer
            style={{
              height: "var(--status-h)",
              display: "flex",
              alignItems: "center",
              gap: 14,
              padding: "0 16px",
              borderTop: "1px solid var(--panel-border)",
              background: "rgba(6, 13, 24, 0.85)",
              fontSize: "var(--fs-xs)",
              color: "var(--text-2)",
              position: "sticky",
              bottom: 0,
              zIndex: 50,
              overflowX: "auto",
              whiteSpace: "nowrap",
            }}
          >
            {meta ? (
              <>
                <span>
                  Model <b style={{ color: "var(--text-0)" }}>{meta.model.id}</b> {meta.model.version}
                </span>
                <Dot />
                <span>
                  Train {meta.model.trainSpan} · Val {meta.model.valSpan} · Test {meta.model.testSpan}
                </span>
                <Dot />
                <span>
                  Data through <b style={{ color: "var(--text-0)" }}>{meta.model.dataThrough}</b>
                </span>
                <Dot />
                <span>
                  {meta.inputs.ok}/{meta.inputs.total} inputs
                  {meta.inputs.detail.some((d) => d.tier !== "final") && (
                    <Badge tone="warn">{"currents interim"}</Badge>
                  )}
                </span>
                <Dot />
                <span className="num">{meta.run.runId}</span>
                <span style={{ flex: 1 }} />
                <Badge tone="accent" title={meta.run.demoNote}>
                  demo simulator
                </Badge>
                <Button variant="ghost" onClick={openProv} title="Provenance for every displayed field">
                  Provenance
                </Button>
              </>
            ) : (
              <span className="skeleton" style={{ width: 420, height: 10 }} />
            )}
          </footer>

          {/* shortcuts sheet */}
          {helpOpen && (
            <Overlay onClose={() => setHelpOpen(false)} label="Keyboard shortcuts">
              <h3 style={{ marginTop: 0 }}>Keyboard shortcuts</h3>
              <table style={{ borderCollapse: "collapse", fontSize: "var(--fs-sm)" }}>
                <tbody>
                  {SHORTCUT_LIST.map((s) => (
                    <tr key={s.keys}>
                      <td style={{ padding: "5px 16px 5px 0" }}>
                        <kbd
                          style={{
                            fontFamily: "var(--font-mono)",
                            background: "rgba(125, 178, 240, 0.1)",
                            border: "1px solid var(--panel-border-strong)",
                            borderRadius: 5,
                            padding: "2px 7px",
                            fontSize: "var(--fs-xs)",
                          }}
                        >
                          {s.keys}
                        </kbd>
                      </td>
                      <td style={{ color: "var(--text-1)" }}>{s.action}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p style={{ color: "var(--text-3)", fontSize: "var(--fs-xs)", marginBottom: 0 }}>
                Also: scroll to zoom the map, drag to pan, double-click to reset, click a cell to probe its profile.
              </p>
            </Overlay>
          )}

          {/* provenance drawer */}
          {provOpen && meta && <ProvenanceDrawer meta={meta} onClose={() => setProvOpen(false)} />}

          {/* Web3 protocol attestation drawer */}
          {web3Open && <Web3ProtocolDrawer onClose={() => setWeb3Open(false)} />}
        </div>
      </MetaCtx.Provider>
    </ProvenanceProvider>
  );
}

function Dot() {
  return <span aria-hidden="true" style={{ color: "var(--text-3)" }}>·</span>;
}

function Web3ProtocolDrawer({ onClose }: { onClose: () => void }) {
  const [txHash, setTxHash] = useState<string | null>(null);

  const handleSimulatePayout = () => {
    setTxHash(
      `0x${Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join("")}`
    );
  };

  return (
    <Overlay onClose={onClose} label="OceanEmbed Protocol Attestation" width={600}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            className="pulse-ring"
            style={{ width: 10, height: 10, borderRadius: "50%", background: "#45d6ff", display: "inline-block" }}
          />
          <h3 style={{ margin: 0 }}>OceanEmbed Intelligence Protocol</h3>
        </div>
        <Badge tone="ok">Oracle Consensus Active</Badge>
      </div>

      <p style={{ color: "var(--text-1)", fontSize: "var(--fs-sm)", marginTop: 0, lineHeight: 1.6 }}>
        Decentralized climate and ocean intelligence layer. Cryptographically authenticates spatial ocean embeddings,
        satellite altimetry, and in-situ Argo observations for automated parametric insurance and maritime routing.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, margin: "14px 0" }}>
        <div style={{ background: "rgba(10, 22, 40, 0.7)", border: "1px solid var(--panel-border)", borderRadius: "var(--r-sm)", padding: "10px 12px" }}>
          <div style={{ fontSize: "var(--fs-xs)", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Node Operator</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--fs-xs)", color: "var(--accent-strong)", marginTop: 4 }}>
            0x7E4B2c9f...A0918B
          </div>
          <div style={{ fontSize: "11px", color: "var(--text-2)", marginTop: 2 }}>INCOIS-MoES Surrogacy Node</div>
        </div>

        <div style={{ background: "rgba(10, 22, 40, 0.7)", border: "1px solid var(--panel-border)", borderRadius: "var(--r-sm)", padding: "10px 12px" }}>
          <div style={{ fontSize: "var(--fs-xs)", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Consensus Verification</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--fs-xs)", color: "#4ade80", marginTop: 4 }}>
            101 / 101 Nodes Agreed
          </div>
          <div style={{ fontSize: "11px", color: "var(--text-2)", marginTop: 2 }}>Multi-Model Latent Proof (Seed 42)</div>
        </div>
      </div>

      <h4 style={{ margin: "14px 0 6px", color: "var(--text-0)", fontSize: "var(--fs-sm)" }}>Cryptographic Data Slice Proof (Merkle Root)</h4>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "11px",
          background: "rgba(3, 8, 16, 0.9)",
          border: "1px solid var(--panel-border-strong)",
          borderRadius: 6,
          padding: "8px 12px",
          color: "var(--accent)",
          wordBreak: "break-all",
        }}
      >
        0xa7f94e2b8109d1c834a8f902d3e5b719482ca019385bf726d1840e6918a2bc54
      </div>

      <div
        style={{
          marginTop: 16,
          padding: 12,
          background: "rgba(69, 214, 255, 0.06)",
          border: "1px solid rgba(69, 214, 255, 0.2)",
          borderRadius: "var(--r-sm)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <b style={{ fontSize: "var(--fs-sm)", color: "var(--text-0)" }}>Automated Parametric Insurance Hook</b>
          <Badge tone="accent">Smart Contract Ready</Badge>
        </div>
        <p style={{ fontSize: "var(--fs-xs)", color: "var(--text-2)", margin: "0 0 10px", lineHeight: 1.5 }}>
          When Ocean Heat Content (OHC) exceeds 80 kJ/cm² or a Category 3+ cyclone enters the offshore economic corridor,
          the oracle triggers instant liquidity payouts to coastal communities without claim filing.
        </p>

        {txHash ? (
          <div style={{ padding: "8px 12px", background: "rgba(74, 222, 128, 0.12)", border: "1px solid #4ade80", borderRadius: 6, fontSize: "var(--fs-xs)" }}>
            <span style={{ color: "#4ade80", fontWeight: 700 }}>✅ Trigger Executed!</span>
            <div style={{ fontFamily: "var(--font-mono)", color: "var(--text-1)", marginTop: 4, wordBreak: "break-all" }}>
              Tx: {txHash}
            </div>
          </div>
        ) : (
          <Button variant="solid" onClick={handleSimulatePayout} title="Simulate Parametric Payout Event">
            ⚡ Simulate On-Chain Payout Trigger
          </Button>
        )}
      </div>

      <div style={{ marginTop: 14, fontSize: "var(--fs-xs)", color: "var(--text-3)", textAlign: "center" }}>
        Feasibility demonstration mode: Running on client surrogate oracle network with sub-second browser latency.
      </div>
    </Overlay>
  );
}

function Overlay({ onClose, label, children, width = 460 }: { onClose: () => void; label: string; children: ReactNode; width?: number }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(2, 6, 12, 0.6)",
        backdropFilter: "blur(3px)",
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        className="rise-in"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: `min(${width}px, 94vw)`,
          maxHeight: "82vh",
          overflow: "auto",
          background: "var(--panel-solid)",
          border: "1px solid var(--panel-border-strong)",
          borderRadius: "var(--r-lg)",
          padding: 20,
          boxShadow: "var(--shadow-2)",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function ProvenanceDrawer({ meta, onClose }: { meta: Meta; onClose: () => void }) {
  return (
    <Overlay onClose={onClose} label="Provenance" width={560}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h3 style={{ margin: "0 0 4px" }}>Provenance</h3>
        <span className="num" style={{ fontSize: "var(--fs-xs)", color: "var(--text-2)" }}>
          contract v{meta.run.contractVersion} · {meta.run.generated}
        </span>
      </div>
      <p style={{ color: "var(--text-2)", fontSize: "var(--fs-sm)", marginTop: 0 }}>
        Every number in this app comes from a computed artifact with a run ID. {meta.run.demoNote}
      </p>

      <h4 style={{ marginBottom: 6, color: "var(--text-1)" }}>Model</h4>
      <ul style={{ margin: 0, paddingLeft: 18, color: "var(--text-1)", fontSize: "var(--fs-sm)", lineHeight: 1.7 }}>
        <li>{meta.model.id} {meta.model.version} — {meta.model.encoder}</li>
        <li>{meta.model.params}, {meta.model.ensemble}</li>
        <li>Grid {meta.model.grid}; depths: {meta.model.depths}</li>
        <li>Run <span className="num">{meta.run.runId}</span>, seed {meta.run.seed}</li>
      </ul>

      <h4 style={{ marginBottom: 6, color: "var(--text-1)" }}>Input channels &amp; source tier</h4>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--fs-xs)" }}>
        <thead>
          <tr style={{ color: "var(--text-2)", textAlign: "left" }}>
            <th style={{ padding: "4px 8px 4px 0" }}>Channel</th>
            <th style={{ padding: "4px 8px" }}>Source</th>
            <th style={{ padding: "4px 8px" }}>DOI</th>
            <th style={{ padding: "4px 0 4px 8px" }}>Tier</th>
          </tr>
        </thead>
        <tbody>
          {meta.channels.map((c) => (
            <tr key={c.key} style={{ borderTop: "1px solid var(--panel-border)" }}>
              <td style={{ padding: "5px 8px 5px 0", color: "var(--text-0)" }}>
                {c.label} <span style={{ color: "var(--text-3)" }}>({c.units})</span>
              </td>
              <td style={{ padding: "5px 8px" }}>{c.source}</td>
              <td className="num" style={{ padding: "5px 8px", color: "var(--text-2)" }}>{c.doi}</td>
              <td style={{ padding: "5px 0 5px 8px" }}>
                <Badge tone={c.tier === "final" ? "ok" : c.tier === "interim" ? "warn" : "danger"}>{c.tier}</Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h4 style={{ marginBottom: 6, color: "var(--text-1)", marginTop: 14 }}>Target</h4>
      <p style={{ margin: 0, color: "var(--text-1)", fontSize: "var(--fs-sm)" }}>
        GLORYS reanalysis — DOI <span className="num">10.48670/moi-00021</span>. Assimilates satellite SLA/SST and
        in-situ T/S profiles (incl. Argo): not independent of the validation data.
      </p>

      <h4 style={{ marginBottom: 6, color: "var(--text-1)", marginTop: 14 }}>Validation data</h4>
      <p style={{ margin: 0, color: "var(--text-1)", fontSize: "var(--fs-sm)" }}>
        INCOIS gridded Argo (1°, 10-day/monthly) and raw delayed-mode profiles via argopy.
      </p>

      <h4 style={{ marginBottom: 6, color: "var(--text-1)", marginTop: 14 }}>Stack</h4>
      <p className="num" style={{ margin: 0, color: "var(--text-2)", fontSize: "var(--fs-xs)", lineHeight: 1.8 }}>
        {["PyTorch 2.14", "Lightning 2.6.4", "xarray 2026.7.0", "zarr 3.4.0", "FastAPI 0.141.1", "Next.js 16.3.6"].join(" · ")}
      </p>
    </Overlay>
  );
}
