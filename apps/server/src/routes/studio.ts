import { Router, Response } from 'express';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { authenticateRequestContext } from '../middleware/auth.middleware';
import { AuthenticatedRequest } from '../middleware/jwt.middleware';
import { StudioFlowService } from '../services/studio-flow.service';
import { StudioExecutionService } from '../services/studio-execution.service';
import { StudioCodegenService } from '../services/studio-codegen.service';
import { StudioAIProviderService } from '../services/studio-ai-provider.service';
import { logger } from '../utils/logger';
import { StudioFlowStatus, StudioWebhookMethod } from '../types/studio.types';

const router = Router();

const flowService = StudioFlowService.getInstance();
const executionService = StudioExecutionService.getInstance();
const codegenService = StudioCodegenService.getInstance();
const aiProviderService = StudioAIProviderService.getInstance();

const nodeSchema = z.object({
  id: z.string().min(1),
  type: z.enum([
    'chat',
    'webhook',
    'http',
    'memory',
    'websocket',
    'condition',
    'ai',
    'orchestrator',
    'loop',
    'output',
  ]),
  name: z.string().min(1),
  position: z
    .object({
      x: z.number(),
      y: z.number(),
    })
    .optional(),
  config: z.record(z.string(), z.any()).default({}),
});

const edgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  sourceHandle: z.string().optional(),
  targetHandle: z.string().optional(),
  condition: z.enum(['always', 'true', 'false', 'item', 'done', 'tool', 'next']).optional(),
});

const webhookSchema = z.object({
  id: z.string().min(1).optional(),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'ANY'] as [StudioWebhookMethod, ...StudioWebhookMethod[]]).optional(),
});

const createFlowSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
  status: z.enum(['draft', 'active', 'archived'] as [StudioFlowStatus, ...StudioFlowStatus[]]).optional(),
  webhook: webhookSchema.optional(),
  nodes: z.array(nodeSchema).optional(),
  edges: z.array(edgeSchema).optional(),
  isSample: z.boolean().optional(),
});

const updateFlowSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(2000).optional(),
  status: z.enum(['draft', 'active', 'archived'] as [StudioFlowStatus, ...StudioFlowStatus[]]).optional(),
  webhook: webhookSchema.optional(),
  nodes: z.array(nodeSchema).optional(),
  edges: z.array(edgeSchema).optional(),
  isSample: z.boolean().optional(),
});

const executeFlowSchema = z.object({
  input: z.any().optional(),
  trace: z.boolean().optional(),
});

const chatFlowSchema = z.object({
  message: z.string().min(1),
  history: z
    .array(
      z.object({
        role: z.string(),
        content: z.string(),
      })
    )
    .optional(),
  conversationId: z.string().optional(),
  metadata: z.any().optional(),
  trace: z.boolean().optional(),
});

const testNodeSchema = z.object({
  trigger: z.any().optional(),
  input: z.any().optional(),
  nodes: z.record(z.string(), z.any()).optional(),
});

const createSampleFlowSchema = z.object({
  templateId: z
    .enum(['simple_api', 'simple_url', 'simple_body', 'loop_users', 'ai_basic', 'ai_orchestrator'] as const)
    .optional(),
});

const listAIModelsSchema = z.object({
  provider: z.enum(['openai', 'azure_openai', 'groq'] as const),
  apiKey: z.string().optional(),
  endpoint: z.string().optional(),
  apiVersion: z.string().optional(),
  deployment: z.string().optional(),
});

// -----------------------------------------------------------------------------
// Public Webhook Entry (no auth header required)
// -----------------------------------------------------------------------------
router.all('/webhooks/:webhookId', async (req, res) => {
  try {
    const webhookId = req.params.webhookId;
    const flow = await flowService.getFlowByWebhookId(webhookId);

    if (!flow) {
      return res.status(404).json({
        success: false,
        error: 'Studio webhook not found',
      });
    }

    if (flow.webhook.method !== 'ANY' && flow.webhook.method !== req.method.toUpperCase()) {
      return res.status(405).json({
        success: false,
        error: `Webhook only accepts ${flow.webhook.method}`,
      });
    }

    const triggerPayload = {
      method: req.method,
      headers: req.headers,
      query: req.query,
      params: req.params,
      body: req.body,
      path: req.path,
      timestamp: new Date().toISOString(),
    };

    const execution = await executionService.execute(flow, triggerPayload, {
      actor: {
        userId: flow.ownerUserId,
        tenantId: flow.ownerTenantId,
        email: 'studio@system.local',
      },
    });
    const runId = `studio_run_${randomUUID()}`;

    await flowService.createRun({
      id: runId,
      flowId: flow.id,
      ownerUserId: flow.ownerUserId,
      ownerTenantId: flow.ownerTenantId,
      status: execution.status,
      triggeredBy: 'webhook',
      triggerPayload,
      output: execution.output,
      nodeResults: execution.nodeResults,
      executionTrace: execution.executionTrace,
      error: execution.error,
      startedAt: execution.startedAt,
      endedAt: execution.endedAt,
      durationMs: execution.durationMs,
    });

    const includeTrace = req.query.trace === '1' || req.query.trace === 'true';
    const statusCode = execution.status === 'success' ? 200 : 500;

    return res.status(statusCode).json({
      success: execution.status === 'success',
      flow_id: flow.id,
      run_id: runId,
      output: execution.output,
      error: execution.error,
      ...(includeTrace
          ? {
              executed_nodes: execution.executedNodeIds,
              node_results: execution.nodeResults,
              execution_trace: execution.executionTrace,
              duration_ms: execution.durationMs,
            }
          : {}),
    });
  } catch (error) {
    logger.error('Studio webhook execution failed:', error);
    return res.status(500).json({
      success: false,
      error: 'Studio webhook execution failed',
    });
  }
});

// -----------------------------------------------------------------------------
// Authenticated Studio Management APIs
// -----------------------------------------------------------------------------
router.use(authenticateRequestContext);

router.get('/node-types', (_req: AuthenticatedRequest, res: Response) => {
  res.json({
    success: true,
    data: [
      {
        type: 'chat',
        label: 'Chat Input',
        description: 'Chat-style entry point. Sends a user message and conversation history into the flow.',
      },
      {
        type: 'webhook',
        label: 'Webhook Trigger',
        description: 'Entry point. Starts a flow from an incoming HTTP webhook.',
      },
      {
        type: 'http',
        label: 'HTTP Request',
        description: 'Call external APIs with method/url/headers/body and capture response data.',
      },
      {
        type: 'memory',
        label: 'Paddie Memory',
        description: 'Use Paddie memory endpoints (router/create/search) through Studio session auth or your own API key.',
      },
      {
        type: 'websocket',
        label: 'WebSocket',
        description: 'Connect to ws/wss endpoint, send payload, and optionally wait for first message.',
      },
      {
        type: 'condition',
        label: 'If / Else',
        description: 'Evaluate a condition and branch the flow through true/false paths.',
      },
      {
        type: 'ai',
        label: 'AI Inference',
        description: 'Run a single prompt inference with OpenAI, Azure OpenAI, or Groq.',
      },
      {
        type: 'orchestrator',
        label: 'AI Orchestrator',
        description: 'Master AI node that can call connected tool nodes and return a final answer.',
      },
      {
        type: 'loop',
        label: 'Loop Items',
        description: 'Iterate over a list and emit one item at a time plus a done branch.',
      },
      {
        type: 'output',
        label: 'Output',
        description: 'Shape the final payload returned to webhook/manual execution.',
      },
    ],
  });
});

router.get('/templates', (_req: AuthenticatedRequest, res: Response) => {
  res.json({
    success: true,
    data: [
      {
        id: 'simple_url',
        name: 'Sample: Webhook To URL',
        description:
          'Webhook -> HTTP GET -> Output. Shows webhook fields flowing into the URL.',
      },
      {
        id: 'simple_body',
        name: 'Sample: Webhook To Body',
        description:
          'Webhook -> HTTP POST -> Output. Shows webhook fields flowing into the JSON body.',
      },
      {
        id: 'loop_users',
        name: 'Sample: Loop Through Users',
        description:
          'Uses JSONPlaceholder + Loop Items + httpbin for a full public API orchestration demo.',
      },
      {
        id: 'ai_basic',
        name: 'Sample: AI Inference',
        description:
          'Webhook -> AI inference -> Output. Uses provider/model from node config.',
      },
      {
        id: 'ai_orchestrator',
        name: 'Sample: AI Orchestrator',
        description:
          'Chat -> AI orchestrator with connected tool nodes and user memory.',
      },
    ],
  });
});

router.post('/ai/models', async (req: AuthenticatedRequest, res: Response) => {
  if (!getScopeOrRespond(req, res)) return;

  try {
    const payload = listAIModelsSchema.parse(req.body || {});
    const models = await aiProviderService.listModels({
      provider: payload.provider,
      apiKey: payload.apiKey,
      endpoint: payload.endpoint,
      apiVersion: payload.apiVersion,
      deployment: payload.deployment,
    });
    return res.json({
      success: true,
      data: models,
    });
  } catch (error) {
    logger.error('Failed to list Studio AI models:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid model list payload',
        details: error.issues,
      });
    }
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to list models',
    });
  }
});

router.post('/flows/sample', async (req: AuthenticatedRequest, res: Response) => {
  const scope = getScopeOrRespond(req, res);
  if (!scope) return;

  try {
    const payload = createSampleFlowSchema.parse(req.body || {});
    const flow = await flowService.createSampleFlow(scope, payload.templateId);
    return res.status(201).json({
      success: true,
      data: flow,
    });
  } catch (error) {
    logger.error('Failed to create Studio sample flow:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid sample flow payload',
        details: error.issues,
      });
    }
    return res.status(500).json({
      success: false,
      error: 'Failed to create sample flow',
    });
  }
});

router.get('/flows', async (req: AuthenticatedRequest, res: Response) => {
  const scope = getScopeOrRespond(req, res);
  if (!scope) return;

  try {
    const flows = await flowService.listFlows(scope);
    return res.json({
      success: true,
      data: flows,
    });
  } catch (error) {
    logger.error('Failed to list Studio flows:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to list Studio flows',
    });
  }
});

router.post('/flows', async (req: AuthenticatedRequest, res: Response) => {
  const scope = getScopeOrRespond(req, res);
  if (!scope) return;

  try {
    const payload = createFlowSchema.parse(req.body);
    const flow = await flowService.createFlow(scope, payload as any);
    return res.status(201).json({
      success: true,
      data: flow,
    });
  } catch (error) {
    logger.error('Failed to create Studio flow:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid flow payload',
        details: error.issues,
      });
    }
    return res.status(500).json({
      success: false,
      error: 'Failed to create Studio flow',
    });
  }
});

router.get('/flows/:flowId', async (req: AuthenticatedRequest, res: Response) => {
  const scope = getScopeOrRespond(req, res);
  if (!scope) return;

  try {
    const flow = await flowService.getFlowById(req.params.flowId, scope);
    if (!flow) {
      return res.status(404).json({
        success: false,
        error: 'Flow not found',
      });
    }

    return res.json({
      success: true,
      data: flow,
    });
  } catch (error) {
    logger.error('Failed to load Studio flow:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to load flow',
    });
  }
});

router.put('/flows/:flowId', async (req: AuthenticatedRequest, res: Response) => {
  const scope = getScopeOrRespond(req, res);
  if (!scope) return;

  try {
    const payload = updateFlowSchema.parse(req.body);
    const flow = await flowService.updateFlow(req.params.flowId, scope, payload as any);
    if (!flow) {
      return res.status(404).json({
        success: false,
        error: 'Flow not found',
      });
    }

    return res.json({
      success: true,
      data: flow,
    });
  } catch (error) {
    logger.error('Failed to update Studio flow:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid flow payload',
        details: error.issues,
      });
    }
    return res.status(500).json({
      success: false,
      error: 'Failed to update flow',
    });
  }
});

router.delete('/flows/:flowId', async (req: AuthenticatedRequest, res: Response) => {
  const scope = getScopeOrRespond(req, res);
  if (!scope) return;

  try {
    const deleted = await flowService.deleteFlow(req.params.flowId, scope);
    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Flow not found',
      });
    }

    return res.json({
      success: true,
    });
  } catch (error) {
    logger.error('Failed to delete Studio flow:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to delete flow',
    });
  }
});

router.post('/flows/:flowId/execute', async (req: AuthenticatedRequest, res: Response) => {
  const scope = getScopeOrRespond(req, res);
  if (!scope) return;

  try {
    const flow = await flowService.getFlowById(req.params.flowId, scope);
    if (!flow) {
      return res.status(404).json({
        success: false,
        error: 'Flow not found',
      });
    }

    const payload = executeFlowSchema.parse(req.body || {});
    const triggerPayload = {
      method: 'MANUAL',
      body: payload.input || {},
      user: {
        user_id: scope.userId,
        tenant_id: scope.tenantId,
        email: req.user?.email,
      },
      timestamp: new Date().toISOString(),
    };

    const execution = await executionService.execute(flow, triggerPayload, {
      actor: {
        userId: scope.userId,
        tenantId: scope.tenantId,
        email: req.user?.email,
        accessToken: req.user?.accessToken,
        refreshToken: req.user?.refreshToken,
        sessionId: req.user?.sessionId,
      },
    });
    const runId = `studio_run_${randomUUID()}`;

    await flowService.createRun({
      id: runId,
      flowId: flow.id,
      ownerUserId: flow.ownerUserId,
      ownerTenantId: flow.ownerTenantId,
      status: execution.status,
      triggeredBy: 'manual',
      triggerPayload,
      output: execution.output,
      nodeResults: execution.nodeResults,
      executionTrace: execution.executionTrace,
      error: execution.error,
      startedAt: execution.startedAt,
      endedAt: execution.endedAt,
      durationMs: execution.durationMs,
    });

    const includeTrace = payload.trace === true;
    const statusCode = execution.status === 'success' ? 200 : 500;

    return res.status(statusCode).json({
      success: execution.status === 'success',
      data: {
        run_id: runId,
        flow_id: flow.id,
        output: execution.output,
        error: execution.error,
        duration_ms: execution.durationMs,
        ...(includeTrace
          ? {
              executed_nodes: execution.executedNodeIds,
              node_results: execution.nodeResults,
              execution_trace: execution.executionTrace,
            }
          : {}),
      },
    });
  } catch (error) {
    logger.error('Failed to execute Studio flow:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid execute payload',
        details: error.issues,
      });
    }
    return res.status(500).json({
      success: false,
      error: 'Failed to execute flow',
    });
  }
});

router.post('/flows/:flowId/chat', async (req: AuthenticatedRequest, res: Response) => {
  const scope = getScopeOrRespond(req, res);
  if (!scope) return;

  try {
    const flow = await flowService.getFlowById(req.params.flowId, scope);
    if (!flow) {
      return res.status(404).json({
        success: false,
        error: 'Flow not found',
      });
    }

    const payload = chatFlowSchema.parse(req.body || {});
    const triggerPayload = {
      method: 'CHAT',
      body: {
        message: payload.message,
        history: payload.history || [],
        conversationId: payload.conversationId,
        metadata: payload.metadata,
      },
      chat: {
        message: payload.message,
        history: payload.history || [],
        conversationId: payload.conversationId,
        metadata: payload.metadata,
      },
      user: {
        user_id: scope.userId,
        tenant_id: scope.tenantId,
        email: req.user?.email,
      },
      timestamp: new Date().toISOString(),
    };

    const execution = await executionService.execute(flow, triggerPayload, {
      actor: {
        userId: scope.userId,
        tenantId: scope.tenantId,
        email: req.user?.email,
        accessToken: req.user?.accessToken,
        refreshToken: req.user?.refreshToken,
        sessionId: req.user?.sessionId,
      },
    });
    const runId = `studio_run_${randomUUID()}`;

    await flowService.createRun({
      id: runId,
      flowId: flow.id,
      ownerUserId: flow.ownerUserId,
      ownerTenantId: flow.ownerTenantId,
      status: execution.status,
      triggeredBy: 'chat',
      triggerPayload,
      output: execution.output,
      nodeResults: execution.nodeResults,
      executionTrace: execution.executionTrace,
      error: execution.error,
      startedAt: execution.startedAt,
      endedAt: execution.endedAt,
      durationMs: execution.durationMs,
    });

    const includeTrace = payload.trace === true;
    const statusCode = execution.status === 'success' ? 200 : 500;
    return res.status(statusCode).json({
      success: execution.status === 'success',
      data: {
        run_id: runId,
        flow_id: flow.id,
        output: execution.output,
        error: execution.error,
        duration_ms: execution.durationMs,
        ...(includeTrace
          ? {
              executed_nodes: execution.executedNodeIds,
              node_results: execution.nodeResults,
              execution_trace: execution.executionTrace,
            }
          : {}),
      },
    });
  } catch (error) {
    logger.error('Failed to execute Studio chat flow:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid Studio chat payload',
        details: error.issues,
      });
    }
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to execute Studio chat flow',
    });
  }
});

router.post('/flows/:flowId/nodes/:nodeId/test', async (req: AuthenticatedRequest, res: Response) => {
  const scope = getScopeOrRespond(req, res);
  if (!scope) return;

  try {
    const flow = await flowService.getFlowById(req.params.flowId, scope);
    if (!flow) {
      return res.status(404).json({
        success: false,
        error: 'Flow not found',
      });
    }

    const payload = testNodeSchema.parse(req.body || {});
    const result = await executionService.testNode(flow, req.params.nodeId, payload, {
      actor: {
        userId: scope.userId,
        tenantId: scope.tenantId,
        email: req.user?.email,
        accessToken: req.user?.accessToken,
        refreshToken: req.user?.refreshToken,
        sessionId: req.user?.sessionId,
      },
    });
    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('Failed to test Studio node:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid node test payload',
        details: error.issues,
      });
    }
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to test node',
    });
  }
});

router.get('/flows/:flowId/runs', async (req: AuthenticatedRequest, res: Response) => {
  const scope = getScopeOrRespond(req, res);
  if (!scope) return;

  try {
    const flow = await flowService.getFlowById(req.params.flowId, scope);
    if (!flow) {
      return res.status(404).json({
        success: false,
        error: 'Flow not found',
      });
    }

    const limit = Math.max(1, Math.min(Number(req.query.limit || 20), 100));
    const runs = await flowService.listRuns(flow.id, scope, limit);
    return res.json({
      success: true,
      data: runs,
    });
  } catch (error) {
    logger.error('Failed to list Studio runs:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to list runs',
    });
  }
});

router.get('/flows/:flowId/history', async (req: AuthenticatedRequest, res: Response) => {
  const scope = getScopeOrRespond(req, res);
  if (!scope) return;

  try {
    const flow = await flowService.getFlowById(req.params.flowId, scope);
    if (!flow) {
      return res.status(404).json({
        success: false,
        error: 'Flow not found',
      });
    }

    const limit = Math.max(1, Math.min(Number(req.query.limit || 30), 100));
    const history = await flowService.listFlowHistory(flow.id, scope, limit);

    return res.json({
      success: true,
      data: history,
    });
  } catch (error) {
    logger.error('Failed to list Studio flow history:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to list flow history',
    });
  }
});

router.post('/flows/:flowId/history/:historyId/restore', async (req: AuthenticatedRequest, res: Response) => {
  const scope = getScopeOrRespond(req, res);
  if (!scope) return;

  try {
    const restored = await flowService.restoreFlowFromHistory(
      req.params.flowId,
      req.params.historyId,
      scope
    );

    if (!restored) {
      return res.status(404).json({
        success: false,
        error: 'Flow history entry not found',
      });
    }

    return res.json({
      success: true,
      data: restored,
    });
  } catch (error) {
    logger.error('Failed to restore Studio flow from history:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to restore flow',
    });
  }
});

router.get('/flows/:flowId/codegen', async (req: AuthenticatedRequest, res: Response) => {
  const scope = getScopeOrRespond(req, res);
  if (!scope) return;

  try {
    const flow = await flowService.getFlowById(req.params.flowId, scope);
    if (!flow) {
      return res.status(404).json({
        success: false,
        error: 'Flow not found',
      });
    }

    const language =
      String(req.query.language || 'javascript').toLowerCase() === 'python'
        ? 'python'
        : 'javascript';

    const webhookUrl = `${req.protocol}://${req.get('host')}/api/webhooks/${flow.id}/${flow.webhook.id}`;
    const codegen = codegenService.generate(flow, language, webhookUrl);

    return res.json({
      success: true,
      data: codegen,
    });
  } catch (error) {
    logger.error('Failed to generate Studio code:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to generate code',
    });
  }
});

function getScopeOrRespond(
  req: AuthenticatedRequest,
  res: Response
): { userId: string; tenantId: string } | null {
  const userId = req.user?.userId;
  const tenantId = req.user?.tenantId;

  if (!userId || !tenantId) {
    res.status(401).json({
      success: false,
      error: 'Authentication required',
    });
    return null;
  }

  return { userId, tenantId };
}

export default router;
