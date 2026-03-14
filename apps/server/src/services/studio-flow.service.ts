import { randomUUID } from 'node:crypto';
import { MongoDBService } from './mongodb.service.js';
import { RedisService } from './redis.service.js';
import {
  StudioArtifactDocument,
  StudioFlowDocument,
  StudioFlowHistoryDocument,
  StudioNode,
  StudioRunDocument,
  StudioWebhookMethod,
} from '../types/studio.types.js';
import { logger } from '../utils/logger.js';

interface StudioFlowCreateInput {
  name?: string;
  description?: string;
  status?: StudioFlowDocument['status'];
  webhook?: {
    id?: string;
    method?: StudioWebhookMethod;
  };
  nodes?: StudioFlowDocument['nodes'];
  edges?: StudioFlowDocument['edges'];
  isSample?: boolean;
}

interface StudioFlowUpdateInput {
  name?: string;
  description?: string;
  status?: StudioFlowDocument['status'];
  webhook?: {
    id?: string;
    method?: StudioWebhookMethod;
  };
  nodes?: StudioFlowDocument['nodes'];
  edges?: StudioFlowDocument['edges'];
  isSample?: boolean;
}

interface OwnerScope {
  userId: string;
  tenantId: string;
}

type StudioSampleTemplateId =
  | 'simple_api'
  | 'simple_url'
  | 'simple_body'
  | 'loop_users'
  | 'ai_basic'
  | 'ai_orchestrator';

export class StudioFlowService {
  private static instance: StudioFlowService;
  private mongodb: MongoDBService;
  private redis: RedisService;
  private indexesEnsured = false;

  private constructor() {
    this.mongodb = MongoDBService.getInstance();
    this.redis = RedisService.getInstance();
  }

  static getInstance(): StudioFlowService {
    if (!StudioFlowService.instance) {
      StudioFlowService.instance = new StudioFlowService();
    }
    return StudioFlowService.instance;
  }

  async listFlows(scope: OwnerScope): Promise<StudioFlowDocument[]> {
    await this.ensureIndexes();
    const docs = await this.flowsCollection()
      .find({
        ownerUserId: scope.userId,
        ownerTenantId: scope.tenantId,
      })
      .sort({ updatedAt: -1 })
      .toArray();

    return docs.map(doc => this.toFlowDocument(doc));
  }

  async getFlowById(flowId: string, scope: OwnerScope): Promise<StudioFlowDocument | null> {
    await this.ensureIndexes();
    const doc = await this.flowsCollection().findOne({
      id: flowId,
      ownerUserId: scope.userId,
      ownerTenantId: scope.tenantId,
    });

    return doc ? this.toFlowDocument(doc) : null;
  }

  async getFlowByWebhookId(webhookId: string): Promise<StudioFlowDocument | null> {
    await this.ensureIndexes();
    const doc = await this.flowsCollection().findOne({
      'webhook.id': webhookId,
      status: 'active',
    });

    return doc ? this.toFlowDocument(doc) : null;
  }

  async getFlowByIdPublic(flowId: string): Promise<StudioFlowDocument | null> {
    await this.ensureIndexes();
    const doc = await this.flowsCollection().findOne({
      id: flowId,
      status: 'active',
    });
    return doc ? this.toFlowDocument(doc) : null;
  }

  async createFlow(scope: OwnerScope, input: StudioFlowCreateInput): Promise<StudioFlowDocument> {
    await this.ensureIndexes();

    const id = `studio_flow_${randomUUID()}`;
    const now = new Date().toISOString();
    const webhookId =
      input.webhook?.id || `studio_wh_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
    const webhookMethod = this.normalizeWebhookMethod(input.webhook?.method);

    const defaultNodes: StudioNode[] = [
          {
            id: 'node_webhook',
            type: 'webhook',
            name: 'Webhook Trigger',
            position: { x: 80, y: 120 },
            config: {},
          },
          {
            id: 'node_output',
            type: 'output',
            name: 'Output',
            position: { x: 420, y: 120 },
            config: {
              template: {
                status: 'ok',
                trigger: '{{trigger.body}}',
              },
            },
          },
        ];

    const nodes = this.sanitizeNodesForPersistence(
      input.nodes && input.nodes.length > 0 ? input.nodes : defaultNodes
    );

    const edges = input.edges && input.edges.length > 0
      ? input.edges
      : [
          {
            id: 'edge_webhook_output',
            source: 'node_webhook',
            target: 'node_output',
          },
        ];

    const flow: StudioFlowDocument = {
      id,
      name: input.name || 'Untitled Studio Flow',
      description: input.description || '',
      status: input.status || 'draft',
      webhook: {
        id: webhookId,
        method: webhookMethod,
      },
      nodes,
      edges,
      isSample: !!input.isSample,
      ownerUserId: scope.userId,
      ownerTenantId: scope.tenantId,
      createdAt: now,
      updatedAt: now,
    };

    await this.flowsCollection().insertOne(flow);
    await this.createFlowSnapshot(flow, scope, 'created');

    return flow;
  }

  async updateFlow(
    flowId: string,
    scope: OwnerScope,
    input: StudioFlowUpdateInput
  ): Promise<StudioFlowDocument | null> {
    await this.ensureIndexes();

    const updatePayload: Record<string, any> = {
      updatedAt: new Date().toISOString(),
    };

    if (input.name !== undefined) updatePayload.name = input.name;
    if (input.description !== undefined) updatePayload.description = input.description;
    if (input.status !== undefined) updatePayload.status = input.status;
    if (input.nodes !== undefined) updatePayload.nodes = this.sanitizeNodesForPersistence(input.nodes);
    if (input.edges !== undefined) updatePayload.edges = input.edges;
    if (input.isSample !== undefined) updatePayload.isSample = input.isSample;
    if (input.webhook !== undefined) {
      updatePayload.webhook = {
        id: input.webhook.id,
        method: this.normalizeWebhookMethod(input.webhook.method),
      };
    }

    const result = await this.flowsCollection().findOneAndUpdate(
      {
        id: flowId,
        ownerUserId: scope.userId,
        ownerTenantId: scope.tenantId,
      },
      { $set: updatePayload },
      { returnDocument: 'after' }
    );

    if (!result) {
      return null;
    }

    const updatedFlow = this.toFlowDocument(result);
    await this.createFlowSnapshot(updatedFlow, scope, 'updated');
    return updatedFlow;
  }

  async deleteFlow(flowId: string, scope: OwnerScope): Promise<boolean> {
    await this.ensureIndexes();

    const deleted = await this.flowsCollection().findOneAndDelete({
      id: flowId,
      ownerUserId: scope.userId,
      ownerTenantId: scope.tenantId,
    });

    if (!deleted) {
      return false;
    }

    await Promise.all([
      this.runsCollection().deleteMany({
        flowId,
        ownerUserId: scope.userId,
        ownerTenantId: scope.tenantId,
      }),
      this.historyCollection().deleteMany({
        flowId,
        ownerUserId: scope.userId,
        ownerTenantId: scope.tenantId,
      }),
    ]);

    return true;
  }

  async listFlowHistory(
    flowId: string,
    scope: OwnerScope,
    limit = 30
  ): Promise<StudioFlowHistoryDocument[]> {
    await this.ensureIndexes();

    const docs = await this.historyCollection()
      .find({
        flowId,
        ownerUserId: scope.userId,
        ownerTenantId: scope.tenantId,
      })
      .sort({ createdAt: -1 })
      .limit(Math.max(1, Math.min(limit, 100)))
      .toArray();

    return docs.map(doc => this.toHistoryDocument(doc));
  }

  async restoreFlowFromHistory(
    flowId: string,
    historyId: string,
    scope: OwnerScope
  ): Promise<StudioFlowDocument | null> {
    await this.ensureIndexes();

    const history = await this.historyCollection().findOne({
      id: historyId,
      flowId,
      ownerUserId: scope.userId,
      ownerTenantId: scope.tenantId,
    });

    if (!history) {
      return null;
    }

    const snapshot = history.snapshot as StudioFlowDocument;
    const updatePayload = {
      name: snapshot.name,
      description: snapshot.description || '',
      status: snapshot.status,
      webhook: snapshot.webhook,
      nodes: this.sanitizeNodesForPersistence(snapshot.nodes),
      edges: snapshot.edges,
      isSample: !!snapshot.isSample,
      updatedAt: new Date().toISOString(),
    };

    const result = await this.flowsCollection().findOneAndUpdate(
      {
        id: flowId,
        ownerUserId: scope.userId,
        ownerTenantId: scope.tenantId,
      },
      { $set: updatePayload },
      { returnDocument: 'after' }
    );

    if (!result) {
      return null;
    }

    const restoredFlow = this.toFlowDocument(result);
    await this.createFlowSnapshot(restoredFlow, scope, `restored:${historyId}`);
    return restoredFlow;
  }

  async createSampleFlow(
    scope: OwnerScope,
    templateId: StudioSampleTemplateId = 'loop_users'
  ): Promise<StudioFlowDocument> {
    if (templateId === 'simple_api' || templateId === 'simple_url') {
      return this.createFlow(scope, this.buildSimpleUrlSampleTemplate());
    }

    if (templateId === 'simple_body') {
      return this.createFlow(scope, this.buildSimpleBodySampleTemplate());
    }

    if (templateId === 'ai_basic') {
      return this.createFlow(scope, this.buildAISampleTemplate());
    }

    if (templateId === 'ai_orchestrator') {
      return this.createFlow(scope, this.buildAIOrchestratorSampleTemplate());
    }

    return this.createFlow(scope, this.buildLoopSampleTemplate());
  }

  private buildSimpleUrlSampleTemplate(): StudioFlowCreateInput {
    return {
      name: 'Sample: Webhook To URL',
      description:
        'Webhook -> HTTP GET -> Output. Uses webhook fields in the URL so it is easy to see path and query parameter mapping.',
      status: 'active',
      isSample: true,
      nodes: [
        {
          id: 'sample_simple_webhook',
          type: 'webhook',
          name: 'Webhook Trigger',
          position: { x: 80, y: 180 },
          config: {},
        },
        {
          id: 'sample_simple_url_http',
          type: 'http',
          name: 'Request With URL Mapping',
          position: { x: 400, y: 180 },
          config: {
            method: 'GET',
            url: 'https://httpbin.org/anything/todos/{{trigger.body.todoId}}?requestedBy={{trigger.body.requestedBy}}&category={{trigger.body.category}}',
            headers: {
              accept: 'application/json',
            },
            parseAs: 'json',
            timeoutMs: 10000,
          },
        },
        {
          id: 'sample_simple_output',
          type: 'output',
          name: 'Output',
          position: { x: 760, y: 180 },
          config: {
            template: {
              message: 'URL mapping sample completed',
              webhookPayload: '{{trigger.body}}',
              requestUrl: '{{input.request.url}}',
              echoedMethod: '{{input.data.method}}',
              echoedUrl: '{{input.data.url}}',
              urlParts: '{{input.data.args}}',
            },
          },
        },
      ],
      edges: [
        {
          id: 'sample_simple_edge_1',
          source: 'sample_simple_webhook',
          target: 'sample_simple_url_http',
        },
        {
          id: 'sample_simple_edge_2',
          source: 'sample_simple_url_http',
          target: 'sample_simple_output',
        },
      ],
    };
  }

  private buildSimpleBodySampleTemplate(): StudioFlowCreateInput {
    return {
      name: 'Sample: Webhook To Body',
      description:
        'Webhook -> HTTP POST -> Output. Uses webhook fields in the JSON body so it is easy to inspect body mapping.',
      status: 'active',
      isSample: true,
      nodes: [
        {
          id: 'sample_simple_body_webhook',
          type: 'webhook',
          name: 'Webhook Trigger',
          position: { x: 80, y: 180 },
          config: {},
        },
        {
          id: 'sample_simple_body_http',
          type: 'http',
          name: 'Request With Body Mapping',
          position: { x: 400, y: 180 },
          config: {
            method: 'POST',
            url: 'https://httpbin.org/anything/studio/body-demo',
            headers: {
              accept: 'application/json',
              'content-type': 'application/json',
            },
            body: {
              todoId: '{{trigger.body.todoId}}',
              note: '{{trigger.body.note}}',
              requestedBy: '{{trigger.body.requestedBy}}',
              priority: '{{trigger.body.priority}}',
            },
            parseAs: 'json',
            timeoutMs: 10000,
          },
        },
        {
          id: 'sample_simple_body_output',
          type: 'output',
          name: 'Output',
          position: { x: 760, y: 180 },
          config: {
            template: {
              message: 'Body mapping sample completed',
              webhookPayload: '{{trigger.body}}',
              requestUrl: '{{input.request.url}}',
              requestBody: '{{input.request.body}}',
              echoedMethod: '{{input.data.method}}',
              echoedUrl: '{{input.data.url}}',
              echoedJson: '{{input.data.json}}',
            },
          },
        },
      ],
      edges: [
        {
          id: 'sample_simple_body_edge_1',
          source: 'sample_simple_body_webhook',
          target: 'sample_simple_body_http',
        },
        {
          id: 'sample_simple_body_edge_2',
          source: 'sample_simple_body_http',
          target: 'sample_simple_body_output',
        },
      ],
    };
  }

  private buildLoopSampleTemplate(): StudioFlowCreateInput {
    return {
      name: 'Sample: Loop Through Users',
      description:
        'Fetches users from a public API, loops through each user, posts each one to httpbin, then returns loop summary.',
      status: 'active',
      isSample: true,
      nodes: [
        {
          id: 'sample_webhook',
          type: 'webhook',
          name: 'Webhook Trigger',
          position: { x: 80, y: 200 },
          config: {},
        },
        {
          id: 'sample_fetch_users',
          type: 'http',
          name: 'Fetch Users',
          position: { x: 380, y: 120 },
          config: {
            method: 'GET',
            url: 'https://jsonplaceholder.typicode.com/users',
            headers: {
              accept: 'application/json',
            },
            parseAs: 'json',
            timeoutMs: 10000,
          },
        },
        {
          id: 'sample_loop_users',
          type: 'loop',
          name: 'Loop Users',
          position: { x: 680, y: 120 },
          config: {
            listPath: 'nodes.sample_fetch_users.data',
            itemField: 'user',
            indexField: 'userIndex',
            maxItems: 100,
          },
        },
        {
          id: 'sample_forward_httpbin',
          type: 'http',
          name: 'Send User to httpbin',
          position: { x: 980, y: 80 },
          config: {
            method: 'POST',
            url: 'https://httpbin.org/post',
            headers: {
              'content-type': 'application/json',
            },
            body: {
              source: 'studio-sample',
              event: '{{trigger.body.event}}',
              index: '{{input.userIndex}}',
              userId: '{{input.user.id}}',
              userName: '{{input.user.name}}',
              userEmail: '{{input.user.email}}',
            },
            timeoutMs: 10000,
          },
        },
        {
          id: 'sample_output',
          type: 'output',
          name: 'Output',
          position: { x: 1260, y: 250 },
          config: {
            template: {
              message: 'Sample flow completed',
              processedUsers: '{{input.count}}',
              lastForwardedUser: '{{nodes.sample_forward_httpbin.data.json}}',
              triggerPayload: '{{trigger.body}}',
            },
          },
        },
      ],
      edges: [
        {
          id: 'sample_edge_1',
          source: 'sample_webhook',
          target: 'sample_fetch_users',
        },
        {
          id: 'sample_edge_2',
          source: 'sample_fetch_users',
          target: 'sample_loop_users',
        },
        {
          id: 'sample_edge_3',
          source: 'sample_loop_users',
          target: 'sample_forward_httpbin',
          sourceHandle: 'item',
          condition: 'item',
        },
        {
          id: 'sample_edge_4',
          source: 'sample_loop_users',
          target: 'sample_output',
          sourceHandle: 'done',
          condition: 'done',
        },
      ],
    };
  }

  private buildAISampleTemplate(): StudioFlowCreateInput {
    return {
      name: 'Sample: AI Inference',
      description:
        'Webhook -> AI inference -> Output. Configure provider/model credentials in the AI node.',
      status: 'active',
      isSample: true,
      nodes: [
        {
          id: 'sample_ai_webhook',
          type: 'webhook',
          name: 'Webhook Trigger',
          position: { x: 80, y: 180 },
          config: {},
        },
        {
          id: 'sample_ai_node',
          type: 'ai',
          name: 'AI Inference',
          position: { x: 420, y: 180 },
          config: {
            provider: 'azure_openai',
            deployment: process.env.AZURE_OPENAI_DEPLOYMENT_NAME || 'gpt-4.1',
            inputPath: 'trigger.body.prompt',
            systemPrompt: 'You are a concise assistant helping with backend automation tasks.',
            temperature: 0.3,
            maxTokens: 300,
          },
        },
        {
          id: 'sample_ai_output',
          type: 'output',
          name: 'Output',
          position: { x: 760, y: 180 },
          config: {
            template: {
              message: 'AI sample completed',
              aiText: '{{input.output}}',
              provider: '{{input.provider}}',
              model: '{{input.model}}',
            },
          },
        },
      ],
      edges: [
        {
          id: 'sample_ai_edge_1',
          source: 'sample_ai_webhook',
          target: 'sample_ai_node',
        },
        {
          id: 'sample_ai_edge_2',
          source: 'sample_ai_node',
          target: 'sample_ai_output',
        },
      ],
    };
  }

  private buildAIOrchestratorSampleTemplate(): StudioFlowCreateInput {
    return {
      name: 'Sample: AI Orchestrator',
      description:
        'Chat -> AI orchestrator -> tools. Ask questions in the Studio chat panel, and the orchestrator can use a public GET API plus your Paddie memory.',
      status: 'active',
      isSample: true,
      nodes: [
        {
          id: 'sample_orch_chat',
          type: 'chat',
          name: 'Chat Input',
          position: { x: 80, y: 220 },
          config: {
            welcomeMessage:
              'Ask about the sample customer directory or anything stored in your memory.',
            placeholder:
              "Try: What is Bret's email? or Please check your memory for what you know about my family.",
            messagePath: 'trigger.chat.message',
            historyPath: 'trigger.chat.history',
            conversationIdPath: 'trigger.chat.conversationId',
          },
        },
        {
          id: 'sample_orch_master',
          type: 'orchestrator',
          name: 'Master AI Orchestrator',
          position: { x: 420, y: 220 },
          config: {
            credentialSource: 'paddie_system',
            provider: 'azure_openai',
            deployment: process.env.AZURE_OPENAI_DEPLOYMENT_NAME || 'gpt-4.1',
            instructionPath: 'input.message',
            historyPath: 'input.history',
            systemPrompt:
              'You are the Studio master orchestrator. Answer the user conversationally, but ground answers in connected tools before you reply. If the request is about the current user, their identity, family, preferences, projects, or previously shared facts, check memory first. If the request is about sample customer data such as names, emails, usernames, companies, phone numbers, or websites, consult the customer directory tool first. Use retrieved evidence directly, avoid generic fallback text, and ask one focused follow-up question if the evidence is incomplete.',
            maxToolCalls: 6,
            temperature: 0.2,
            maxTokens: 700,
          },
        },
        {
          id: 'sample_orch_http_tool',
          type: 'http',
          name: 'Customer Directory API',
          position: { x: 760, y: 100 },
          config: {
            method: 'GET',
            url: 'https://jsonplaceholder.typicode.com/users',
            headers: {
              accept: 'application/json',
            },
            parseAs: 'json',
            timeoutMs: 10000,
          },
        },
        {
          id: 'sample_orch_memory_tool',
          type: 'memory',
          name: 'Current User Memory',
          position: { x: 760, y: 300 },
          config: {
            authMode: 'session',
            action: 'retrieve',
            strategy: 'auto',
            limit: 8,
            query: '{{input.message}}',
          },
        },
        {
          id: 'sample_orch_output',
          type: 'output',
          name: 'Output',
          position: { x: 1080, y: 220 },
          config: {
            template: {
              reply: '{{input.output}}',
              message: 'Orchestrator sample completed',
              lastUserMessage: '{{trigger.chat.message}}',
              conversationId: '{{trigger.chat.conversationId}}',
              toolCount: '{{input.toolRuns.length}}',
              toolRuns: '{{input.toolRuns}}',
            },
          },
        },
      ],
      edges: [
        {
          id: 'sample_orch_edge_1',
          source: 'sample_orch_chat',
          target: 'sample_orch_master',
        },
        {
          id: 'sample_orch_edge_2',
          source: 'sample_orch_master',
          target: 'sample_orch_http_tool',
          sourceHandle: 'tool',
          condition: 'tool',
        },
        {
          id: 'sample_orch_edge_3',
          source: 'sample_orch_master',
          target: 'sample_orch_memory_tool',
          sourceHandle: 'tool',
          condition: 'tool',
        },
        {
          id: 'sample_orch_edge_4',
          source: 'sample_orch_master',
          target: 'sample_orch_output',
          sourceHandle: 'next',
          condition: 'next',
        },
      ],
    };
  }

  async createRun(run: StudioRunDocument): Promise<void> {
    await this.ensureIndexes();
    await this.runsCollection().insertOne(run);
    await this.redis.setJson(`run:${run.id}`, run, 86400);
  }

  async listRuns(flowId: string, scope: OwnerScope, limit = 20): Promise<StudioRunDocument[]> {
    await this.ensureIndexes();

    const docs = await this.runsCollection()
      .find({
        flowId,
        ownerUserId: scope.userId,
        ownerTenantId: scope.tenantId,
      })
      .sort({ startedAt: -1 })
      .limit(Math.max(1, Math.min(limit, 100)))
      .toArray();

    return docs.map(doc => this.toRunDocument(doc));
  }

  async getRunById(runId: string, scope: OwnerScope): Promise<StudioRunDocument | null> {
    await this.ensureIndexes();
    const cached = await this.redis.getJson<StudioRunDocument>(`run:${runId}`);
    if (cached && cached.ownerUserId === scope.userId && cached.ownerTenantId === scope.tenantId) {
      return cached;
    }

    const doc = await this.runsCollection().findOne({
      id: runId,
      ownerUserId: scope.userId,
      ownerTenantId: scope.tenantId,
    });
    const normalized = doc ? this.toRunDocument(doc) : null;
    if (normalized) {
      await this.redis.setJson(`run:${runId}`, normalized, 86400);
    }
    return normalized;
  }

  async createArtifact(input: Omit<StudioArtifactDocument, 'id' | 'createdAt'>): Promise<StudioArtifactDocument> {
    await this.ensureIndexes();

    const artifact: StudioArtifactDocument = {
      id: `studio_art_${randomUUID()}`,
      createdAt: new Date().toISOString(),
      ...input,
    };

    await this.artifactsCollection().insertOne(artifact);
    return artifact;
  }

  private flowsCollection() {
    return this.mongodb.collection('studio_flows');
  }

  private runsCollection() {
    return this.mongodb.collection('studio_flow_runs');
  }

  private historyCollection() {
    return this.mongodb.collection('studio_flow_history');
  }

  private artifactsCollection() {
    return this.mongodb.collection('studio_artifacts');
  }

  private toFlowDocument(doc: any): StudioFlowDocument {
    return {
      ...(doc as StudioFlowDocument),
      nodes: this.sanitizeNodesForPersistence(doc?.nodes),
    } as StudioFlowDocument;
  }

  private toRunDocument(doc: any): StudioRunDocument {
    return doc as StudioRunDocument;
  }

  private toHistoryDocument(doc: any): StudioFlowHistoryDocument {
    return {
      ...(doc as StudioFlowHistoryDocument),
      snapshot: doc?.snapshot
        ? {
            ...(doc.snapshot as StudioFlowDocument),
            nodes: this.sanitizeNodesForPersistence(doc.snapshot.nodes),
          }
        : doc?.snapshot,
    } as StudioFlowHistoryDocument;
  }

  private sanitizeNodesForPersistence(nodes?: StudioNode[]): StudioNode[] {
    if (!Array.isArray(nodes)) {
      return [];
    }

    return nodes.map(node => {
      if (!node || node.type !== 'memory') {
        return node;
      }

      const config =
        node.config && typeof node.config === 'object' ? { ...node.config } : {};
      const action = String(config.action || 'router').trim().toLowerCase();
      const authMode = String(config.authMode || '').trim().toLowerCase();
      if (action === 'router' && !String(config.mode || '').trim()) {
        config.mode = 'conversation';
      }

      if (authMode !== 'session') {
        return {
          ...node,
          config,
        };
      }

      if (!Object.prototype.hasOwnProperty.call(config, 'userId')) {
        return {
          ...node,
          config,
        };
      }

      delete config.userId;
      return {
        ...node,
        config,
      };
    });
  }

  private normalizeWebhookMethod(method?: string): StudioWebhookMethod {
    const normalized = (method || 'POST').toUpperCase();
    const allowed: StudioWebhookMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'ANY'];
    if (allowed.includes(normalized as StudioWebhookMethod)) {
      return normalized as StudioWebhookMethod;
    }
    return 'POST';
  }

  private async ensureIndexes(): Promise<void> {
    if (this.indexesEnsured) {
      return;
    }

    try {
      await this.flowsCollection().createIndex(
        { ownerUserId: 1, ownerTenantId: 1, updatedAt: -1 },
        { background: true }
      );
      await this.flowsCollection().createIndex(
        { 'webhook.id': 1 },
        {
          unique: true,
          background: true,
          partialFilterExpression: { 'webhook.id': { $exists: true } },
        }
      );
      await this.runsCollection().createIndex(
        { flowId: 1, ownerUserId: 1, ownerTenantId: 1, startedAt: -1 },
        { background: true }
      );
      await this.historyCollection().createIndex(
        { flowId: 1, ownerUserId: 1, ownerTenantId: 1, createdAt: -1 },
        { background: true }
      );
      await this.historyCollection().createIndex(
        { id: 1 },
        {
          unique: true,
          background: true,
          partialFilterExpression: { id: { $exists: true } },
        }
      );

      this.indexesEnsured = true;
    } catch (error) {
      logger.warn('Studio indexes ensure warning (may already exist):', error);
      this.indexesEnsured = true;
    }
  }

  private async createFlowSnapshot(
    flow: StudioFlowDocument,
    scope: OwnerScope,
    reason: string
  ): Promise<void> {
    try {
      const snapshot: StudioFlowHistoryDocument = {
        id: `studio_hist_${randomUUID()}`,
        flowId: flow.id,
        ownerUserId: scope.userId,
        ownerTenantId: scope.tenantId,
        snapshot: {
          ...flow,
          nodes: this.sanitizeNodesForPersistence(flow.nodes),
          edges: Array.isArray(flow.edges) ? [...flow.edges] : [],
        },
        reason,
        createdAt: new Date().toISOString(),
      };
      await this.historyCollection().insertOne(snapshot);
    } catch (error) {
      logger.warn('Failed to create Studio flow snapshot:', error);
    }
  }
}
