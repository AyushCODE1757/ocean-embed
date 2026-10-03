import type { Metadata } from "next";
import Nav from "@/components/Nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "OceanEmbed — the Indian Ocean, below the surface",
  description:
    "Daily subsurface ocean temperature at 15 depths (0–1000 m) across the North Indian Ocean, reconstructed from satellite surface observations with a masked-autoencoder embedding — validated against Argo floats.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <Nav />
          <main className="main">{children}</main>
          <footer className="footer">
            <div className="container spread wrap">
              <div>
                OceanEmbed · Smart India Hackathon 26066 ·{" "}
                <a
                  href="https://www.ncei.noaa.gov/products/international-best-track-archive"
                  target="_blank"
                  rel="noreferrer"
                >
                  Data: CMEMS, NASA PO.DAAC, NOAA NCEI, Argo
                </a>
              </div>
              <div>
                Every number served is computed from real observations — see{" "}
                <a href="/about">About</a>.
              </div>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
