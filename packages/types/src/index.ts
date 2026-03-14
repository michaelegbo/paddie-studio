export type StudioNodeType =
  | "webhook"
  | "chat"
  | "http"
  | "websocket"
  | "condition"
  | "loop"
  | "output"
  | "ai"
  | "orchestrator"
  | "memory";

export interface StudioNode {
  id: string;
  type: StudioNodeType;
  label: string;
  config: Record<string, unknown>;
}

export interface StudioEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

export interface StudioFlow {
  id: string;
  name: string;
  description?: string;
  nodes: StudioNode[];
  edges: StudioEdge[];
  createdAt: string;
  updatedAt: string;
}

export interface ExecutionTraceStep {
  id: string;
  nodeId: string;
  status: "pending" | "running" | "success" | "error";
  startedAt?: string;
  completedAt?: string;
  inputSnapshot?: unknown;
  outputSnapshot?: unknown;
  error?: string;
}

export interface FlowRun {
  id: string;
  flowId: string;
  status: "pending" | "running" | "success" | "error";
  trigger: "manual" | "webhook" | "chat";
  input?: unknown;
  output?: unknown;
  trace: ExecutionTraceStep[];
  createdAt: string;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
}

export interface StudioSession {
  id: string;
  user: AuthenticatedUser;
  expiresAt: string;
}
