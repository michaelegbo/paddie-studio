import Link from "next/link";
import { Button } from "@paddie-studio/ui";
import { Footer } from "../../components/Footer";
import { Navbar } from "../../components/Navbar";

const docsSections = [
  {
    title: "Quick Start",
    points: [
      "Create a flow and add a webhook trigger node.",
      "Add HTTP, AI, memory, and output nodes.",
      "Open node modal editors and map fields using variable suggestions.",
      "Run test, inspect trace, and publish webhook URL.",
    ],
  },
  {
    title: "AI + Memory",
    points: [
      "Use Paddie GPT-4.1 system provider or bring your own API key.",
      "Set memory mode to conversation for store/retrieve routing by default.",
      "Connect orchestrator node to tool nodes for multi-step answers.",
      "Use chat trigger for conversational workflows.",
    ],
  },
  {
    title: "Code Export",
    points: [
      "Generate JavaScript client code for webhook integration.",
      "Generate Python script equivalents for backend jobs.",
      "Open StackBlitz payload for instant demo and sharing.",
      "Persist generated artifacts from Studio backend for retrieval.",
    ],
  },
];

export default function DocsPage() {
  return (
    <main>
      <Navbar />
      <section className="section">
        <div className="container">
          <div className="section-head">
            <h2>Studio Docs</h2>
            <p>Core implementation and usage guide for building, testing, and shipping workflows.</p>
          </div>
          <div className="feature-grid">
            {docsSections.map((section) => (
              <article key={section.title} className="card">
                <strong>{section.title}</strong>
                <ul className="list-clean">
                  {section.points.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
          <div className="hero-actions" style={{ marginTop: 26 }}>
            <Link href="/login">
              <Button>Launch Studio</Button>
            </Link>
            <Link href="https://github.com/paddieai/paddie-studio" target="_blank" rel="noreferrer">
              <Button variant="ghost">View Open-Source Repo</Button>
            </Link>
          </div>
        </div>
      </section>
      <Footer />
    </main>
  );
}
