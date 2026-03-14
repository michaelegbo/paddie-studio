import type { StudioFlow } from "@paddie-studio/types";

export function Canvas({ flow }: { flow: StudioFlow }) {
  return (
    <div className="canvas">
      {flow.nodes.map((node, index) => (
        <div key={node.id} className="canvas-node" style={{ top: 48 + (index % 3) * 128, left: 40 + index * 160 }}>
          <div style={{ fontSize: 12, color: "#9B9DB3", textTransform: "uppercase" }}>{node.type}</div>
          <strong>{node.label}</strong>
        </div>
      ))}
    </div>
  );
}
