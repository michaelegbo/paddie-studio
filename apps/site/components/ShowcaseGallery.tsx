import Image from "next/image";

interface ShowcaseItem {
  title: string;
  description: string;
  src: string;
}

const showcaseItems: ShowcaseItem[] = [
  {
    title: "Canvas View",
    description: "Build complete webhook-to-output automations visually with clear execution movement.",
    src: "/media/studio-canvas-demo.svg",
  },
  {
    title: "Node Modal Editor",
    description: "Configure requests, memory actions, and mappings with guided no-code controls.",
    src: "/media/studio-node-editor.svg",
  },
  {
    title: "Chat Orchestrator",
    description: "Run conversational workflows that call tools and memory before producing a final answer.",
    src: "/media/studio-chat-orchestrator.svg",
  },
];

export default function ShowcaseGallery() {
  return (
    <section className="section soft">
      <div className="container">
        <div className="section-head fade-up">
          <h2>Inside The Builder</h2>
          <p>
            Studio ships with the same dark, high-contrast Paddie visual style while keeping node
            operations simple for non-technical users.
          </p>
        </div>
        <div className="showcase-grid">
          {showcaseItems.map((item, index) => (
            <article key={item.title} className={`showcase-card fade-up delay-${Math.min(index + 1, 3)}`}>
              <div className="showcase-media">
                <Image src={item.src} alt={item.title} fill sizes="(max-width: 1060px) 100vw, 33vw" />
              </div>
              <div className="showcase-copy">
                <h3>{item.title}</h3>
                <p>{item.description}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

