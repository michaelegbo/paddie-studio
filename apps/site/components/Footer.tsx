import Link from "next/link";
import { Logo } from "@paddie-studio/ui";

export function Footer() {
  return (
    <footer className="footer">
      <div className="container footer-inner">
        <div className="footer-grid">
          <section className="footer-brand">
            <Logo width={95} height={27} />
            <p>
              Paddie Studio is the visual automation layer for APIs, memory, and AI orchestration,
              built for both no-code operators and engineering teams.
            </p>
          </section>

          <section className="footer-links">
            <h4>Product</h4>
            <nav>
              <Link href="/features">Features</Link>
              <Link href="/pricing">Pricing</Link>
              <Link href="/download">Desktop</Link>
              <Link href="/docs">Docs</Link>
            </nav>
          </section>

          <section className="footer-links">
            <h4>Company</h4>
            <nav>
              <Link href="https://paddie.io" target="_blank" rel="noreferrer">
                paddie.io
              </Link>
              <Link href="https://app.paddie.io" target="_blank" rel="noreferrer">
                Paddie App
              </Link>
              <Link href="https://github.com/paddieai/paddie-studio" target="_blank" rel="noreferrer">
                Open Source
              </Link>
              <Link href="/login">Launch Studio</Link>
            </nav>
          </section>
        </div>

        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} Paddie Studio. All rights reserved.</span>
          <span>Built to mirror the Paddie product language.</span>
        </div>
      </div>
    </footer>
  );
}

