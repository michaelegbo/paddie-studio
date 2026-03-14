import Link from "next/link";
import { Button, Logo } from "@paddie-studio/ui";

export function Navbar() {
  return (
    <div className="nav">
      <div className="container nav-inner">
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Logo />
          <span style={{ fontWeight: 700 }}>Studio</span>
        </Link>
        <div className="nav-links">
          <Link href="/features">Features</Link>
          <Link href="/pricing">Pricing</Link>
          <Link href="/docs">Docs</Link>
          <Link href="/download">Download</Link>
        </div>
        <div className="nav-links">
          <Link href="/login">Login</Link>
          <Link href="/app"><Button>Launch Studio</Button></Link>
        </div>
      </div>
    </div>
  );
}
