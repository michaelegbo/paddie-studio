import { Button, Logo } from "@paddie-studio/ui";
import { sampleFlows, sampleRun } from "./lib/samples";
import { Canvas } from "./components/Canvas";

export default function App() {
  const activeFlow = sampleFlows[0];

  return (
    <div className="shell">
      <aside className="rail">
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <Logo />
          <strong>Studio</strong>
        </div>
        <h1>Flows</h1>
        <div className="flow-list">
          {sampleFlows.map((flow: (typeof sampleFlows)[number]) => (
            <div className="flow-card" key={flow.id}>
              <strong>{flow.name}</strong>
              <div style={{ color: "#9B9DB3", marginTop: 6 }}>{flow.description}</div>
            </div>
          ))}
        </div>
      </aside>
      <main className="workspace">
        <div className="toolbar">
          <div>
            <h1 style={{ margin: 0 }}>{activeFlow.name}</h1>
            <p style={{ margin: "6px 0 0", color: "#9B9DB3" }}>{activeFlow.description}</p>
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <Button variant="ghost">Website</Button>
            <Button>Run Flow</Button>
          </div>
        </div>
        <Canvas flow={activeFlow} />
        <div className="panel-grid">
          <div className="panel"><strong>Execution Output</strong><p>Standalone Studio runtime surface. The server API owns execution, traces, history, and codegen.</p></div>
          <div className="panel"><strong>Last Run</strong><p>Status: <code>{sampleRun.status}</code></p><p>Trigger: <code>{sampleRun.trigger}</code></p><p>Trace steps: <code>{sampleRun.trace.length}</code></p></div>
          <div className="panel"><strong>What is wired</strong><p>Website at root, app under <code>/app</code>, backend under <code>/api</code>, and Electron login shell.</p></div>
        </div>
      </main>
    </div>
  );
}
