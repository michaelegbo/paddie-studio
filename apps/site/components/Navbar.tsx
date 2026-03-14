"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@paddie-studio/ui";
import { LaunchStudioButton } from "./LaunchStudioButton";

const links = [
  { href: "/features", label: "Features" },
  { href: "/pricing", label: "Pricing" },
  { href: "/docs", label: "Docs" },
  { href: "/download", label: "Download" },
];

export function Navbar() {
  const pathname = usePathname();

  return (
    <header className="nav">
      <div className="container nav-inner">
        <Link href="/" className="brand-lockup" aria-label="Paddie Studio Home">
          <Logo width={88} height={25} />
          <span className="brand-labels">
            <span className="brand-sub">Paddie Product</span>
            <span className="brand-main">Studio</span>
          </span>
        </Link>

        <nav className="nav-links" aria-label="Primary navigation">
          {links.map((link) => {
            const active = pathname === link.href;
            return (
              <Link key={link.href} href={link.href} className={`nav-link${active ? " active" : ""}`}>
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="nav-cta nav-links">
          <Link href="/login" className="nav-auth">
            Login
          </Link>
          <LaunchStudioButton className="button-lift" />
        </div>
      </div>
    </header>
  );
}

