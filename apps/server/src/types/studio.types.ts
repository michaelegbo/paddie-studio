export type StudioFlowStatus = 'draft' | 'active' | 'archived';

export type StudioWebhookMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'ANY';

export type StudioNodeType =
  | 'chat'
  | 'webhook'
  | 'http'
  | 'memory'
  | 'websocket'
  | 'condition'
  | 'ai'
  | 'orchestrator'
  | 'loop'
  | 'output';

export interface StudioNodePosition {
  x: number;
  y: number;
}

export interface StudioNode {
  id: string;
  type: StudioNodeType;
  name: string;
  position?: StudioNodePosition;
  config: Record<string, any>;
}

export interface StudioEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  condition?: 'always' | 'true' | 'false' | 'item' | 'done' | 'tool' | 'next';
}

export interface StudioWebhookConfig {
  id: string;
  method: StudioWebhookMethod;
}

export interface StudioFlowDocument {
  id: string;
  name: string;
  description?: string;
  status: StudioFlowStatus;
  webhook: StudioWebhookConfig;
  nodes: StudioNode[];
  edges: StudioEdge[];
  isSample?: boolean;
  ownerUserId: string;
  ownerTenantId: string;
  createdAt: string;
  updatedAt: string;
}

export type StudioRunTriggerType = 'manual' | 'webhook' | 'chat';

export interface StudioRunDocument {
  id: string;
  flowId: string;
  ownerUserId: string;
  ownerTenantId: string;
  status: 'success' | 'failed';
  triggeredBy: StudioRunTriggerType;
  triggerPayload: any;
  output: any;
  nodeResults: Record<string, any>;
  executionTrace?: StudioExecutionTraceStep[];
  error?: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
}

export interface StudioFlowHistoryDocument {
  id: string;
  flowId: string;
  ownerUserId: string;
  ownerTenantId: string;
  snapshot: StudioFlowDocument;
  reason?: string;
  createdAt: string;
}

export interface StudioExecutionResult {
  status: 'success' | 'failed';
  output: any;
  nodeResults: Record<string, any>;
  executedNodeIds: string[];
  executionTrace: StudioExecutionTraceStep[];
  startedAt: string;
  endedAt: string;
  durationMs: number;
  error?: string;
}

export interface StudioExecutionTraceDispatch {
  branch: string;
  edgeId: string;
  sourceNodeId: string;
  targetNodeId: string;
  inputSnapshot?: any;
}

export interface StudioExecutionTraceStep {
  step: number;
  nodeId: string;
  nodeType: StudioNodeType;
  status: 'success' | 'failed';
  startedAt: string;
  endedAt: string;
  durationMs: number;
  inputSnapshot?: any;
  dispatches: StudioExecutionTraceDispatch[];
  error?: string;
}

export interface StudioCodegenResult {
  language: 'javascript' | 'python';
  code: string;
  webhookUrl: string;
  stackblitzProject?: {
    title: string;
    description: string;
    files: Record<string, string>;
  };
}
