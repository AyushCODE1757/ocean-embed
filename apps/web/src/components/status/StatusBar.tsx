import type { Meta } from "@/lib/api-client";

export function StatusBar({ meta, error }: { meta?: Meta; error?: string }) {
  if (error) {
    return (
      <div role="alert" className="status status-error">
        Cannot reach data: {error}. Check that the API is running and the data is built, then reload.
      </div>
    );
  }
  if (!meta) return <div role="status" aria-live="polite" className="status">Loading model status…</div>;
  return (
    <div role="status" aria-live="polite" className="status">
      Model {meta.provenance.model_id} · run {meta.provenance.run_id} · data through{" "}
      {meta.data_through ?? "n/a"} · inputs: {meta.provenance.source_tier}
    </div>
  );
}
