import Image from 'next/image';

interface ShowcaseItem {
  title: string;
  description: string;
  src: string;
}

const showcaseItems: ShowcaseItem[] = [
  {
    title: 'Visual Builder Canvas',
    description: 'Build flows with webhook, AI, memory, loop, and output nodes while seeing trace playback in real time.',
    src: '/media/studio-canvas-demo.svg',
  },
  {
    title: 'No-Code Node Editor',
    description: 'Configure HTTP, memory, and mapping fields with suggestions and drag/drop variables without writing code.',
    src: '/media/studio-node-editor.svg',
  },
  {
    title: 'Chat + Orchestrator',
    description: 'Chat with orchestrated AI flows that can call connected HTTP and memory tools and reply with context.',
    src: '/media/studio-chat-orchestrator.svg',
  },
];

export default function ShowcaseGallery() {
  return (
    <section className="section">
      <div className="container">
        <div className="section-head">
          <h2>Studio In Action</h2>
          <p>
            These captures come from the standalone Studio flow builder and show the canvas,
            modal editing, and orchestrator chat workflow.
          </p>
        </div>
        <div className="showcase-grid">
          {showcaseItems.map((item) => (
            <article key={item.title} className="showcase-card">
              <div className="showcase-media">
                <Image src={item.src} alt={item.title} fill sizes="(max-width: 900px) 100vw, 33vw" />
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
