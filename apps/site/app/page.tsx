import Link from "next/link";
import { Button } from "@paddie-studio/ui";
import { Navbar } from "../components/Navbar";
import { Footer } from "../components/Footer";
import { LaunchStudioButton } from "../components/LaunchStudioButton";
import ShowcaseGallery from "../components/ShowcaseGallery";

const metrics = [
  { value: "10+", label: "Node types in v1" },
  { value: "2", label: "Output modes: webhook + chat" },
  { value: "JS/Py", label: "Generated client languages" },
  { value: "1 click", label: "StackBlitz demo launch" },
];

const capabilities = [
  {
    kicker: "No-Code First",
    title: "Visual Mapping That Feels Native",
    body: "Map fields from trigger data directly into URL, body, and node configs with inline variable suggestions.",
  },
  {
    kicker: "Orchestration",
    title: "AI + Tools + Memory",
    body: "Connect orchestrator and AI nodes to HTTP, memory, and loop nodes to answer and act in multi-step flows.",
  },
  {
    kicker: "Execution",
    title: "Trace Every Step",
    body: "Run full flows or individual nodes, inspect traces, then restore from history snapshots when needed.",
  },
];

const shippingFlow = [
  {
    title: "Design",
    body: "Drop trigger and action nodes on canvas and wire branches for conditional or loop execution.",
  },
  {
    title: "Configure",
    body: "Open node modals to edit settings without code, including HTTP methods, memory mode, and AI provider.",
  },
  {
    title: "Validate",
    body: "Use node-level tests and full-run traces to verify payloads and outputs before publishing.",
  },
  {
    title: "Publish",
    body: "Expose webhook URL, invoke from your backend, or export JavaScript/Python snippets instantly.",
  },
];

export default function HomePage() {
  return (
    <main>
      <Navbar />

      <section className="hero">
        <div className="container hero-grid">
          <div className="fade-up">
            <span className="hero-eyebrow">Paddie Studio • Visual API Orchestration</span>
            <h1 className="hero-title">Build API workflows visually. Ship them everywhere.</h1>
            <p className="hero-subtitle">
              Studio keeps the Paddie dark product language while giving non-technical teams a clean no-code
              builder for webhooks, AI, memory, mapping, and run history.
            </p>

            <div className="hero-cta-row">
              <LaunchStudioButton className="button-lift" />
              <Link href="/download">
                <Button variant="ghost">Download Desktop</Button>
              </Link>
            </div>

            <div className="metrics-grid fade-up delay-1">
              {metrics.map((metric) => (
                <article key={metric.label} className="metric-card">
                  <span className="metric-value">{metric.value}</span>
                  <span className="metric-label">{metric.label}</span>
                </article>
              ))}
            </div>
          </div>

          <div className="board-shell fade-up delay-2">
            <div className="board-grid">
              <span className="board-path" style={{ left: 128, top: 110, width: 146, transform: "rotate(14deg)" }} />
              <span className="board-path" style={{ left: 302, top: 208, width: 162, transform: "rotate(7deg)" }} />
              <span className="board-path" style={{ left: 304, top: 208, width: 178, transform: "rotate(46deg)" }} />

              <article className="board-node" style={{ left: 38, top: 68 }}>
                <small>Trigger</small>
                <strong>Webhook</strong>
                <p>POST /api/webhooks/flow/token</p>
              </article>

              <article className="board-node ai" style={{ left: 250, top: 160, animationDelay: "90ms" }}>
                <small>Inference</small>
                <strong>AI Node</strong>
                <p>Provider: GPT-4.1 (Paddie system)</p>
              </article>

              <article className="board-node memory" style={{ left: 475, top: 202, animationDelay: "160ms" }}>
                <small>Context</small>
                <strong>Memory Router</strong>
                <p>Conversation mode with user context</p>
              </article>

              <article className="board-node output" style={{ left: 484, top: 332, animationDelay: "230ms" }}>
                <small>Result</small>
                <strong>Output Node</strong>
                <p>JSON payload + code export</p>
              </article>
            </div>
          </div>
        </div>
      </section>

      <section className="section soft">
        <div className="container">
          <div className="section-head fade-up">
            <h2>Backend Infrastructure Layer, But Visual</h2>
            <p>
              The standalone Studio app keeps orchestration power high while making setup and edits easy
              enough for non-programmers.
            </p>
          </div>
          <div className="card-grid">
            {capabilities.map((item, index) => (
              <article key={item.title} className={`surface-card fade-up delay-${Math.min(index + 1, 3)}`}>
                <p className="surface-kicker">{item.kicker}</p>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <ShowcaseGallery />

      <section className="section">
        <div className="container">
          <div className="section-head fade-up">
            <h2>From Design To Production In Four Steps</h2>
            <p>
              Studio is built to go from idea to executable API flow quickly, without losing control over advanced options.
            </p>
          </div>

          <div className="timeline-grid">
            {shippingFlow.map((item, index) => (
              <article key={item.title} className={`timeline-item fade-up delay-${Math.min(index + 1, 3)}`}>
                <span className="timeline-step">0{index + 1}</span>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </article>
            ))}
          </div>

          <div className="cta-band fade-up delay-2">
            <div>
              <h3>Launch Studio on web or desktop with the same backend.</h3>
              <p>Use OIDC login, keep user-scoped memory context, and export working code clients.</p>
            </div>
            <div className="hero-cta-row">
              <LaunchStudioButton className="button-lift" />
              <Link href="/docs">
                <Button variant="ghost">Read Docs</Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}

