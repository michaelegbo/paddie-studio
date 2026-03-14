import { config } from '../config';
import {
  StudioEdge,
  StudioExecutionResult,
  StudioExecutionTraceDispatch,
  StudioExecutionTraceStep,
  StudioFlowDocument,
  StudioNode,
} from '../types/studio.types';
import {
  StudioAIProvider,
  StudioAIProviderService,
} from './studio-ai-provider.service';

interface NodeRuntimeContext {
  trigger: any;
  input: any;
  nodes: Record<string, any>;
  auth?: ExecutionActorContext;
  item?: any;
  itemIndex?: number;
  items?: any[];
}

interface NodeTestPayload {
  trigger?: any;
  input?: any;
  nodes?: Record<string, any>;
}

interface ExecutionFrame {
  nodeId: string;
  input: any;
}

interface NodeDispatch {
  branch: string;
  input: any;
}

interface FlowGraph {
  nodeMap: Map<string, StudioNode>;
  outgoingMap: Map<string, StudioEdge[]>;
  incomingMap: Map<string, StudioEdge[]>;
}

interface ExecutionActorContext {
  userId: string;
  tenantId: string;
  email?: string;
  accessToken?: string;
  refreshToken?: string;
  sessionId?: string;
}

interface ExecutionOptions {
  actor?: ExecutionActorContext;
}

interface NodeExecutionOptions {
  allowOrchestrator?: boolean;
}

interface OrchestratorPolicyAnalysis {
  wantsMemoryLookup: boolean;
  wantsDirectoryLookup: boolean;
  memoryQuery?: string;
  reasons: string[];
  recentUserTurns: string[];
}

interface OrchestratorPrefetchRun {
  stage: 'prefetch';
  reason: string;
  tool: string;
  nodeId?: string;
  argsSnapshot?: any;
  output: any;
  summary: string;
}

export class StudioExecutionService {
  private static instance: StudioExecutionService;
  private readonly defaultInternalApiBaseUrl: string;
  private readonly aiProviderService: StudioAIProviderService;

  private constructor() {
    this.defaultInternalApiBaseUrl =
      process.env.STUDIO_INTERNAL_API_BASE_URL || `http://localhost:${config.server.port}/api`;
    this.aiProviderService = StudioAIProviderService.getInstance();
  }

  static getInstance(): StudioExecutionService {
    if (!StudioExecutionService.instance) {
      StudioExecutionService.instance = new StudioExecutionService();
    }
    return StudioExecutionService.instance;
  }

  async execute(
    flow: StudioFlowDocument,
    triggerPayload: any,
    options: ExecutionOptions = {}
  ): Promise<StudioExecutionResult> {
    const startedAtDate = new Date();
    const startedAt = startedAtDate.toISOString();

    const nodeResults: Record<string, any> = {};
    const executedNodeIds: string[] = [];
    const executionTrace: StudioExecutionTraceStep[] = [];

    try {
      const graph = this.buildFlowGraph(flow);
      const actor = this.resolveActorContext(triggerPayload, options.actor);

      const queue: ExecutionFrame[] = this.getStartNodeIds(
        flow.nodes,
        graph.incomingMap,
        triggerPayload
      ).map(nodeId => ({
        nodeId,
        input: undefined,
      }));
      const maxSteps = this.getMaxExecutionSteps();
      let processedSteps = 0;

      while (queue.length > 0) {
        const frame = queue.shift()!;
        const node = graph.nodeMap.get(frame.nodeId);
        if (!node) continue;

        processedSteps += 1;
        if (processedSteps > maxSteps) {
          throw new Error(
            `Flow execution stopped after ${maxSteps} steps. Check for an infinite loop in your graph.`
          );
        }

        const baseContext: NodeRuntimeContext = {
          trigger: triggerPayload,
          input: frame.input,
          nodes: nodeResults,
          auth: actor,
        };
        const inputSnapshot = this.createTraceSnapshot(frame.input);

        const nodeStartedAtDate = new Date();
        let result: any;
        try {
          result = await this.executeNodeWithRuntimeOptions(node, baseContext, graph, {
            allowOrchestrator: true,
          });
        } catch (nodeError) {
          const nodeEndedAtDate = new Date();
          executionTrace.push({
            step: processedSteps,
            nodeId: node.id,
            nodeType: node.type,
            status: 'failed',
            startedAt: nodeStartedAtDate.toISOString(),
            endedAt: nodeEndedAtDate.toISOString(),
            durationMs: nodeEndedAtDate.getTime() - nodeStartedAtDate.getTime(),
            inputSnapshot,
            dispatches: [],
            error: nodeError instanceof Error ? nodeError.message : 'Node execution failed',
          });
          throw nodeError;
        }

        const traceDispatches: StudioExecutionTraceDispatch[] = [];
        nodeResults[node.id] = result;
        executedNodeIds.push(node.id);

        const outgoingEdges = graph.outgoingMap.get(node.id) || [];
        const dispatches = this.buildDispatches(node, result);
        for (const dispatch of dispatches) {
          const selectedOutgoing = this.selectOutgoingEdges(
            node,
            outgoingEdges,
            result,
            dispatch.branch
          );
          for (const edge of selectedOutgoing) {
            traceDispatches.push({
              branch: dispatch.branch,
              edgeId: edge.id,
              sourceNodeId: edge.source,
              targetNodeId: edge.target,
              inputSnapshot: this.createTraceSnapshot(dispatch.input),
            });
            queue.push({
              nodeId: edge.target,
              input: dispatch.input,
            });
          }
        }

        const nodeEndedAtDate = new Date();
        executionTrace.push({
          step: processedSteps,
          nodeId: node.id,
          nodeType: node.type,
          status: 'success',
          startedAt: nodeStartedAtDate.toISOString(),
          endedAt: nodeEndedAtDate.toISOString(),
          durationMs: nodeEndedAtDate.getTime() - nodeStartedAtDate.getTime(),
          inputSnapshot,
          dispatches: traceDispatches,
        });
      }

      const output = this.resolveFinalOutput(flow, executedNodeIds, nodeResults);
      const endedAtDate = new Date();

      return {
        status: 'success',
        output,
        nodeResults,
        executedNodeIds,
        executionTrace,
        startedAt,
        endedAt: endedAtDate.toISOString(),
        durationMs: endedAtDate.getTime() - startedAtDate.getTime(),
      };
    } catch (error) {
      const endedAtDate = new Date();
      return {
        status: 'failed',
        output: null,
        nodeResults,
        executedNodeIds,
        executionTrace,
        startedAt,
        endedAt: endedAtDate.toISOString(),
        durationMs: endedAtDate.getTime() - startedAtDate.getTime(),
        error: error instanceof Error ? error.message : 'Flow execution failed',
      };
    }
  }

  async testNode(
    flow: StudioFlowDocument,
    nodeId: string,
    payload: NodeTestPayload = {},
    options: ExecutionOptions = {}
  ): Promise<any> {
    const node = flow.nodes.find(item => item.id === nodeId);
    if (!node) {
      throw new Error(`Node ${nodeId} not found in flow`);
    }

    const graph = this.buildFlowGraph(flow);
    const actor = this.resolveActorContext(payload.trigger, options.actor);
    const baseContext: NodeRuntimeContext = {
      trigger: payload.trigger ?? { body: {} },
      input: payload.input,
      nodes: payload.nodes || {},
      auth: actor,
    };

    const result = await this.executeNodeWithRuntimeOptions(node, baseContext, graph, {
      allowOrchestrator: true,
    });
    return {
      nodeId: node.id,
      nodeType: node.type,
      input: this.applyNodeInputMapping(node, baseContext),
      result,
    };
  }

  private buildFlowGraph(flow: StudioFlowDocument): FlowGraph {
    const nodeMap = new Map(flow.nodes.map(node => [node.id, node]));
    const outgoingMap = new Map<string, StudioEdge[]>();
    const incomingMap = new Map<string, StudioEdge[]>();

    for (const node of flow.nodes) {
      outgoingMap.set(node.id, []);
      incomingMap.set(node.id, []);
    }

    for (const edge of flow.edges) {
      if (!nodeMap.has(edge.source) || !nodeMap.has(edge.target)) continue;
      outgoingMap.get(edge.source)!.push(edge);
      incomingMap.get(edge.target)!.push(edge);
    }

    return {
      nodeMap,
      outgoingMap,
      incomingMap,
    };
  }

  private resolveFinalOutput(
    flow: StudioFlowDocument,
    executedNodeIds: string[],
    nodeResults: Record<string, any>
  ): any {
    const nodeMap = new Map(flow.nodes.map(node => [node.id, node]));

    for (let i = executedNodeIds.length - 1; i >= 0; i -= 1) {
      const nodeId = executedNodeIds[i];
      const node = nodeMap.get(nodeId);
      if (node?.type === 'output' && nodeResults[nodeId]) {
        return nodeResults[nodeId].output ?? nodeResults[nodeId].data;
      }
    }

    const lastNodeId = executedNodeIds[executedNodeIds.length - 1];
    return lastNodeId ? nodeResults[lastNodeId] : null;
  }

  private async executeNode(
    node: StudioNode,
    context: NodeRuntimeContext,
    graph: FlowGraph,
    options: NodeExecutionOptions
  ): Promise<any> {
    switch (node.type) {
      case 'chat':
        return this.executeChatNode(node, context);
      case 'webhook': {
        const trigger = context.trigger || {};
        return {
          nodeType: 'webhook',
          data: trigger.body ?? {},
          body: trigger.body ?? {},
          headers: trigger.headers ?? {},
          query: trigger.query ?? {},
          method: trigger.method,
        };
      }
      case 'http':
        return this.executeHttpNode(node, context);
      case 'memory':
        return this.executeMemoryNode(node, context);
      case 'websocket':
        return this.executeWebsocketNode(node, context);
      case 'condition':
        return this.executeConditionNode(node, context);
      case 'ai':
        return this.executeAINode(node, context);
      case 'orchestrator':
        if (options.allowOrchestrator === false) {
          throw new Error(`Orchestrator node "${node.name}" cannot be called as a tool`);
        }
        return this.executeOrchestratorNode(node, context, graph);
      case 'loop':
        return this.executeLoopNode(node, context);
      case 'output':
        return this.executeOutputNode(node, context);
      default:
        throw new Error(`Unsupported node type: ${node.type}`);
    }
  }

  private async executeNodeWithRuntimeOptions(
    node: StudioNode,
    context: NodeRuntimeContext,
    graph: FlowGraph,
    options: NodeExecutionOptions
  ): Promise<any> {
    const shouldIterate = node.type !== 'webhook' && node.config?.iterate === true;
    if (!shouldIterate) {
      const mappedContext: NodeRuntimeContext = {
        ...context,
        input: this.applyNodeInputMapping(node, context),
      };
      return this.executeNode(node, mappedContext, graph, options);
    }

    const iteratePath = String(node.config?.iteratePath || 'input').trim() || 'input';
    const collection = this.resolveMappingPath(iteratePath, context);
    if (!Array.isArray(collection)) {
      const mappedContext: NodeRuntimeContext = {
        ...context,
        input: this.applyNodeInputMapping(node, context),
      };
      return this.executeNode(node, mappedContext, graph, options);
    }

    const items = collection;
    const itemResults: any[] = [];
    for (let index = 0; index < items.length; index++) {
      const item = items[index];
      const itemBaseContext: NodeRuntimeContext = {
        ...context,
        input: item,
        item,
        itemIndex: index,
        items,
      };
      const mappedItemContext: NodeRuntimeContext = {
        ...itemBaseContext,
        input: this.applyNodeInputMapping(node, itemBaseContext),
      };
      const itemResult = await this.executeNode(node, mappedItemContext, graph, options);
      itemResults.push(itemResult);
    }

    return {
      nodeType: node.type,
      mode: 'iterate',
      iteratePath,
      count: itemResults.length,
      items: itemResults,
      data: itemResults,
    };
  }

  private async executeHttpNode(node: StudioNode, context: NodeRuntimeContext): Promise<any> {
    const resolvedConfig = this.interpolateValue(node.config || {}, context);
    const method = String(resolvedConfig.method || 'GET').toUpperCase();
    const url = resolvedConfig.url;

    if (!url || typeof url !== 'string') {
      throw new Error(`HTTP node "${node.name}" is missing a valid URL`);
    }

    const headers = { ...(resolvedConfig.headers || {}) } as Record<string, string>;
    const timeoutMs = Number(resolvedConfig.timeoutMs || 15000);

    let requestBody: string | undefined;
    if (!['GET', 'HEAD'].includes(method) && resolvedConfig.body !== undefined) {
      if (typeof resolvedConfig.body === 'string') {
        requestBody = resolvedConfig.body;
      } else {
        if (!headers['content-type']) {
          headers['content-type'] = 'application/json';
        }
        requestBody = JSON.stringify(resolvedConfig.body);
      }
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: requestBody,
        signal: controller.signal,
      });

      const parseAs = String(resolvedConfig.parseAs || 'auto').toLowerCase();
      const contentType = response.headers.get('content-type') || '';
      let data: any;

      if (parseAs === 'text') {
        data = await response.text();
      } else if (parseAs === 'json' || contentType.includes('application/json')) {
        const raw = await response.text();
        try {
          data = raw ? JSON.parse(raw) : null;
        } catch (_error) {
          data = raw;
        }
      } else {
        data = await response.text();
      }

      if (!response.ok) {
        throw new Error(
          `HTTP node "${node.name}" failed with ${response.status}: ${JSON.stringify(data)}`
        );
      }

      return {
        nodeType: 'http',
        request: {
          method,
          url,
          headers,
          body: requestBody ? this.tryParseJson(requestBody) : undefined,
        },
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        data,
        headers: this.headersToObject(response.headers),
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private async executeMemoryNode(node: StudioNode, context: NodeRuntimeContext): Promise<any> {
    const resolvedConfig = this.interpolateValue(node.config || {}, context);
    const action = String(resolvedConfig.action || 'router').toLowerCase();
    const authMode = String(resolvedConfig.authMode || 'api_key').toLowerCase();
    const apiKey = String(resolvedConfig.apiKey || '');
    const actor = this.resolveActorContext(context.trigger, context.auth);
    const configuredUserId =
      String(resolvedConfig.userId || '').trim() ||
      String(context.trigger?.body?.user_id || context.trigger?.body?.userId || '').trim() ||
      String(context.trigger?.chat?.user_id || context.trigger?.chat?.userId || '').trim() ||
      String(context.trigger?.user?.user_id || context.trigger?.user?.userId || '').trim() ||
      String(context.auth?.userId || '').trim();

    if (authMode !== 'session' && !apiKey) {
      return {
        nodeType: 'memory',
        action,
        skipped: true,
        reason: 'Missing apiKey in memory node config',
      };
    }

    const baseUrl = String(
      resolvedConfig.baseUrl ||
        (authMode === 'session' ? config.paddie.apiBaseUrl : this.defaultInternalApiBaseUrl)
    ).replace(/\/$/, '');
    const endpoint = this.resolveMemoryEndpoint(action, authMode);

    if (!endpoint) {
      throw new Error(`Memory node "${node.name}" has unsupported action "${action}"`);
    }
    const headers: Record<string, string> = {
      'content-type': 'application/json',
    };
    let effectiveUserId = configuredUserId;

    if (authMode === 'session') {
      if (!actor?.userId || !actor.tenantId) {
        return {
          nodeType: 'memory',
          action,
          skipped: true,
          reason: 'Memory node requires session user context when authMode is "session"',
        };
      }

      // Session mode must follow the authenticated Studio user, matching playground behavior.
      effectiveUserId = String(actor.userId).trim();
      if (!actor.accessToken) {
        return {
          nodeType: 'memory',
          action,
          skipped: true,
          reason: 'Memory session mode requires an authenticated Studio access token',
        };
      }
      headers.authorization = `Bearer ${actor.accessToken}`;
    } else {
      headers['x-api-key'] = apiKey;
    }

    const body = this.buildMemoryBody(action, resolvedConfig, context, effectiveUserId);

    const response = await fetch(`${baseUrl}${endpoint}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    const raw = await response.text();
    let data: any;
    try {
      data = raw ? JSON.parse(raw) : null;
    } catch (_error) {
      data = raw;
    }

    if (!response.ok) {
      throw new Error(`Memory node "${node.name}" failed with ${response.status}: ${JSON.stringify(data)}`);
    }

    return {
      nodeType: 'memory',
      action,
      status: response.status,
      data,
      request: {
        endpoint,
        body,
        authMode,
        userId: effectiveUserId,
        ...(authMode === 'session'
          ? { credential: 'studio-session', sessionUserId: actor?.userId }
          : { apiKeyPrefix: `${apiKey.slice(0, 8)}...` }),
      },
    };
  }

  private async executeWebsocketNode(node: StudioNode, context: NodeRuntimeContext): Promise<any> {
    const resolvedConfig = this.interpolateValue(node.config || {}, context);
    const url = String(resolvedConfig.url || '');

    if (!url) {
      throw new Error(`WebSocket node "${node.name}" is missing a URL`);
    }

    const WebSocketCtor: any = (globalThis as any).WebSocket;
    if (!WebSocketCtor) {
      throw new Error(
        'WebSocket runtime is unavailable. Provide STUDIO_INTERNAL_WS_BRIDGE or run on a Node runtime with global WebSocket support.'
      );
    }

    const waitForResponse = resolvedConfig.waitForResponse !== false;
    const timeoutMs = Number(resolvedConfig.timeoutMs || 7000);
    const messageValue = resolvedConfig.message;
    const outboundMessage =
      messageValue === undefined || messageValue === null
        ? undefined
        : typeof messageValue === 'string'
          ? messageValue
          : JSON.stringify(messageValue);

    return new Promise((resolve, reject) => {
      const ws = new WebSocketCtor(url);
      let settled = false;

      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try {
          ws.close();
        } catch (_error) {
          // noop
        }
        fn();
      };

      const timer = setTimeout(() => {
        finish(() => reject(new Error(`WebSocket node "${node.name}" timed out after ${timeoutMs}ms`)));
      }, timeoutMs);

      ws.onopen = () => {
        try {
          if (outboundMessage !== undefined) {
            ws.send(outboundMessage);
          }

          if (!waitForResponse) {
            finish(() =>
              resolve({
                nodeType: 'websocket',
                url,
                sent: outboundMessage || null,
                data: null,
              })
            );
          }
        } catch (error) {
          finish(() => reject(error));
        }
      };

      ws.onmessage = (event: any) => {
        finish(() =>
          resolve({
            nodeType: 'websocket',
            url,
            sent: outboundMessage || null,
            data: event?.data ?? null,
          })
        );
      };

      ws.onerror = () => {
        finish(() => reject(new Error(`WebSocket node "${node.name}" failed for ${url}`)));
      };
    });
  }

  private async executeOutputNode(node: StudioNode, context: NodeRuntimeContext): Promise<any> {
    const template = node.config?.template;
    let output: any;
    if (template !== undefined) {
      output = this.interpolateValue(template, context);
    } else if (node.config?.message !== undefined || node.config?.includeLastNodeData !== undefined) {
      output = {
        message: node.config?.message || '',
      };
      if (node.config?.includeLastNodeData !== false) {
        output.data = context.input;
      }
    } else {
      output = context.input;
    }

    return {
      nodeType: 'output',
      output,
      data: output,
    };
  }

  private async executeConditionNode(node: StudioNode, context: NodeRuntimeContext): Promise<any> {
    const resolvedConfig = this.interpolateValue(node.config || {}, context);
    const leftPath = String(resolvedConfig.leftPath || 'input');
    const operator = String(resolvedConfig.operator || 'exists').toLowerCase();
    const valueType = String(resolvedConfig.valueType || 'string').toLowerCase();
    const leftValue =
      resolvedConfig.leftValue !== undefined
        ? resolvedConfig.leftValue
        : this.resolveContextPath(context, leftPath);

    let rightValue = resolvedConfig.rightValue;
    if (valueType === 'number' && rightValue !== undefined && rightValue !== null && rightValue !== '') {
      rightValue = Number(rightValue);
    } else if (valueType === 'boolean') {
      rightValue = String(rightValue).toLowerCase() === 'true';
    }

    const passed = this.evaluateCondition(leftValue, operator, rightValue);

    return {
      nodeType: 'condition',
      data: {
        passed,
        operator,
        leftPath,
        leftValue,
        rightValue,
      },
      passed,
      branch: passed ? 'true' : 'false',
    };
  }

  private async executeAINode(node: StudioNode, context: NodeRuntimeContext): Promise<any> {
    const resolvedConfig = this.interpolateValue(node.config || {}, context);
    const completionConfig = this.resolveAICompletionConfig(resolvedConfig);
    const provider = completionConfig.provider;
    const inputPath = String(resolvedConfig.inputPath || 'input').trim() || 'input';
    const systemPrompt = String(resolvedConfig.systemPrompt || '').trim();
    const historyPath = String(resolvedConfig.historyPath || 'input.history').trim() || 'input.history';

    let promptValue: any;
    if (resolvedConfig.prompt !== undefined && resolvedConfig.prompt !== null) {
      promptValue = resolvedConfig.prompt;
    } else if (resolvedConfig.promptTemplate !== undefined && resolvedConfig.promptTemplate !== null) {
      promptValue = resolvedConfig.promptTemplate;
    } else {
      promptValue = this.resolveMappingPath(inputPath, context);
    }

    const prompt = this.toPromptString(promptValue);
    if (!prompt) {
      throw new Error(`AI node "${node.name}" has empty prompt input`);
    }

    const history = this.normalizeConversationHistory(
      this.firstDefined(
        this.resolveMappingPath(historyPath, context),
        context.trigger?.chat?.history,
        context.input?.history
      )
    );
    const messages = this.buildConversationMessages(systemPrompt, prompt, history);

    const completion = await this.aiProviderService.complete({
      provider,
      messages,
      model: completionConfig.model,
      deployment: completionConfig.deployment,
      apiKey: completionConfig.apiKey,
      endpoint: completionConfig.endpoint,
      apiVersion: completionConfig.apiVersion,
      temperature: resolvedConfig.temperature,
      maxTokens: resolvedConfig.maxTokens,
    });

    const parsedOutput = this.tryParseJson(completion.text);
    return {
      nodeType: 'ai',
      provider,
      model: completion.model,
      prompt,
      historyCount: history.length,
      output: parsedOutput,
      text: completion.text,
      usage: completion.raw?.usage,
      data: {
        output: parsedOutput,
        text: completion.text,
        provider,
        model: completion.model,
      },
      raw: completion.raw,
    };
  }

  private async executeOrchestratorNode(
    node: StudioNode,
    context: NodeRuntimeContext,
    graph: FlowGraph
  ): Promise<any> {
    const resolvedConfig = this.interpolateValue(node.config || {}, context);
    const completionConfig = this.resolveAICompletionConfig(resolvedConfig);
    const provider = completionConfig.provider;
    const instructionPath =
      String(resolvedConfig.instructionPath || resolvedConfig.inputPath || 'input').trim() || 'input';
    const historyPath = String(resolvedConfig.historyPath || 'input.history').trim() || 'input.history';
    const systemPrompt =
      String(resolvedConfig.systemPrompt || '').trim() ||
      'You are an orchestration agent. Use available tools when needed and produce a concise final answer.';

    const instructionValue =
      resolvedConfig.instruction !== undefined
        ? resolvedConfig.instruction
        : this.resolveMappingPath(instructionPath, context);
    const instruction = this.toPromptString(instructionValue);
    if (!instruction) {
      throw new Error(`Orchestrator node "${node.name}" has empty instruction input`);
    }

    const toolNodes = this.getOrchestratorToolNodes(node, graph);
    const toolNameToNode = new Map<string, StudioNode>();
    const tools = toolNodes.map(toolNode => {
      const toolDefinition = this.buildToolDefinition(toolNode);
      toolNameToNode.set(toolDefinition.function.name, toolNode);
      return toolDefinition;
    });

    const maxToolCalls = Math.max(1, Math.min(Number(resolvedConfig.maxToolCalls || 6), 20));
    const history = this.normalizeConversationHistory(
      this.firstDefined(
        this.resolveMappingPath(historyPath, context),
        context.trigger?.chat?.history,
        context.input?.history
      )
    );
    const policy = this.analyzeOrchestratorPolicy(instruction, history, toolNodes);
    const prefetchedToolRuns = await this.prefetchOrchestratorTools(
      toolNodes,
      context,
      graph,
      policy,
      instruction
    );
    const messages = this.buildConversationMessages(
      this.buildOrchestratorSystemPrompt(systemPrompt),
      `User request:\n${instruction}\n\nCurrent node input snapshot:\n${this.toPromptString(
        this.createTraceSnapshot(context.input)
      )}`,
      history
    );
    const groundingMessage = this.buildOrchestratorGroundingMessage(prefetchedToolRuns);
    if (groundingMessage) {
      const insertIndex = Math.max(messages.length - 1, 0);
      messages.splice(insertIndex, 0, {
        role: 'system',
        content: groundingMessage,
      });
    }

    const toolRuns: Array<Record<string, any>> = prefetchedToolRuns.map(run => ({ ...run }));
    let finalText = '';
    let completionModel = String(completionConfig.model || completionConfig.deployment || '');
    let iteration = 0;

    for (let turn = 0; turn <= maxToolCalls; turn++) {
      const completion = await this.aiProviderService.complete({
        provider,
        messages,
        model: completionConfig.model,
        deployment: completionConfig.deployment,
        apiKey: completionConfig.apiKey,
        endpoint: completionConfig.endpoint,
        apiVersion: completionConfig.apiVersion,
        temperature: resolvedConfig.temperature,
        maxTokens: resolvedConfig.maxTokens || 800,
        tools: tools.length > 0 ? tools : undefined,
        toolChoice: tools.length > 0 ? 'auto' : undefined,
      });

      completionModel = completion.model;
      iteration = turn + 1;
      const toolCalls = Array.isArray(completion.toolCalls) ? completion.toolCalls : [];

      if (!toolCalls.length) {
        finalText = completion.text;
        break;
      }

      messages.push({
        role: 'assistant',
        content: completion.message?.content || '',
        tool_calls: toolCalls,
      });

      for (const toolCall of toolCalls) {
        const toolName = String(toolCall?.function?.name || '').trim();
        const toolNode = toolNameToNode.get(toolName);
        const toolCallId = String(toolCall?.id || `tool_${turn}_${toolRuns.length}`);
        const args = this.safeParseJsonObject(toolCall?.function?.arguments);

        let toolOutput: any;
        if (!toolNode) {
          toolOutput = {
            error: `Unknown tool "${toolName}"`,
          };
        } else {
          try {
            toolOutput = await this.executeOrchestratorToolNode(
              toolNode,
              args,
              context,
              graph
            );
          } catch (error) {
            toolOutput = {
              error: error instanceof Error ? error.message : 'Tool execution failed',
            };
          }
        }

        toolRuns.push({
          stage: 'model_tool',
          tool: toolName || 'unknown',
          nodeId: toolNode?.id,
          toolCallId,
          argsSnapshot: this.createTraceSnapshot(args),
          output: toolOutput,
        });

        messages.push({
          role: 'tool',
          tool_call_id: toolCallId,
          name: toolName || 'unknown_tool',
          content: JSON.stringify(toolOutput),
        });
      }
    }

    if (!finalText) {
      finalText = 'Orchestrator finished without a final assistant message.';
    }

    return {
      nodeType: 'orchestrator',
      provider,
      model: completionModel,
      instruction,
      output: finalText,
      toolRuns,
      policy: {
        wantsMemoryLookup: policy.wantsMemoryLookup,
        wantsDirectoryLookup: policy.wantsDirectoryLookup,
        reasons: policy.reasons,
        recentUserTurns: policy.recentUserTurns,
        prefetchedTools: prefetchedToolRuns.map(run => ({
          tool: run.tool,
          nodeId: run.nodeId,
          reason: run.reason,
        })),
      },
      toolsAvailable: toolNodes.map(toolNode => ({
        id: toolNode.id,
        type: toolNode.type,
        name: toolNode.name,
      })),
      historyCount: history.length,
      iterations: iteration,
      data: {
        output: finalText,
        toolRuns,
        policy: {
          wantsMemoryLookup: policy.wantsMemoryLookup,
          wantsDirectoryLookup: policy.wantsDirectoryLookup,
          reasons: policy.reasons,
        },
        provider,
        model: completionModel,
      },
    };
  }

  private buildOrchestratorSystemPrompt(systemPrompt: string): string {
    const basePrompt = systemPrompt.trim();
    const policyRules = [
      'When the request is about the current user, their identity, family, preferences, plans, or previously shared facts, ground the answer in memory before you answer.',
      'When the request is about connected sample directory or customer data, ground the answer in the relevant HTTP tool before you answer.',
      'Prefer grounded tool evidence over generic fallback text.',
      'If grounded evidence is incomplete, state exactly what is known and ask one focused follow-up question instead of improvising.',
    ];

    if (!basePrompt) {
      return policyRules.join('\n');
    }

    return `${basePrompt}\n\nOperational rules:\n- ${policyRules.join('\n- ')}`;
  }

  private analyzeOrchestratorPolicy(
    instruction: string,
    history: Array<{ role: string; content: string }>,
    toolNodes: StudioNode[]
  ): OrchestratorPolicyAnalysis {
    const normalizedInstruction = instruction.toLowerCase();
    const recentUserTurns = this.collectRecentUserTurns(history);
    const hasMemoryTool = toolNodes.some(toolNode => toolNode.type === 'memory');
    const hasDirectoryTool = toolNodes.some(toolNode => this.isLikelyDirectoryTool(toolNode));

    const explicitMemorySignal =
      /\b(memory|remember|recall|check your memory|what do you know about me|who am i|what is my name)\b/i.test(
        instruction
      );
    const firstPersonSignal = /\b(i|i'm|ive|i've|me|my|mine|we|our|ours)\b/i.test(instruction);
    const personalKnowledgeSignal =
      /\b(name|family|wife|husband|spouse|partner|kids|kid|children|child|sons?|daughters?|preferences?|projects?|plans?|goals?|birthday|gift|gifts|love|like|likes|dislike|email)\b/i.test(
        instruction
      );
    const shortPossessiveFollowUp =
      normalizedInstruction.trim().length <= 40 &&
      /(^|\s)(my|our)\b/.test(normalizedInstruction);

    const wantsMemoryLookup =
      hasMemoryTool &&
      (explicitMemorySignal || (firstPersonSignal && personalKnowledgeSignal) || shortPossessiveFollowUp);

    const directorySignal =
      /\b(customer|directory|sample users?|sample customers?|email|username|company|phone|website|address|contact|contacts)\b/i.test(
        instruction
      );
    const wantsDirectoryLookup = hasDirectoryTool && directorySignal;

    const reasons: string[] = [];
    if (wantsMemoryLookup) {
      reasons.push('user-specific request detected');
    }
    if (wantsDirectoryLookup) {
      reasons.push('sample directory request detected');
    }

    return {
      wantsMemoryLookup,
      wantsDirectoryLookup,
      memoryQuery: wantsMemoryLookup
        ? this.buildMemoryRetrievalQuery(instruction, recentUserTurns)
        : undefined,
      reasons,
      recentUserTurns,
    };
  }

  private collectRecentUserTurns(history: Array<{ role: string; content: string }>): string[] {
    return history
      .filter(item => item.role === 'user' && item.content.trim().length > 0)
      .map(item => item.content.trim())
      .slice(-3);
  }

  private buildMemoryRetrievalQuery(instruction: string, recentUserTurns: string[]): string {
    const normalizedInstruction = instruction.toLowerCase();
    const focusAreas: string[] = [];

    if (/\b(name|who am i)\b/i.test(normalizedInstruction)) {
      focusAreas.push('identity');
    }
    if (/\b(family|wife|husband|spouse|partner|kids|kid|children|child|sons?|daughters?)\b/i.test(normalizedInstruction)) {
      focusAreas.push('family');
    }
    if (/\b(projects?|plans?|goals?)\b/i.test(normalizedInstruction)) {
      focusAreas.push('projects');
    }
    if (/\b(gift|gifts|easter|birthday)\b/i.test(normalizedInstruction)) {
      focusAreas.push('gifting');
    }

    const relatedTurns = recentUserTurns
      .filter(turn => turn.trim() && turn.trim().toLowerCase() !== normalizedInstruction.trim())
      .slice(-2);

    if (instruction.trim().length > 50 && relatedTurns.length === 0 && focusAreas.length === 0) {
      return instruction.trim();
    }

    const lines = [`Find user memory relevant to this request: ${instruction.trim()}`];
    if (focusAreas.length > 0) {
      lines.push(`Focus on: ${focusAreas.join(', ')}`);
    }
    if (relatedTurns.length > 0) {
      lines.push(`Recent related user messages: ${relatedTurns.join(' | ')}`);
    }
    return lines.join('\n');
  }

  private async prefetchOrchestratorTools(
    toolNodes: StudioNode[],
    context: NodeRuntimeContext,
    graph: FlowGraph,
    policy: OrchestratorPolicyAnalysis,
    instruction: string
  ): Promise<OrchestratorPrefetchRun[]> {
    const prefetchedRuns: OrchestratorPrefetchRun[] = [];
    const prefetchedNodeIds = new Set<string>();

    if (policy.wantsMemoryLookup) {
      const memoryNode = toolNodes.find(toolNode => toolNode.type === 'memory');
      if (memoryNode) {
        prefetchedRuns.push(
          await this.executeOrchestratorPrefetch(
            memoryNode,
            'memory-first grounding',
            {
              query: policy.memoryQuery,
              input: {
                message: policy.memoryQuery || instruction,
                originalInstruction: instruction,
                instruction,
                history: policy.recentUserTurns,
                currentInput: context.input,
              },
            },
            context,
            graph,
            instruction
          )
        );
        prefetchedNodeIds.add(memoryNode.id);
      }
    }

    if (policy.wantsDirectoryLookup) {
      const directoryNode =
        toolNodes.find(toolNode => this.isLikelyDirectoryTool(toolNode)) ||
        toolNodes.find(toolNode => toolNode.type === 'http');
      if (directoryNode && !prefetchedNodeIds.has(directoryNode.id)) {
        prefetchedRuns.push(
          await this.executeOrchestratorPrefetch(
            directoryNode,
            'directory grounding',
            {
              input: {
                message: instruction,
                instruction,
                currentInput: context.input,
              },
            },
            context,
            graph,
            instruction
          )
        );
      }
    }

    return prefetchedRuns;
  }

  private async executeOrchestratorPrefetch(
    toolNode: StudioNode,
    reason: string,
    args: Record<string, any>,
    context: NodeRuntimeContext,
    graph: FlowGraph,
    instruction: string
  ): Promise<OrchestratorPrefetchRun> {
    let output: any;
    try {
      output = await this.executeOrchestratorToolNode(toolNode, args, context, graph);
    } catch (error) {
      output = {
        error: error instanceof Error ? error.message : 'Tool execution failed',
      };
    }

    return {
      stage: 'prefetch',
      reason,
      tool: this.getToolNameForNode(toolNode),
      nodeId: toolNode.id,
      argsSnapshot: this.createTraceSnapshot(args),
      output,
      summary: this.summarizeToolOutputForPrompt(toolNode, output, instruction),
    };
  }

  private buildOrchestratorGroundingMessage(prefetchedToolRuns: OrchestratorPrefetchRun[]): string {
    if (!prefetchedToolRuns.length) {
      return '';
    }

    const sections = [
      'Grounded context was retrieved before this turn. Treat the following as retrieved evidence. If it is incomplete, call a tool again or ask one focused follow-up question.',
    ];

    for (const run of prefetchedToolRuns) {
      sections.push(`${run.tool} (${run.reason}):\n${run.summary}`);
    }

    return sections.join('\n\n');
  }

  private summarizeToolOutputForPrompt(
    toolNode: StudioNode,
    toolOutput: any,
    instruction: string
  ): string {
    if (toolOutput?.error) {
      return `Tool failed: ${toolOutput.error}`;
    }

    if (toolNode.type === 'memory') {
      return this.summarizeMemoryToolOutput(toolOutput);
    }

    if (this.isLikelyDirectoryTool(toolNode)) {
      return this.summarizeDirectoryToolOutput(toolOutput, instruction);
    }

    return this.toPromptString(this.createTraceSnapshot(toolOutput?.data ?? toolOutput));
  }

  private summarizeMemoryToolOutput(toolOutput: any): string {
    const results = Array.isArray(toolOutput?.data?.results) ? toolOutput.data.results : [];
    if (!results.length) {
      return 'No matching memory results were returned.';
    }

    const uniqueSummaries = new Set<string>();
    for (const result of results) {
      const memoryRecord = result?.memory || {};
      const summary =
        (typeof memoryRecord?.memory === 'string' ? memoryRecord.memory : null) ||
        this.pickTextCandidate(memoryRecord) ||
        this.pickTextCandidate(result) ||
        this.toPromptString(this.createTraceSnapshot(memoryRecord));
      const compactSummary = summary.replace(/\s+/g, ' ').trim();
      if (compactSummary) {
        uniqueSummaries.add(compactSummary);
      }
      if (uniqueSummaries.size >= 6) {
        break;
      }
    }

    if (!uniqueSummaries.size) {
      return 'Memory results were returned, but no readable summary was available.';
    }

    return `Memory matches:\n${[...uniqueSummaries].map(item => `- ${item}`).join('\n')}`;
  }

  private summarizeDirectoryToolOutput(toolOutput: any, instruction: string): string {
    const records = Array.isArray(toolOutput?.data)
      ? toolOutput.data
      : Array.isArray(toolOutput?.data?.users)
        ? toolOutput.data.users
        : [];

    if (!records.length) {
      return this.toPromptString(this.createTraceSnapshot(toolOutput?.data ?? toolOutput));
    }

    const shortlisted = this.extractRelevantDirectoryRecords(records, instruction).slice(0, 5);
    const rows = shortlisted.length > 0 ? shortlisted : records.slice(0, 3);

    const summaries = rows.map((record: any) => {
      const name = this.pickTextCandidate(record?.name) || String(record?.name || 'Unknown user');
      const username = this.pickTextCandidate(record?.username);
      const email = this.pickTextCandidate(record?.email);
      const company =
        typeof record?.company === 'string'
          ? record.company
          : this.pickTextCandidate(record?.company?.name);
      const phone = this.pickTextCandidate(record?.phone);

      const parts = [name];
      if (username) parts.push(`username: ${username}`);
      if (email) parts.push(`email: ${email}`);
      if (company) parts.push(`company: ${company}`);
      if (phone) parts.push(`phone: ${phone}`);
      return `- ${parts.join(', ')}`;
    });

    return `Directory results (${records.length} total records):\n${summaries.join('\n')}`;
  }

  private extractRelevantDirectoryRecords(records: any[], instruction: string): any[] {
    const stopWords = new Set([
      'what',
      'which',
      'with',
      'from',
      'that',
      'this',
      'have',
      'about',
      'their',
      'there',
      'please',
      'sample',
      'customer',
      'directory',
      'email',
      'username',
      'company',
      'phone',
      'website',
      'address',
      'contact',
      'contacts',
      'user',
      'users',
    ]);
    const tokens = (instruction.toLowerCase().match(/[a-z0-9@._'-]+/g) || [])
      .filter(token => token.length >= 3)
      .filter(token => !stopWords.has(token));

    if (!tokens.length) {
      return [];
    }

    return records
      .map(record => {
        const haystack = [
          this.pickTextCandidate(record?.name),
          this.pickTextCandidate(record?.username),
          this.pickTextCandidate(record?.email),
          this.pickTextCandidate(record?.phone),
          this.pickTextCandidate(record?.website),
          typeof record?.company === 'string'
            ? record.company
            : this.pickTextCandidate(record?.company?.name),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        const score = tokens.reduce(
          (count, token) => count + (haystack.includes(token) ? 1 : 0),
          0
        );

        return { record, score };
      })
      .filter(entry => entry.score > 0)
      .sort((left, right) => right.score - left.score)
      .map(entry => entry.record);
  }

  private isLikelyDirectoryTool(toolNode: StudioNode): boolean {
    if (toolNode.type !== 'http') {
      return false;
    }

    const config = toolNode.config || {};
    const text = [
      toolNode.name,
      config.url,
      config.description,
      config.summary,
    ]
      .filter(value => typeof value === 'string' && value.trim().length > 0)
      .join(' ')
      .toLowerCase();

    return /(customer|directory|users|jsonplaceholder|contacts)/i.test(text);
  }

  private async executeOrchestratorToolNode(
    toolNode: StudioNode,
    args: Record<string, any>,
    context: NodeRuntimeContext,
    graph: FlowGraph
  ): Promise<any> {
    const executableNode = this.applyToolArgsToNode(toolNode, args);
    const toolInput = args.input !== undefined ? args.input : args;
    const toolContext: NodeRuntimeContext = {
      ...context,
      input: toolInput,
    };

    return this.executeNodeWithRuntimeOptions(executableNode, toolContext, graph, {
      allowOrchestrator: false,
    });
  }

  private applyToolArgsToNode(toolNode: StudioNode, args: Record<string, any>): StudioNode {
    if (!args || typeof args !== 'object') {
      return toolNode;
    }

    const overrideKeysByType: Record<string, string[]> = {
      http: ['method', 'url', 'headers', 'body', 'timeoutMs', 'parseAs'],
      memory: ['action', 'query', 'content', 'userId', 'limit', 'mode', 'strategy', 'context'],
      websocket: ['url', 'message', 'waitForResponse', 'timeoutMs'],
      ai: [
        'provider',
        'model',
        'deployment',
        'apiKey',
        'endpoint',
        'apiVersion',
        'systemPrompt',
        'prompt',
        'promptTemplate',
        'inputPath',
        'temperature',
        'maxTokens',
      ],
    };

    const allowedKeys = overrideKeysByType[toolNode.type];
    if (!allowedKeys || !allowedKeys.length) {
      return toolNode;
    }

    const overrides: Record<string, any> = {};
    for (const key of allowedKeys) {
      if (args[key] !== undefined) {
        overrides[key] = args[key];
      }
    }

    if (!Object.keys(overrides).length) {
      return toolNode;
    }

    return {
      ...toolNode,
      config: {
        ...(toolNode.config || {}),
        ...overrides,
      },
    };
  }

  private getOrchestratorToolNodes(node: StudioNode, graph: FlowGraph): StudioNode[] {
    const outgoing = graph.outgoingMap.get(node.id) || [];
    const allowToolTypes = new Set(['http', 'memory', 'websocket', 'ai']);
    const picked = new Map<string, StudioNode>();

    for (const edge of outgoing) {
      const branch = this.getEdgeBranch(edge);
      if (branch !== 'tool') continue;
      const targetNode = graph.nodeMap.get(edge.target);
      if (!targetNode) continue;
      if (!allowToolTypes.has(targetNode.type)) continue;
      picked.set(targetNode.id, targetNode);
    }

    if (picked.size === 0) {
      for (const edge of outgoing) {
        const branch = this.getEdgeBranch(edge);
        if (branch === 'next') continue;
        const targetNode = graph.nodeMap.get(edge.target);
        if (!targetNode) continue;
        if (!allowToolTypes.has(targetNode.type)) continue;
        picked.set(targetNode.id, targetNode);
      }
    }

    return [...picked.values()];
  }

  private buildToolDefinition(toolNode: StudioNode): any {
    const name = this.getToolNameForNode(toolNode);
    const descriptionsByType: Record<string, string> = {
      http: 'HTTP request tool. Use it to fetch or send external API data. You can override url, method, headers, body, parseAs, and timeoutMs.',
      memory:
        'Paddie memory tool. Use it for user-specific memory lookup or storage. You can override action, query, content, userId, limit, mode, strategy, and context.',
      websocket:
        'WebSocket tool. Use it to send a websocket message and optionally wait for the first response. You can override url, message, waitForResponse, and timeoutMs.',
      ai: 'AI helper tool. Use it for sub-prompts. You can override prompt, promptTemplate, inputPath, systemPrompt, provider, model/deployment, and token settings.',
    };
    return {
      type: 'function',
      function: {
        name,
        description:
          descriptionsByType[toolNode.type] ||
          `Tool node "${toolNode.name}" of type "${toolNode.type}". Provide optional overrides and/or input payload.`,
        parameters: {
          type: 'object',
          properties: {
            input: {
              type: 'object',
              description: 'Input payload sent to this tool node.',
            },
          },
          additionalProperties: true,
        },
      },
    };
  }

  private getToolNameForNode(toolNode: StudioNode): string {
    const base = `${toolNode.name}_${toolNode.id}`
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, '_')
      .replace(/^_+|_+$/g, '');
    return `tool_${base.slice(0, 56) || 'node'}`;
  }

  private async executeLoopNode(node: StudioNode, context: NodeRuntimeContext): Promise<any> {
    const resolvedConfig = this.interpolateValue(node.config || {}, context);
    const listPath = String(resolvedConfig.listPath || 'input').trim() || 'input';
    const itemField = String(resolvedConfig.itemField || 'item').trim() || 'item';
    const indexField = String(resolvedConfig.indexField || 'index').trim() || 'index';
    const includeOriginalInput = resolvedConfig.includeOriginalInput !== false;
    const maxItems = Math.max(1, Math.min(Number(resolvedConfig.maxItems || 1000), 10000));

    const resolvedValue = this.resolveMappingPath(listPath, context);
    const sourceItems = this.normalizeToIterable(resolvedValue);
    const items = sourceItems.slice(0, maxItems);
    const truncated = sourceItems.length > items.length;

    const dispatches: NodeDispatch[] = items.map((item, index) => {
      const payload: Record<string, any> = {
        [itemField]: item,
        [indexField]: index,
        item,
        index,
        total: items.length,
        isLast: index === items.length - 1,
        sourcePath: listPath,
      };

      if (includeOriginalInput) {
        payload.input = context.input;
      }

      return {
        branch: 'item',
        input: payload,
      };
    });

    dispatches.push({
      branch: 'done',
      input: {
        count: items.length,
        total: items.length,
        truncated,
        sourcePath: listPath,
        ...(includeOriginalInput ? { input: context.input } : {}),
      },
    });

    return {
      nodeType: 'loop',
      mode: 'for_each',
      listPath,
      itemField,
      indexField,
      count: items.length,
      truncated,
      data: {
        count: items.length,
        listPath,
      },
      dispatches,
    };
  }

  private resolveMemoryEndpoint(action: string, authMode: string): string | null {
    if (authMode === 'session') {
      switch (action) {
        case 'router':
          return '/api/studio-connect/memory/router';
        case 'create':
        case 'store':
          return '/api/studio-connect/memory/create';
        case 'search':
        case 'retrieve':
          return '/api/studio-connect/memory/search';
        default:
          return null;
      }
    }

    switch (action) {
      case 'router':
        return '/memory/router';
      case 'create':
      case 'store':
        return '/memories';
      case 'search':
      case 'retrieve':
        return '/search';
      default:
        return null;
    }
  }

  private buildMemoryBody(
    action: string,
    resolvedConfig: Record<string, any>,
    context: NodeRuntimeContext,
    userId: string
  ): Record<string, any> {
    const fallbackText = this.pickTextCandidate(context.input) || this.pickTextCandidate(context.trigger?.body);

    if (action === 'create' || action === 'store') {
      return {
        content: resolvedConfig.content || fallbackText || '',
        user_id: userId || 'studio_user',
        type: resolvedConfig.type || 'semantic',
        metadata: resolvedConfig.metadata || {},
      };
    }

    if (action === 'search' || action === 'retrieve') {
      return {
        query: resolvedConfig.query || fallbackText || '',
        user_id: userId || 'studio_user',
        strategy: resolvedConfig.strategy || 'auto',
        limit: Number(resolvedConfig.limit || 10),
      };
    }

    return {
      query: resolvedConfig.query || fallbackText || '',
      user_id: userId || 'studio_user',
      mode: resolvedConfig.mode || 'conversation',
      context: resolvedConfig.context,
      conversation_id: resolvedConfig.conversationId || resolvedConfig.conversation_id,
    };
  }

  private pickTextCandidate(value: any): string | null {
    if (!value) return null;
    if (typeof value === 'string') return value;

    const candidates = [
      value.query,
      value.content,
      value.message,
      value.text,
      value.prompt,
      value.instruction,
      value.output,
      value.data?.query,
      value.data?.content,
      value.data?.message,
      value.data?.output,
    ];

    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim().length > 0) {
        return candidate;
      }
    }

    return null;
  }

  private resolveActorContext(
    triggerPayload: any,
    explicitActor?: ExecutionActorContext
  ): ExecutionActorContext | undefined {
    if (explicitActor?.userId && explicitActor?.tenantId) {
      return explicitActor;
    }

    const triggerUser = triggerPayload?.user || {};
    const userId = String(triggerUser.user_id || triggerUser.userId || '').trim();
    const tenantId = String(triggerUser.tenant_id || triggerUser.tenantId || '').trim();
    const email = String(triggerUser.email || '').trim();
    const accessToken = String(
      triggerUser.access_token || triggerUser.accessToken || ''
    ).trim();
    const refreshToken = String(
      triggerUser.refresh_token || triggerUser.refreshToken || ''
    ).trim();
    const sessionId = String(triggerUser.session_id || triggerUser.sessionId || '').trim();

    if (!userId || !tenantId) {
      return undefined;
    }

    return {
      userId,
      tenantId,
      email: email || undefined,
      accessToken: accessToken || undefined,
      refreshToken: refreshToken || undefined,
      sessionId: sessionId || undefined,
    };
  }

  private resolveAICompletionConfig(resolvedConfig: Record<string, any>): {
    provider: StudioAIProvider;
    model?: string;
    deployment?: string;
    apiKey?: string;
    endpoint?: string;
    apiVersion?: string;
  } {
    const credentialSource = this.normalizeAICredentialSource(resolvedConfig.credentialSource);
    if (credentialSource === 'paddie_system') {
      return {
        provider: 'azure_openai',
        deployment: String(
          resolvedConfig.systemDeployment ||
            resolvedConfig.deployment ||
            config.azureOpenAI.deploymentName ||
            'gpt-4.1'
        ).trim(),
        apiKey: config.azureOpenAI.apiKey,
        endpoint: config.azureOpenAI.endpoint,
        apiVersion: config.azureOpenAI.apiVersion,
      };
    }

    const provider = this.normalizeAIProvider(resolvedConfig.provider);
    return {
      provider,
      model: resolvedConfig.model,
      deployment: resolvedConfig.deployment,
      apiKey: resolvedConfig.apiKey,
      endpoint: resolvedConfig.endpoint,
      apiVersion: resolvedConfig.apiVersion,
    };
  }

  private normalizeAICredentialSource(rawValue: any): 'paddie_system' | 'byok' {
    const normalized = String(rawValue || 'paddie_system').toLowerCase().trim();
    if (
      normalized === 'system' ||
      normalized === 'paddie' ||
      normalized === 'paddie_system' ||
      normalized === 'session'
    ) {
      return 'paddie_system';
    }
    return 'byok';
  }

  private normalizeConversationHistory(history: any): Array<{ role: string; content: string }> {
    if (!Array.isArray(history)) {
      return [];
    }

    return history
      .map(entry => ({
        role: String(entry?.role || '').trim().toLowerCase(),
        content: this.toPromptString(entry?.content),
      }))
      .filter(entry =>
        entry.content.length > 0 &&
        ['system', 'user', 'assistant', 'tool'].includes(entry.role)
      );
  }

  private buildConversationMessages(
    systemPrompt: string,
    prompt: string,
    history: Array<{ role: string; content: string }>
  ): any[] {
    const messages: any[] = [];
    if (systemPrompt) {
      messages.push({
        role: 'system',
        content: systemPrompt,
      });
    }

    for (const item of history) {
      if (item.role === 'system') {
        continue;
      }
      messages.push({
        role: item.role,
        content: item.content,
      });
    }

    messages.push({
      role: 'user',
      content: prompt,
    });
    return messages;
  }

  private firstDefined(...values: any[]): any {
    for (const value of values) {
      if (value !== undefined && value !== null) {
        return value;
      }
    }
    return undefined;
  }

  private getStartNodeIds(
    nodes: StudioNode[],
    incomingMap: Map<string, StudioEdge[]>,
    triggerPayload?: any
  ): string[] {
    const triggerMode = String(triggerPayload?.method || '').toUpperCase();
    if (triggerMode === 'CHAT') {
      const chatNodes = nodes.filter(node => node.type === 'chat').map(node => node.id);
      if (chatNodes.length > 0) {
        return chatNodes;
      }
    }

    const webhookNodes = nodes.filter(node => node.type === 'webhook').map(node => node.id);
    if (webhookNodes.length > 0) {
      return webhookNodes;
    }
    const chatNodes = nodes.filter(node => node.type === 'chat').map(node => node.id);
    if (chatNodes.length > 0) {
      return chatNodes;
    }
    return nodes
      .filter(node => (incomingMap.get(node.id) || []).length === 0)
      .map(node => node.id);
  }

  private buildDispatches(node: StudioNode, result: any): NodeDispatch[] {
    if (node.type === 'chat') {
      return [
        {
          branch: 'always',
          input: result?.data ?? result,
        },
      ];
    }

    if (node.type === 'webhook') {
      return [
        {
          branch: 'always',
          input: result?.data ?? result,
        },
      ];
    }

    if (node.type === 'loop' && Array.isArray(result?.dispatches)) {
      return result.dispatches.map((dispatch: any) => ({
        branch: String(dispatch?.branch || 'item').toLowerCase(),
        input: dispatch?.input,
      }));
    }

    if (node.type === 'condition') {
      const passed = result?.passed !== undefined ? !!result.passed : !!result?.data?.passed;
      return [
        {
          branch: passed ? 'true' : 'false',
          input: result,
        },
      ];
    }

    if (node.type === 'orchestrator') {
      return [
        {
          branch: 'next',
          input: result,
        },
      ];
    }

    return [
      {
        branch: 'always',
        input: result,
      },
    ];
  }

  private selectOutgoingEdges(
    node: StudioNode,
    edges: StudioEdge[],
    result: any,
    dispatchBranch: string
  ): StudioEdge[] {
    if (node.type === 'condition') {
      const passed = result?.passed !== undefined ? !!result.passed : !!result?.data?.passed;
      return edges.filter(edge => {
        const branch = this.getEdgeBranch(edge);
        if (branch === 'always') return true;
        if (branch === 'true') return passed;
        if (branch === 'false') return !passed;
        return branch === dispatchBranch;
      });
    }

    if (node.type === 'loop') {
      return edges.filter(edge => {
        const branch = this.getEdgeBranch(edge);
        if (branch === 'always') {
          // Default unlabelled loop edges to item-branch behavior for convenience.
          return dispatchBranch === 'item';
        }
        return branch === dispatchBranch;
      });
    }

    if (node.type === 'orchestrator') {
      return edges.filter(edge => {
        const branch = this.getEdgeBranch(edge);
        if (branch === 'tool') return false;
        if (branch === 'always') return dispatchBranch === 'next';
        return branch === dispatchBranch;
      });
    }

    return edges.filter(edge => {
      const branch = this.getEdgeBranch(edge);
      if (branch === 'always') return true;
      return branch === dispatchBranch;
    });
  }

  private getEdgeBranch(edge: StudioEdge): string {
    return String(edge.condition || edge.sourceHandle || 'always').toLowerCase();
  }

  private getMaxExecutionSteps(): number {
    const configured = Number(process.env.STUDIO_EXECUTION_MAX_STEPS || 2000);
    if (!Number.isFinite(configured) || configured < 1) {
      return 2000;
    }
    return Math.min(Math.floor(configured), 20000);
  }

  private normalizeToIterable(value: any): any[] {
    if (value === undefined || value === null) {
      return [];
    }
    if (Array.isArray(value)) {
      return value;
    }
    if (typeof value === 'object') {
      return Object.values(value);
    }
    return [value];
  }

  private normalizeAIProvider(rawProvider: any): StudioAIProvider {
    const normalized = String(rawProvider || 'azure_openai').toLowerCase();
    if (normalized === 'openai') return 'openai';
    if (normalized === 'groq') return 'groq';
    if (normalized === 'azure' || normalized === 'azure_openai') return 'azure_openai';
    return 'azure_openai';
  }

  private evaluateCondition(leftValue: any, operator: string, rightValue: any): boolean {
    switch (operator) {
      case 'exists':
        return leftValue !== undefined && leftValue !== null && leftValue !== '';
      case 'not_exists':
        return leftValue === undefined || leftValue === null || leftValue === '';
      case 'equals':
        return leftValue === rightValue;
      case 'not_equals':
        return leftValue !== rightValue;
      case 'contains':
        if (leftValue === undefined || leftValue === null) return false;
        return String(leftValue).toLowerCase().includes(String(rightValue ?? '').toLowerCase());
      case 'greater_than':
        return Number(leftValue) > Number(rightValue);
      case 'less_than':
        return Number(leftValue) < Number(rightValue);
      default:
        return !!leftValue;
    }
  }

  private applyNodeInputMapping(node: StudioNode, context: NodeRuntimeContext): any {
    const mappings = Array.isArray(node.config?.inputMapping) ? node.config.inputMapping : [];
    if (!mappings.length) {
      return context.input;
    }

    const mappedOutput: Record<string, any> = {};

    for (const mapping of mappings) {
      if (!mapping || typeof mapping !== 'object') continue;

      const sourcePath = String(mapping.sourcePath || '').trim();
      if (!sourcePath) continue;
      const targetPath =
        String(mapping.targetField || '').trim() ||
        this.getDefaultTargetFromSourcePath(sourcePath);
      if (!targetPath) continue;

      const value =
        this.resolveMappingPath(sourcePath, context) ??
        (mapping.defaultValue !== undefined ? mapping.defaultValue : undefined);
      const required = !!mapping.required;
      if ((value === undefined || value === null) && required) {
        throw new Error(
          `Input mapping failed for node "${node.name}": "${sourcePath}" is required`
        );
      }
      this.setValueAtPath(mappedOutput, targetPath, value);
    }

    if (node.config?.passThroughInput) {
      if (context.input && typeof context.input === 'object' && !Array.isArray(context.input)) {
        return {
          ...context.input,
          ...mappedOutput,
        };
      }
      return {
        _input: context.input,
        ...mappedOutput,
      };
    }

    return mappedOutput;
  }

  private resolveMappingPath(sourcePath: string, context: NodeRuntimeContext): any {
    const normalized = sourcePath.replace(/\[(\d+)\]/g, '.$1').trim();
    if (!normalized) return undefined;

    if (
      normalized === 'trigger' ||
      normalized.startsWith('trigger.') ||
      normalized === 'input' ||
      normalized.startsWith('input.') ||
      normalized === 'nodes' ||
      normalized.startsWith('nodes.') ||
      normalized === 'item' ||
      normalized.startsWith('item.') ||
      normalized === 'itemIndex' ||
      normalized.startsWith('itemIndex.') ||
      normalized === 'items' ||
      normalized.startsWith('items.')
    ) {
      return this.resolveContextPath(context, normalized);
    }

    // Default to input.<path> for convenience in non-technical mapping.
    return this.resolveContextPath(context, `input.${normalized}`);
  }

  private getDefaultTargetFromSourcePath(sourcePath: string): string {
    const normalized = sourcePath.replace(/\[(\d+)\]/g, '.$1').trim();
    if (!normalized) return '';
    const parts = normalized.split('.').filter(Boolean);
    return parts[parts.length - 1] || '';
  }

  private setValueAtPath(target: Record<string, any>, path: string, value: any): void {
    const normalized = String(path)
      .replace(/\[(\d+)\]/g, '.$1')
      .replace(/^\.|\.$/g, '');
    if (!normalized) return;

    const parts = normalized.split('.').filter(Boolean);
    let cursor: Record<string, any> = target;
    for (let i = 0; i < parts.length; i++) {
      const key = parts[i];
      const isLeaf = i === parts.length - 1;
      if (isLeaf) {
        cursor[key] = value;
      } else {
        if (typeof cursor[key] !== 'object' || cursor[key] === null || Array.isArray(cursor[key])) {
          cursor[key] = {};
        }
        cursor = cursor[key];
      }
    }
  }

  private interpolateValue(value: any, context: NodeRuntimeContext): any {
    if (value === null || value === undefined) {
      return value;
    }

    if (typeof value === 'string') {
      return this.interpolateString(value, context);
    }

    if (Array.isArray(value)) {
      return value.map(item => this.interpolateValue(item, context));
    }

    if (typeof value === 'object') {
      const output: Record<string, any> = {};
      for (const [key, item] of Object.entries(value)) {
        output[key] = this.interpolateValue(item, context);
      }
      return output;
    }

    return value;
  }

  private interpolateString(template: string, context: NodeRuntimeContext): any {
    const exactMatch = template.match(/^{{\s*([^}]+)\s*}}$/);
    if (exactMatch) {
      return this.resolveContextPath(context, exactMatch[1]);
    }

    return template.replace(/{{\s*([^}]+)\s*}}/g, (_match, rawPath) => {
      const resolved = this.resolveContextPath(context, rawPath);
      if (resolved === undefined || resolved === null) {
        return '';
      }
      return typeof resolved === 'object' ? JSON.stringify(resolved) : String(resolved);
    });
  }

  private resolveContextPath(context: NodeRuntimeContext, path: string): any {
    const normalizedPath = String(path || '')
      .replace(/\[(\d+)\]/g, '.$1')
      .replace(/^\.|\.$/g, '');
    if (!normalizedPath) return undefined;

    const parts = normalizedPath.split('.').filter(Boolean);
    let cursor: any = context;
    for (const part of parts) {
      if (cursor === undefined || cursor === null) {
        return undefined;
      }
      cursor = cursor[part];
    }
    return cursor;
  }

  private headersToObject(headers: Headers): Record<string, string> {
    const output: Record<string, string> = {};
    headers.forEach((value, key) => {
      output[key] = value;
    });
    return output;
  }

  private safeParseJsonObject(raw: any): Record<string, any> {
    if (raw === undefined || raw === null || raw === '') {
      return {};
    }

    if (typeof raw === 'object') {
      return raw as Record<string, any>;
    }

    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          return parsed as Record<string, any>;
        }
      } catch (_error) {
        return {};
      }
    }

    return {};
  }

  private createTraceSnapshot(value: any, depth = 0): any {
    if (value === undefined || value === null) {
      return value;
    }

    if (typeof value === 'string') {
      return value.length > 320 ? `${value.slice(0, 320)}...` : value;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return value;
    }

    if (depth >= 3) {
      if (Array.isArray(value)) {
        return `[array:${value.length}]`;
      }
      if (typeof value === 'object') {
        return '[object]';
      }
      return value;
    }

    if (Array.isArray(value)) {
      const maxItems = 6;
      const snapshot = value
        .slice(0, maxItems)
        .map(item => this.createTraceSnapshot(item, depth + 1));
      if (value.length > maxItems) {
        snapshot.push(`[+${value.length - maxItems} more]`);
      }
      return snapshot;
    }

    if (typeof value === 'object') {
      const entries = Object.entries(value);
      const maxKeys = 16;
      const snapshot: Record<string, any> = {};
      for (const [key, entryValue] of entries.slice(0, maxKeys)) {
        snapshot[key] = this.createTraceSnapshot(entryValue, depth + 1);
      }
      if (entries.length > maxKeys) {
        snapshot.__truncated__ = `+${entries.length - maxKeys} keys`;
      }
      return snapshot;
    }

    return String(value);
  }

  private toPromptString(value: any): string {
    if (value === undefined || value === null) return '';
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    try {
      return JSON.stringify(value, null, 2);
    } catch (_error) {
      return String(value);
    }
  }

  private async executeChatNode(node: StudioNode, context: NodeRuntimeContext): Promise<any> {
    const resolvedConfig = this.interpolateValue(node.config || {}, context);
    const messagePath = String(resolvedConfig.messagePath || 'input.message').trim() || 'input.message';
    const historyPath = String(resolvedConfig.historyPath || 'input.history').trim() || 'input.history';
    const metadataPath =
      String(resolvedConfig.metadataPath || 'input.metadata').trim() || 'input.metadata';
    const conversationIdPath =
      String(resolvedConfig.conversationIdPath || 'input.conversationId').trim() ||
      'input.conversationId';

    const messageValue =
      resolvedConfig.message !== undefined
        ? resolvedConfig.message
        : this.firstDefined(
            this.resolveMappingPath(messagePath, context),
            context.trigger?.chat?.message,
            context.trigger?.body?.message,
            context.input?.message,
            context.input
          );
    const message = this.toPromptString(messageValue);
    if (!message) {
      throw new Error(`Chat node "${node.name}" has empty message input`);
    }

    const history = this.normalizeConversationHistory(
      this.firstDefined(
        this.resolveMappingPath(historyPath, context),
        context.trigger?.chat?.history,
        context.trigger?.body?.history,
        context.input?.history
      )
    );
    const metadata = this.firstDefined(
      this.resolveMappingPath(metadataPath, context),
      context.trigger?.chat?.metadata,
      context.trigger?.body?.metadata,
      context.input?.metadata,
      {}
    );
    const conversationId = String(
      this.firstDefined(
        this.resolveMappingPath(conversationIdPath, context),
        context.trigger?.chat?.conversationId,
        context.trigger?.body?.conversationId,
        context.input?.conversationId,
        ''
      ) || ''
    ).trim();

    return {
      nodeType: 'chat',
      message,
      conversationId,
      history,
      metadata,
      data: {
        message,
        conversationId,
        history,
        metadata,
      },
    };
  }

  private tryParseJson(value: string): any {
    try {
      return JSON.parse(value);
    } catch (_error) {
      return value;
    }
  }
}

