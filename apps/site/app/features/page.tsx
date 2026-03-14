import { Footer } from "../../components/Footer";
import { Navbar } from "../../components/Navbar";
import ShowcaseGallery from "../../components/ShowcaseGallery";

const features = [
  {
    kicker: "Triggers",
    title: "Webhook and Chat Entry Points",
    body: "Start flows from backend webhooks or conversational chat input with user context and metadata.",
  },
  {
    kicker: "Integrations",
    title: "HTTP and WebSocket Nodes",
    body: "Call REST APIs, map dynamic paths, and work with real-time WebSocket endpoints in one board.",
  },
  {
    kicker: "Control",
    title: "If/Else and Loop Nodes",
    body: "Branch logic with visual conditions, iterate lists safely, and route outputs through explicit handles.",
  },
  {
    kicker: "Intelligence",
    title: "AI and Orchestrator Nodes",
    body: "Run direct inference or multi-tool orchestrations with GPT-4.1 system mode and BYO provider keys.",
  },
  {
    kicker: "Memory",
    title: "Paddie Memory Connector",
    body: "Store and retrieve memory using authenticated user context with conversation mode as default behavior.",
  },
  {
    kicker: "Delivery",
    title: "Codegen + StackBlitz",
    body: "Generate JavaScript/Python clients and open instant StackBlitz demos for fast sharing and validation.",
  },
];

export default function FeaturesPage() {
  return (
    <main>
      <Navbar />

      <section className="hero">
        <div className="container">
          <div className="section-head fade-up">
            <span className="hero-eyebrow">Feature Surface</span>
            <h1 className="hero-title" style={{ maxWidth: "17ch" }}>
              Everything Needed To Build Agentic API Flows Visually
            </h1>
            <p className="hero-subtitle">
              Studio combines orchestration, memory, AI, and integration nodes in one interface while keeping
              each node editable through guided modals.
            </p>
          </div>

          <div className="card-grid">
            {features.map((feature, index) => (
              <article key={feature.title} className={`surface-card fade-up delay-${Math.min(index + 1, 3)}`}>
                <p className="surface-kicker">{feature.kicker}</p>
                <h3>{feature.title}</h3>
                <p>{feature.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <ShowcaseGallery />
      <Footer />
    </main>
  );
}

