import type { Metadata } from "next";
import Nav from "@/components/Nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "OceanEmbed — the Indian Ocean, below the surface",
  description:
    "Daily subsurface ocean temperature at 15 depths (0–1000 m) across the North Indian Ocean, reconstructed from satellite surface observations with a masked-autoencoder embedding — validated against Argo floats.",
  icons: { icon: "/logo.png", apple: "/logo.png" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <Nav />
          <main className="main">{children}</main>
          <footer className="footer">
            <div className="container col" style={{ gap: 14 }}>
              <div className="spread wrap" style={{ gap: "var(--s4)" }}>
                <div className="row" style={{ gap: 10 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/logo.png" alt="OceanEmbed logo" style={{ width: 34, height: 34 }} />
                  <div>
                    <b>OceanEmbed</b>
                    <div className="tiny">© 2026 The OceanEmbed team · Smart India Hackathon 26066 · Code: MIT</div>
                  </div>
                </div>
                <div className="tiny" style={{ textAlign: "right" }}>
                  Data: © Copernicus Marine (CMEMS) · NASA PO.DAAC · Met Office OSTIA · NOAA NCEI IBTrACS ·
                  Argo (argopy) — used under the providers' public access terms.
                </div>
              </div>
              <div className="tiny" style={{ opacity: 0.75 }}>
                Every number served is computed from real observations and hashed into the run manifest —
                see <a href="/about">About</a> for provenance, sources and limitations.
              </div>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
