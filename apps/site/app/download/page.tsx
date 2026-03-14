import { Navbar } from '../../components/Navbar';
import { Footer } from '../../components/Footer';
import { Button } from '@paddie-studio/ui';

const downloads = [
  {
    name: 'Windows',
    file: 'Paddie-Studio-Setup.exe',
    href: 'https://github.com/paddieai/paddie-studio/releases/latest',
  },
  {
    name: 'macOS',
    file: 'Paddie-Studio.dmg',
    href: 'https://github.com/paddieai/paddie-studio/releases/latest',
  },
  {
    name: 'Linux',
    file: 'Paddie-Studio.AppImage',
    href: 'https://github.com/paddieai/paddie-studio/releases/latest',
  },
];

export default function DownloadPage() {
  return (
    <main>
      <Navbar />
      <section className="section">
        <div className="container">
          <div className="section-head">
            <h2>Download Paddie Studio Desktop</h2>
            <p>Installers are published via GitHub Releases. Desktop uses secure system-browser login and talks to Studio cloud backend.</p>
          </div>
          <div className="feature-grid">
            {downloads.map((item) => (
              <div className="card" key={item.name}>
                <strong>{item.name}</strong>
                <p>{item.file}</p>
                <a href={item.href} target="_blank" rel="noreferrer">
                  <Button>Download</Button>
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>
      <Footer />
    </main>
  );
}
