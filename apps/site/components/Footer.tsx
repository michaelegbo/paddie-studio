import Link from "next/link";

export function Footer() {
  return (
    <footer>
      <div className="container footer-inner">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontWeight: 700 }}>Paddie Studio</span>
          <span style={{ color: "#9B9DB3" }}>Visual workflows for AI operations</span>
        </div>
        <div className="footer-links">
          <Link href="/pricing">Pricing</Link>
          <Link href="/docs">Docs</Link>
          <Link href="/download">Download</Link>
          <Link href="/login">Login</Link>
        </div>
      </div>
    </footer>
  );
}
