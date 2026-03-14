import { Button } from "@paddie-studio/ui";
import { Footer } from "../../components/Footer";
import { Navbar } from "../../components/Navbar";

const downloads = [
  {
    name: "Windows",
    file: "Paddie-Studio-Setup.exe",
    href: "https://github.com/paddieai/paddie-studio/releases/latest",
    notes: ["Install signed setup package", "OIDC login via system browser", "Secure session in OS keychain"],
  },
  {
    name: "macOS",
    file: "Paddie-Studio.dmg",
    href: "https://github.com/paddieai/paddie-studio/releases/latest",
    notes: ["Native DMG installer", "Deep-link callback studio://auth/callback", "Online-first cloud runtime"],
  },
  {
    name: "Linux",
    file: "Paddie-Studio.AppImage",
    href: "https://github.com/paddieai/paddie-studio/releases/latest",
    notes: ["Portable AppImage binary", "Same hosted backend and auth flow", "No local secret exposure"],
  },
];

export default function DownloadPage() {
  return (
    <main>
      <Navbar />
      <section className="hero">
        <div className="container">
          <div className="section-head fade-up">
            <span className="hero-eyebrow">Desktop</span>
            <h1 className="hero-title" style={{ maxWidth: "16ch" }}>
              Download Paddie Studio For Desktop
            </h1>
            <p className="hero-subtitle">
              The desktop shell uses the same Studio backend and starts from login by default.
              Installers are published through GitHub Releases.
            </p>
          </div>

          <div className="download-grid">
            {downloads.map((item, index) => (
              <article key={item.name} className={`download-card fade-up delay-${Math.min(index + 1, 3)}`}>
                <h3>{item.name}</h3>
                <p>{item.file}</p>
                <ul className="steps-list">
                  {item.notes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
                <div style={{ marginTop: 16 }}>
                  <a href={item.href} target="_blank" rel="noreferrer">
                    <Button className="button-lift">Download</Button>
                  </a>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
      <Footer />
    </main>
  );
}

