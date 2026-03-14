import Link from "next/link";
import { Button } from "@paddie-studio/ui";
import { Footer } from "../../components/Footer";
import { Navbar } from "../../components/Navbar";

const docsSections = [
  {
    title: "Quick Start",
    body: "Create a flow, add trigger + action nodes, run tests, and publish your webhook endpoint in minutes.",
  },
  {
    title: "Mapping and Data Flow",
    body: "Use source suggestions and template variables to map fields between nodes without editing raw JSON.",
  },
  {
    title: "AI + Orchestrator",
    body: "Configure system GPT-4.1 or BYO providers, then route tool calls to HTTP and memory nodes.",
  },
  {
    title: "Memory Integration",
    body: "Use the memory node in conversation mode by default with authenticated user context.",
  },
  {
    title: "Run History",
    body: "Inspect execution traces, compare snapshots, and restore prior flow states directly from history.",
  },
  {
    title: "Code Generation",
    body: "Generate JavaScript and Python clients plus StackBlitz projects from any published flow.",
  },
];

export default function DocsPage() {
  return (
    <main>
      <Navbar />
      <section className="hero">
        <div className="container">
          <div className="section-head fade-up">
            <span className="hero-eyebrow">Documentation</span>
            <h1 className="hero-title" style={{ maxWidth: "16ch" }}>
              Build, Test, and Ship Flows With Predictable Behavior
            </h1>
            <p className="hero-subtitle">
              The docs are focused on practical flow authoring and integration, not abstract theory.
            </p>
          </div>

          <div className="docs-grid">
            {docsSections.map((section, index) => (
              <article key={section.title} className={`docs-card fade-up delay-${Math.min(index + 1, 3)}`}>
                <h3>{section.title}</h3>
                <p>{section.body}</p>
              </article>
            ))}
          </div>

          <div className="code-sample fade-up delay-2">
            <code>{`// Studio webhook call (JavaScript)
const response = await fetch("https://studio.paddie.io/api/webhooks/<flowId>/<token>", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ message: "hello from studio" })
});

const result = await response.json();
console.log(result);`}</code>
          </div>

          <div className="hero-cta-row" style={{ marginTop: 24 }}>
            <Link href="/login">
              <Button>Launch Studio</Button>
            </Link>
            <Link href="https://github.com/paddieai/paddie-studio" target="_blank" rel="noreferrer">
              <Button variant="ghost">GitHub Repository</Button>
            </Link>
          </div>
        </div>
      </section>
      <Footer />
    </main>
  );
}

