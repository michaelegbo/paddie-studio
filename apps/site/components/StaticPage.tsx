import { Navbar } from "./Navbar";
import { Footer } from "./Footer";

export default function StaticPage({ title, description }: { title: string; description: string }) {
  return (
    <main>
      <Navbar />
      <section className="section">
        <div className="container">
          <div className="section-head">
            <h2>{title}</h2>
            <p>{description}</p>
          </div>
        </div>
      </section>
      <Footer />
    </main>
  );
}
