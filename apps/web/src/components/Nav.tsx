"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/explorer", label: "Explorer" },
  { href: "/compare", label: "Compare" },
  { href: "/section", label: "Section" },
  { href: "/cyclone", label: "Cyclones" },
  { href: "/validation", label: "Validation" },
  { href: "/advisor", label: "Advisor" },
  { href: "/about", label: "About" },
];

export default function Nav() {
  const pathname = usePathname() ?? "/";
  return (
    <header className="nav">
      <div className="nav-inner">
        <Link href="/" className="brand">
          <span className="brand-dot" aria-hidden />
          OceanEmbed
          <span className="brand-sub">SIH26066</span>
        </Link>
        <nav className="nav-links" aria-label="Primary">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="nav-link"
              data-active={pathname.startsWith(l.href)}
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
