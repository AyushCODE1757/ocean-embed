import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "OceanEmbed — Subsurface temperature, North Indian Ocean",
  description:
    "Satellite-embedding reconstruction of daily 0.25° subsurface temperature at 15 depths across the North Indian Ocean, with uncertainty, Argo validation and an Argo deployment advisor.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
