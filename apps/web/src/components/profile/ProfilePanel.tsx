import type { Profile } from "@/lib/api-client";

export function ProfilePanel({ profile }: { profile?: Profile }) {
  if (!profile) return <p>Click the map to see the reconstructed temperature profile at that point.</p>;
  return (
    <table aria-label="Reconstructed temperature profile">
      <caption>
        {profile.lat.toFixed(2)}°N, {profile.lon.toFixed(2)}°E on {profile.date}
      </caption>
      <thead><tr><th>Depth (m)</th><th>Temp (°C)</th><th>± spread</th></tr></thead>
      <tbody>
        {profile.depths_m.map((d, i) => (
          <tr key={d}>
            <td>{d}</td>
            <td>{profile.mean[i]?.toFixed(2) ?? "–"}</td>
            <td>{profile.spread[i]?.toFixed(2) ?? "–"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
