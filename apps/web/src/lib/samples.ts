import { createPlaceholderRun } from "@paddie-studio/runtime";
import type { StudioFlow } from "@paddie-studio/types";

export const sampleFlows: StudioFlow[] = [
  {
    id: "flow_simple",
    name: "Simple Demo",
    description: "Webhook -> HTTP -> Output",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    nodes: [
      { id: "n1", type: "webhook", label: "Webhook", config: {} },
      { id: "n2", type: "http", label: "HTTP Request", config: { method: "GET" } },
      { id: "n3", type: "output", label: "Output", config: {} }
    ],
    edges: [
      { id: "e1", source: "n1", target: "n2", label: "body" },
      { id: "e2", source: "n2", target: "n3", label: "response" }
    ]
  },
  {
    id: "flow_orchestrator",
    name: "Chat + Orchestrator",
    description: "Chat -> Orchestrator -> Memory + HTTP",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    nodes: [
      { id: "c1", type: "chat", label: "Chat", config: {} },
      { id: "c2", type: "orchestrator", label: "Orchestrator", config: { provider: "paddie_system" } },
      { id: "c3", type: "memory", label: "Memory", config: { action: "router" } },
      { id: "c4", type: "output", label: "Output", config: {} }
    ],
    edges: [
      { id: "ce1", source: "c1", target: "c2" },
      { id: "ce2", source: "c2", target: "c3" },
      { id: "ce3", source: "c2", target: "c4" }
    ]
  }
];

export const sampleRun = createPlaceholderRun(sampleFlows[0], { trigger: "manual" });
