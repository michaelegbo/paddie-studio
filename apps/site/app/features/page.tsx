import { Footer } from "../../components/Footer";
import { Navbar } from "../../components/Navbar";
import ShowcaseGallery from "../../components/ShowcaseGallery";

const featureBlocks = [
  {
    title: "Visual Workflow Canvas",
    body: "Drag nodes, connect branches, and watch execution move edge-to-edge with trace playback.",
  },
  {
    title: "No-Code Data Mapping",
    body: "Map webhook/chat fields into URLs, headers, and bodies with suggestions and variable helpers.",
  },
  {
    title: "AI + Orchestrator Nodes",
    body: "Use GPT-4.1 system mode or bring-your-own keys for OpenAI/Azure OpenAI/Groq model execution.",
  },
  {
    title: "Paddie Memory Node",
    body: "Route, store, and search memory in conversation mode with authenticated user context.",
  },
  {
    title: "Flow History + Snapshots",
    body: "Save revisions, inspect prior runs, and restore previous versions from history quickly.",
  },
  {
    title: "Code Export + StackBlitz",
    body: "Generate JavaScript/Python clients and open instant StackBlitz demos for webhook execution.",
  },
];

export default function FeaturesPage() {
  return (
    <main>
      <Navbar />
      <section className="section">
        <div className="container">
          <div className="section-head">
            <h2>Built For Non-Technical Teams and Power Users</h2>
            <p>
              Paddie Studio keeps no-code defaults first, while still supporting advanced configuration for
              engineers who need deeper control.
            </p>
          </div>
          <div className="feature-grid">
            {featureBlocks.map((feature) => (
              <article key={feature.title} className="card">
                <strong>{feature.title}</strong>
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
