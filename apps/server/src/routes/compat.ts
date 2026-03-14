import { Router } from 'express';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { authenticateRequestContext } from '../middleware/auth.middleware';
import type { AuthenticatedRequest } from '../middleware/jwt.middleware';
import { StudioFlowService } from '../services/studio-flow.service';
import { StudioExecutionService } from '../services/studio-execution.service';
import { StudioCodegenService } from '../services/studio-codegen.service';
import { StudioAIProviderService } from '../services/studio-ai-provider.service';
import { config } from '../config';
import { logger } from '../utils/logger';

const flowService = StudioFlowService.getInstance();
const executionService = StudioExecutionService.getInstance();
const codegenService = StudioCodegenService.getInstance();
const aiProviderService = StudioAIProviderService.getInstance();

const testNodeSchema = z.object({
  nodeId: z.string().min(1),
  trigger: z.any().optional(),
  input: z.any().optional(),
  nodes: z.record(z.string(), z.any()).optional(),
});

const chatSchema = z.object({
  message: z.string().min(1),
  history: z.array(z.object({ role: z.string(), content: z.string() })).optional(),
  conversationId: z.string().optional(),
  metadata: z.any().optional(),
  trace: z.boolean().optional(),
});

const codegenSchema = z.object({
  language: z.enum(['javascript', 'python']).optional(),
});

function getScope(req: AuthenticatedRequest): { userId: string; tenantId: string } | null {
  const userId = req.user?.userId;
  const tenantId = req.user?.tenantId;
  if (!userId || !tenantId) {
    return null;
  }
  return { userId, tenantId };
}

export const compatRouter = Router();

compatRouter.post('/webhooks/:flowId/:token', async (req, res) => {
  try {
    const flow = await flowService.getFlowByIdPublic(req.params.flowId);
    if (!flow) {
      res.status(404).json({ success: false, error: 'Flow not found' });
      return;
    }

    if (String(req.params.token || '') !== String(flow.webhook.id || '')) {
      res.status(403).json({ success: false, error: 'Invalid webhook token' });
      return;
    }

    if (flow.webhook.method !== 'ANY' && flow.webhook.method !== req.method.toUpperCase()) {
      res.status(405).json({ success: false, error: `Webhook only accepts ${flow.webhook.method}` });
      return;
    }

    const triggerPayload = {
      method: req.method,
      headers: req.headers,
      query: req.query,
      params: req.params,
      body: req.body,
      path: req.path,
      timestamp: new Date().toISOString(),
      user: {
        user_id: flow.ownerUserId,
        tenant_id: flow.ownerTenantId,
      },
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

    const statusCode = execution.status === 'success' ? 200 : 500;
    res.status(statusCode).json({
      success: execution.status === 'success',
      data: {
        run_id: runId,
        flow_id: flow.id,
        output: execution.output,
        error: execution.error,
        executed_nodes: execution.executedNodeIds,
        node_results: execution.nodeResults,
        execution_trace: execution.executionTrace,
        duration_ms: execution.durationMs,
      },
    });
  } catch (error) {
    logger.error('Compat webhook execution failed:', error);
    res.status(500).json({ success: false, error: 'Webhook execution failed' });
  }
});

compatRouter.use(authenticateRequestContext);

compatRouter.post('/flows/:flowId/test-node', async (req: AuthenticatedRequest, res) => {
  try {
    const scope = getScope(req);
    if (!scope) {
      res.status(401).json({ success: false, error: 'Authentication required' });
      return;
    }

    const payload = testNodeSchema.parse(req.body || {});
    const flow = await flowService.getFlowById(req.params.flowId, scope);
    if (!flow) {
      res.status(404).json({ success: false, error: 'Flow not found' });
      return;
    }

    const result = await executionService.testNode(
      flow,
      payload.nodeId,
      {
        trigger: payload.trigger,
        input: payload.input,
        nodes: payload.nodes,
      },
      {
        actor: {
          userId: scope.userId,
          tenantId: scope.tenantId,
          email: req.user?.email,
          accessToken: req.user?.accessToken,
          refreshToken: req.user?.refreshToken,
          sessionId: req.user?.sessionId,
        },
      }
    );

    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('Compat node test failed:', error);
    res.status(400).json({ success: false, error: error instanceof Error ? error.message : 'Node test failed' });
  }
});

compatRouter.get('/runs/:runId', async (req: AuthenticatedRequest, res) => {
  try {
    const scope = getScope(req);
    if (!scope) {
      res.status(401).json({ success: false, error: 'Authentication required' });
      return;
    }

    const run = await flowService.getRunById(req.params.runId, scope);
    if (!run) {
      res.status(404).json({ success: false, error: 'Run not found' });
      return;
    }

    res.json({ success: true, data: run });
  } catch (error) {
    logger.error('Compat run lookup failed:', error);
    res.status(500).json({ success: false, error: 'Run lookup failed' });
  }
});

compatRouter.post('/chat/:flowId', async (req: AuthenticatedRequest, res) => {
  try {
    const scope = getScope(req);
    if (!scope) {
      res.status(401).json({ success: false, error: 'Authentication required' });
      return;
    }

    const payload = chatSchema.parse(req.body || {});
    const flow = await flowService.getFlowById(req.params.flowId, scope);
    if (!flow) {
      res.status(404).json({ success: false, error: 'Flow not found' });
      return;
    }

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
        access_token: req.user?.accessToken,
        refresh_token: req.user?.refreshToken,
        session_id: req.user?.sessionId,
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

    res.json({
      success: execution.status === 'success',
      data: {
        run_id: runId,
        flow_id: flow.id,
        output: execution.output,
        error: execution.error,
        duration_ms: execution.durationMs,
        executed_nodes: execution.executedNodeIds,
        node_results: execution.nodeResults,
        execution_trace: execution.executionTrace,
      },
    });
  } catch (error) {
    logger.error('Compat chat execution failed:', error);
    res.status(400).json({ success: false, error: error instanceof Error ? error.message : 'Chat execution failed' });
  }
});

compatRouter.post('/codegen/:flowId', async (req: AuthenticatedRequest, res) => {
  try {
    const scope = getScope(req);
    if (!scope) {
      res.status(401).json({ success: false, error: 'Authentication required' });
      return;
    }

    const payload = codegenSchema.parse(req.body || {});
    const flow = await flowService.getFlowById(req.params.flowId, scope);
    if (!flow) {
      res.status(404).json({ success: false, error: 'Flow not found' });
      return;
    }

    const webhookUrl = `${req.protocol}://${req.get('host')}/api/webhooks/${flow.id}/${flow.webhook.id}`;
    const codegen = codegenService.generate(flow, payload.language || 'javascript', webhookUrl);
    res.json({ success: true, data: codegen });
  } catch (error) {
    logger.error('Compat codegen failed:', error);
    res.status(400).json({ success: false, error: error instanceof Error ? error.message : 'Codegen failed' });
  }
});

compatRouter.get('/providers/models', async (req: AuthenticatedRequest, res) => {
  try {
    const provider = String(req.query.provider || 'azure_openai').toLowerCase();
    const mappedProvider = provider === 'openai' || provider === 'groq' ? provider : 'azure_openai';

    const models = await aiProviderService.listModels({
      provider: mappedProvider as 'openai' | 'azure_openai' | 'groq',
      apiKey: String(req.query.apiKey || ''),
      endpoint: String(req.query.endpoint || ''),
      apiVersion: String(req.query.apiVersion || ''),
      deployment: String(req.query.deployment || ''),
    });

    res.json({ success: true, data: models });
  } catch (error) {
    logger.error('Compat providers/models failed:', error);
    res.status(400).json({ success: false, error: error instanceof Error ? error.message : 'Provider model discovery failed' });
  }
});

compatRouter.get('/users/me/api-keys', async (req: AuthenticatedRequest, res) => {
  try {
    const accessToken = String(req.user?.accessToken || '').trim();
    if (!accessToken) {
      res.status(401).json({ success: false, error: 'Missing session access token' });
      return;
    }

    const response = await fetch(`${config.paddie.apiBaseUrl.replace(/\/$/, '')}/api/users/me/api-keys`, {
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });

    const raw = await response.text();
    let parsed: any = {};
    try {
      parsed = raw ? JSON.parse(raw) : {};
    } catch (_error) {
      parsed = { raw };
    }

    res.status(response.status).json(parsed);
  } catch (error) {
    logger.error('Compat get api keys failed:', error);
    res.status(500).json({ success: false, error: 'Failed to load API keys' });
  }
});

compatRouter.post('/users/me/api-keys/:keyId/regenerate', async (req: AuthenticatedRequest, res) => {
  try {
    const accessToken = String(req.user?.accessToken || '').trim();
    if (!accessToken) {
      res.status(401).json({ success: false, error: 'Missing session access token' });
      return;
    }

    const response = await fetch(
      `${config.paddie.apiBaseUrl.replace(/\/$/, '')}/api/users/me/api-keys/${encodeURIComponent(
        String(req.params.keyId || '')
      )}/regenerate`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
        },
      }
    );

    const raw = await response.text();
    let parsed: any = {};
    try {
      parsed = raw ? JSON.parse(raw) : {};
    } catch (_error) {
      parsed = { raw };
    }

    res.status(response.status).json(parsed);
  } catch (error) {
    logger.error('Compat regenerate api key failed:', error);
    res.status(500).json({ success: false, error: 'Failed to regenerate API key' });
  }
});
