"use client";

import { useEffect, useState } from "react";
import { cachedMeta, type Meta } from "@/lib/api-client";

/* Shared data-state fetcher: one hook pages use to get meta + error state. */
export function useMeta() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let on = true;
    cachedMeta()
      .then((m) => on && setMeta(m))
      .catch((e) => on && setError(String(e?.message ?? e)));
    return () => { on = false; };
  }, []);
  return { meta, error };
}

export function DataState({ error }: { error?: string | null }) {
  if (!error) return null;
  return (
    <div className="container" style={{ paddingTop: 24 }}>
      <div className="note bad" role="alert">
        <b>Cannot reach the data API.</b> {error}
        <br />
        Start it locally with <code>make artifacts</code> then <code>make serve</code>, or{" "}
        <code>docker compose -f infra/docker-compose.yml up</code>. No sample data is shown — this
        project never fakes numbers.
      </div>
    </div>
  );
}
