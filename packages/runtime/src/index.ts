import type { ExecutionTraceStep, FlowRun, StudioFlow } from "@paddie-studio/types";

export interface RunFlowOptions {
  trigger: FlowRun["trigger"];
  input?: unknown;
}

export function createPlaceholderRun(flow: StudioFlow, options: RunFlowOptions): FlowRun {
  const now = new Date().toISOString();
  const trace: ExecutionTraceStep[] = flow.nodes.map((node) => ({
    id: `${flow.id}:${node.id}`,
    nodeId: node.id,
    status: "pending",
  }));

  return {
    id: `run_${Date.now()}`,
    flowId: flow.id,
    status: "pending",
    trigger: options.trigger,
    input: options.input,
    trace,
    createdAt: now,
  };
}
