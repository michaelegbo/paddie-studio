import Link from "next/link";
import { Button } from "@paddie-studio/ui";
import { Navbar } from "../components/Navbar";
import { Footer } from "../components/Footer";

export default function HomePage() {
  return (
    <main>
      <Navbar />
      <section className="hero">
        <div className="container hero-grid">
          <div>
            <div className="badge">Visual orchestration for AI agents, memory, and webhooks</div>
            <h1>Build AI workflows visually and ship them to web, code, or desktop.</h1>
            <p>Paddie Studio turns webhooks, memory, AI inference, orchestration, and API calls into a visual builder with live execution traces and generated code.</p>
            <div className="hero-actions" style={{ marginTop: 22 }}>
              <Link href="/app"><Button>Launch Studio</Button></Link>
              <Link href="/download"><Button variant="ghost">Download Desktop</Button></Link>
            </div>
            <div className="stats-grid" style={{ marginTop: 28 }}>
              <div className="stat"><strong>Webhook + Chat</strong><p>Start flows from code or conversation.</p></div>
              <div className="stat"><strong>Memory + AI</strong><p>Use current Paddie memory and GPT-4.1.</p></div>
              <div className="stat"><strong>Execution Trace</strong><p>See data move node to node.</p></div>
              <div className="stat"><strong>Code Export</strong><p>Generate JavaScript or Python.</p></div>
            </div>
          </div>
          <div className="preview card">
            <div className="preview-canvas">
              <div className="node" style={{ top: 32, left: 28 }}>Webhook</div>
              <div className="node" style={{ top: 112, left: 180 }}>AI</div>
              <div className="node" style={{ top: 230, left: 96 }}>Memory</div>
              <div className="node" style={{ top: 226, left: 286 }}>Output</div>
            </div>
          </div>
        </div>
      </section>
      <section className="section">
        <div className="container">
          <div className="section-head">
            <h2>Everything from the current Studio, separated properly.</h2>
            <p>Website, app, API, and Electron ship as one product. The builder remains focused on no-code flow authoring while the Paddie connectors handle auth, memory, and system AI.</p>
          </div>
          <div className="feature-grid">
            <div className="card"><strong>Visual Builder</strong><p>Modal-first node editing, mapping, run history, and traces.</p></div>
            <div className="card"><strong>AI Orchestration</strong><p>Use AI nodes, orchestrator nodes, and connected APIs in one board.</p></div>
            <div className="card"><strong>Desktop Delivery</strong><p>Electron app opens to login and talks to the same hosted backend.</p></div>
          </div>
        </div>
      </section>
      <Footer />
    </main>
  );
}
