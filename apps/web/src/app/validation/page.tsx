"use client";
import { useEffect, useMemo, useState } from "react";
import { api, type Metrics } from "@/lib/api-client";

const BASINS = ["all", "Arabian Sea", "Bay of Bengal", "Equatorial"];

export default function Validation() {
  const [data, setData] = useState<Metrics>();
  const [error, setError] = useState<string>();
  const [basin, setBasin] = useState("all");
  const [method, setMethod] = useState("");

  useEffect(() => {
    api.metrics().then(setData).catch((e) => setError(e.message));
  }, []);

  const methods = useMemo(() => [...new Set(data?.rows.map((r) => r.method))], [data]);
  const rows = data?.rows.filter(
    (r) => r.basin === basin && r.season === "all" && (!method || r.method === method),
  );
  const f = (v: number | null) => (v === null ? "–" : v.toFixed(3));

  return (
    <main style={{ padding: 16 }}>
      <h1>Validation</h1>
      <p role="note">
        Argo is not fully independent: the training target (GLORYS) and some inputs assimilate Argo
        data. Compare our skill with the reference lines below, not with a perfect score.
      </p>
      {error && <p role="alert">Metrics unavailable: {error}. Run the evaluation step, then reload.</p>}
      {!data && !error && <p role="status">Loading metrics…</p>}
      {data && (
        <>
          <p>Run {data.run_id} · test years {data.test_years.join(", ")}</p>
          {data.independence_note && <p role="note">{data.independence_note}</p>}
          <label>Basin
            <select value={basin} onChange={(e) => setBasin(e.target.value)}>
              {BASINS.map((b) => <option key={b}>{b}</option>)}
            </select>
          </label>
          <label> Method
            <select value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="">all</option>
              {methods.map((m) => <option key={m}>{m}</option>)}
            </select>
          </label>
          {rows && rows.length === 0 && <p>No rows for this selection.</p>}
          <table>
            <thead><tr><th>Method</th><th>Depth (m)</th><th>RMSE</th><th>Bias</th><th>Corr</th><th>N</th></tr></thead>
            <tbody>
              {rows?.map((r) => (
                <tr key={`${r.method}-${r.depth_m}`}>
                  <td>{r.method}</td><td>{r.depth_m}</td>
                  <td>{f(r.rmse)}</td><td>{f(r.bias)}</td><td>{f(r.corr)}</td><td>{r.n}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </main>
  );
}
