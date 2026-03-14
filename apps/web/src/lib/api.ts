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

export interface StudioNode {
  id: string;
  type: StudioNodeType;
  name: string;
  position?: {
    x: number;
    y: number;
  };
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

export interface StudioFlow {
  id: string;
  name: string;
  description?: string;
  status: 'draft' | 'active' | 'archived';
  webhook: {
    id: string;
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'ANY';
  };
  nodes: StudioNode[];
  edges: StudioEdge[];
  isSample?: boolean;
  ownerUserId: string;
  ownerTenantId: string;
  createdAt: string;
  updatedAt: string;
}

export interface StudioRun {
  id: string;
  flowId: string;
  status: 'success' | 'failed';
  triggeredBy: 'manual' | 'webhook' | 'chat';
  triggerPayload: any;
  output: any;
  nodeResults: Record<string, any>;
  executionTrace?: StudioExecutionTraceStep[];
  error?: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
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

export interface StudioCodegen {
  language: 'javascript' | 'python';
  code: string;
  webhookUrl: string;
  stackblitzProject?: {
    title: string;
    description: string;
    files: Record<string, string>;
  };
}

export interface StudioFlowHistory {
  id: string;
  flowId: string;
  ownerUserId: string;
  ownerTenantId: string;
  snapshot: StudioFlow;
  reason?: string;
  createdAt: string;
}

export interface StudioProviderModel {
  id: string;
  provider: 'openai' | 'azure_openai' | 'groq';
  ownedBy?: string;
  object?: string;
}

interface APIResponse<T> {
  data: T;
}

declare global {
  interface Window {
    STUDIO_DESKTOP?: {
      apiBaseUrl?: string;
      publicBaseUrl?: string;
      isDesktop?: boolean;
    };
  }
}

function resolveApiBaseUrl(): string {
  if (typeof window === 'undefined') {
    return '/api';
  }

  const fromQuery = new URLSearchParams(window.location.search).get('apiBase');
  const fromDesktopBridge = window.STUDIO_DESKTOP?.apiBaseUrl;
  const base = fromQuery || fromDesktopBridge || '/api';
  return String(base).replace(/\/$/, '');
}

function withBase(path: string): string {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${resolveApiBaseUrl()}${normalizedPath}`;
}

async function request<T>(path: string, init?: RequestInit): Promise<APIResponse<T>> {
  const response = await fetch(withBase(path), {
    credentials: 'include',
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers || {}),
    },
  });

  const raw = await response.text();
  let parsed: any = {};
  try {
    parsed = raw ? JSON.parse(raw) : {};
  } catch (_error) {
    parsed = { raw };
  }

  if (!response.ok) {
    const message = parsed?.error || parsed?.message || `Request failed (${response.status})`;
    throw new Error(message);
  }

  return { data: parsed as T };
}

export const studioAPI = {
  getNodeTypes: () => request<any>('/api/node-types'),
  getTemplates: () => request<any>('/api/templates'),

  getFlows: () => request<any>('/api/flows'),
  createFlow: (data: Partial<StudioFlow>) =>
    request<any>('/api/flows', { method: 'POST', body: JSON.stringify(data) }),
  createSampleFlow: (templateId?: string) =>
    request<any>('/api/flows/sample', {
      method: 'POST',
      body: JSON.stringify(templateId ? { templateId } : {}),
    }),
  getFlow: (flowId: string) => request<any>(`/api/flows/${encodeURIComponent(flowId)}`),
  updateFlow: (flowId: string, data: Partial<StudioFlow>) =>
    request<any>(`/api/flows/${encodeURIComponent(flowId)}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteFlow: (flowId: string) =>
    request<any>(`/api/flows/${encodeURIComponent(flowId)}`, { method: 'DELETE' }),

  executeFlow: (flowId: string, input?: any, trace = true) =>
    request<any>(`/api/flows/${encodeURIComponent(flowId)}/execute`, {
      method: 'POST',
      body: JSON.stringify({ input, trace }),
    }),

  chatFlow: (
    flowId: string,
    payload: {
      message: string;
      history?: Array<{ role: string; content: string }>;
      conversationId?: string;
      metadata?: any;
      trace?: boolean;
    }
  ) =>
    request<any>(`/api/chat/${encodeURIComponent(flowId)}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  testNode: (
    flowId: string,
    nodeId: string,
    payload?: { trigger?: any; input?: any; nodes?: Record<string, any> }
  ) =>
    request<any>(`/api/flows/${encodeURIComponent(flowId)}/test-node`, {
      method: 'POST',
      body: JSON.stringify({ ...(payload || {}), nodeId }),
    }),

  listProviderModels: (payload: {
    provider: 'openai' | 'azure_openai' | 'groq';
    apiKey?: string;
    endpoint?: string;
    apiVersion?: string;
    deployment?: string;
  }) => {
    const params = new URLSearchParams();
    params.set('provider', payload.provider);
    if (payload.apiKey) params.set('apiKey', payload.apiKey);
    if (payload.endpoint) params.set('endpoint', payload.endpoint);
    if (payload.apiVersion) params.set('apiVersion', payload.apiVersion);
    if (payload.deployment) params.set('deployment', payload.deployment);
    return request<any>(`/api/providers/models?${params.toString()}`);
  },

  getRuns: (flowId: string, limit = 20) =>
    request<any>(`/api/flows/${encodeURIComponent(flowId)}/runs?limit=${encodeURIComponent(String(limit))}`),

  getFlowHistory: (flowId: string, limit = 30) =>
    request<any>(`/api/flows/${encodeURIComponent(flowId)}/history?limit=${encodeURIComponent(String(limit))}`),

  restoreFlowHistory: (flowId: string, historyId: string) =>
    request<any>(`/api/flows/${encodeURIComponent(flowId)}/history/${encodeURIComponent(historyId)}/restore`, {
      method: 'POST',
    }),

  generateCode: (flowId: string, language: 'javascript' | 'python') =>
    request<any>(`/api/codegen/${encodeURIComponent(flowId)}`, {
      method: 'POST',
      body: JSON.stringify({ language }),
    }),
};

export const userAPI = {
  getApiKeys: () => request<any>('/api/users/me/api-keys'),
  regenerateApiKey: (id: string) =>
    request<any>(`/api/users/me/api-keys/${encodeURIComponent(id)}/regenerate`, {
      method: 'POST',
    }),
};
