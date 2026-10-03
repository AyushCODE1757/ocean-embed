import Link from "next/link";
import type { ReactNode } from "react";

export const metadata = { title: "OceanEmbed", description: "Subsurface temperature, North Indian Ocean" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif" }}>
        <nav aria-label="Main" style={{ display: "flex", gap: 16, padding: "8px 16px" }}>
          <Link href="/">Explorer</Link>
          <Link href="/validation">Validation</Link>
          <Link href="/advisor">Advisor</Link>
        </nav>
        {children}
      </body>
    </html>
  );
}
