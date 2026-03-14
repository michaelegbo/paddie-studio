import type {
  StudioCodegen,
  StudioFlow,
  StudioNode,
  StudioRun,
  StudioExecutionTraceStep,
} from '@paddie-studio/types';

export interface RuntimeExecuteRequest {
  flow: StudioFlow;
  trigger: 'manual' | 'webhook' | 'chat';
  input?: unknown;
}

export interface RuntimeExecuteResponse {
  run: StudioRun;
}

export interface RuntimeCodegenRequest {
  flow: StudioFlow;
  language: 'javascript' | 'python';
  webhookUrl: string;
}

export interface RuntimeCodegenProvider {
  generate(request: RuntimeCodegenRequest): StudioCodegen;
}

export function createTraceSkeleton(flow: StudioFlow): StudioExecutionTraceStep[] {
  return flow.nodes.map((node, index) => ({
    step: index + 1,
    nodeId: node.id,
    nodeType: node.type,
    status: 'failed',
    startedAt: new Date().toISOString(),
    endedAt: new Date().toISOString(),
    durationMs: 0,
    dispatches: [],
  }));
}

export function createPendingRun(flow: StudioFlow, trigger: RuntimeExecuteRequest['trigger'], input?: unknown): StudioRun {
  const now = new Date().toISOString();
  return {
    id: `studio_run_${Date.now()}`,
    flowId: flow.id,
    status: 'success',
    triggeredBy: trigger,
    triggerPayload: input ?? {},
    output: null,
    nodeResults: {},
    executionTrace: createTraceSkeleton(flow),
    startedAt: now,
    endedAt: now,
    durationMs: 0,
  };
}

export function listFlowNodesByType(flow: StudioFlow, type: StudioNode['type']): StudioNode[] {
  return flow.nodes.filter((node) => node.type === type);
}
