import { config } from '../config';
import { createHash } from 'node:crypto';
import { RedisService } from './redis.service';

export type StudioAIProvider = 'openai' | 'azure_openai' | 'groq';

export interface StudioAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_call_id?: string;
  name?: string;
  tool_calls?: any[];
}

export interface StudioAICompleteOptions {
  provider: StudioAIProvider;
  messages: StudioAIMessage[];
  model?: string;
  deployment?: string;
  apiKey?: string;
  endpoint?: string;
  apiVersion?: string;
  temperature?: number;
  maxTokens?: number;
  tools?: any[];
  toolChoice?: any;
}

export interface StudioAICompleteResult {
  provider: StudioAIProvider;
  model: string;
  text: string;
  message: any;
  toolCalls: any[];
  raw: any;
}

export interface StudioAIModelListOptions {
  provider: StudioAIProvider;
  apiKey?: string;
  endpoint?: string;
  apiVersion?: string;
  deployment?: string;
}

export interface StudioAIModelInfo {
  id: string;
  provider: StudioAIProvider;
  ownedBy?: string;
  object?: string;
}

export class StudioAIProviderService {
  private static instance: StudioAIProviderService;
  private redis: RedisService;

  private constructor() {
    this.redis = RedisService.getInstance();
  }

  static getInstance(): StudioAIProviderService {
    if (!StudioAIProviderService.instance) {
      StudioAIProviderService.instance = new StudioAIProviderService();
    }
    return StudioAIProviderService.instance;
  }

  async complete(options: StudioAICompleteOptions): Promise<StudioAICompleteResult> {
    if (!Array.isArray(options.messages) || options.messages.length === 0) {
      throw new Error('AI completion requires at least one message');
    }

    if (options.provider === 'azure_openai') {
      return this.completeAzure(options);
    }
    if (options.provider === 'groq') {
      return this.completeOpenAICompatible(options, 'groq');
    }
    return this.completeOpenAICompatible(options, 'openai');
  }

  async listModels(options: StudioAIModelListOptions): Promise<StudioAIModelInfo[]> {
    const cacheKey = this.buildModelCacheKey(options);
    const cached = await this.redis.getJson<StudioAIModelInfo[]>(cacheKey);
    if (cached && Array.isArray(cached) && cached.length > 0) {
      return cached;
    }

    let models: StudioAIModelInfo[];
    if (options.provider === 'azure_openai') {
      models = await this.listAzureModels(options);
    } else if (options.provider === 'groq') {
      models = await this.listOpenAICompatibleModels(options, 'groq');
    } else {
      models = await this.listOpenAICompatibleModels(options, 'openai');
    }

    await this.redis.setJson(cacheKey, models, 300);
    return models;
  }

  private buildModelCacheKey(options: StudioAIModelListOptions): string {
    const hash = createHash('sha1')
      .update(
        JSON.stringify({
          provider: options.provider,
          endpoint: options.endpoint || '',
          apiVersion: options.apiVersion || '',
          deployment: options.deployment || '',
          hasKey: Boolean(options.apiKey),
        })
      )
      .digest('hex');
    return `ai-models:${hash}`;
  }

  private async completeOpenAICompatible(
    options: StudioAICompleteOptions,
    provider: 'openai' | 'groq'
  ): Promise<StudioAICompleteResult> {
    const apiKey =
      String(options.apiKey || '').trim() ||
      (provider === 'openai'
        ? String(process.env.OPENAI_API_KEY || '').trim()
        : String(process.env.GROQ_API_KEY || '').trim());

    if (!apiKey) {
      throw new Error(
        provider === 'openai'
          ? 'Missing OpenAI API key. Set node config apiKey or OPENAI_API_KEY.'
          : 'Missing Groq API key. Set node config apiKey or GROQ_API_KEY.'
      );
    }

    const baseUrlRaw =
      provider === 'openai'
        ? options.endpoint || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'
        : options.endpoint || process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1';
    const baseUrl = String(baseUrlRaw).replace(/\/$/, '');
    const model = String(options.model || '').trim();

    if (!model) {
      throw new Error(
        provider === 'openai'
          ? 'OpenAI model is required in node config'
          : 'Groq model is required in node config'
      );
    }

    const body: Record<string, any> = {
      model,
      messages: options.messages,
    };

    if (options.temperature !== undefined) {
      body.temperature = Number(options.temperature);
    }
    if (options.maxTokens !== undefined) {
      body.max_tokens = Number(options.maxTokens);
    }
    if (Array.isArray(options.tools) && options.tools.length > 0) {
      body.tools = options.tools;
      body.tool_choice = options.toolChoice || 'auto';
    }

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    const rawText = await response.text();
    let parsed: any;
    try {
      parsed = rawText ? JSON.parse(rawText) : {};
    } catch (_error) {
      parsed = { raw: rawText };
    }

    if (!response.ok) {
      throw new Error(
        `${provider === 'openai' ? 'OpenAI' : 'Groq'} completion failed (${response.status}): ${JSON.stringify(parsed)}`
      );
    }

    const message = parsed?.choices?.[0]?.message || {};
    return {
      provider,
      model,
      text: this.extractMessageText(message),
      message,
      toolCalls: Array.isArray(message?.tool_calls) ? message.tool_calls : [],
      raw: parsed,
    };
  }

  private async completeAzure(options: StudioAICompleteOptions): Promise<StudioAICompleteResult> {
    const apiKey =
      String(options.apiKey || '').trim() ||
      String(process.env.AZURE_OPENAI_API_KEY || '').trim() ||
      String(config.azureOpenAI.apiKey || '').trim();
    const endpoint =
      String(options.endpoint || '').trim() ||
      String(process.env.AZURE_OPENAI_ENDPOINT || '').trim() ||
      String(config.azureOpenAI.endpoint || '').trim();
    const apiVersion =
      String(options.apiVersion || '').trim() ||
      String(process.env.AZURE_OPENAI_API_VERSION || '').trim() ||
      String(config.azureOpenAI.apiVersion || '').trim();
    const deployment =
      String(options.deployment || '').trim() ||
      String(options.model || '').trim() ||
      String(process.env.AZURE_OPENAI_DEPLOYMENT_NAME || '').trim() ||
      String(config.azureOpenAI.deploymentName || '').trim();

    if (!apiKey) {
      throw new Error('Missing Azure OpenAI API key');
    }
    if (!endpoint) {
      throw new Error('Missing Azure OpenAI endpoint');
    }
    if (!apiVersion) {
      throw new Error('Missing Azure OpenAI apiVersion');
    }
    if (!deployment) {
      throw new Error('Missing Azure OpenAI deployment');
    }

    const body: Record<string, any> = {
      messages: options.messages,
    };

    if (options.temperature !== undefined) {
      body.temperature = Number(options.temperature);
    }
    if (options.maxTokens !== undefined) {
      body.max_tokens = Number(options.maxTokens);
    }
    if (Array.isArray(options.tools) && options.tools.length > 0) {
      body.tools = options.tools;
      body.tool_choice = options.toolChoice || 'auto';
    }

    const url = `${endpoint.replace(/\/$/, '')}/openai/deployments/${encodeURIComponent(
      deployment
    )}/chat/completions?api-version=${encodeURIComponent(apiVersion)}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'api-key': apiKey,
      },
      body: JSON.stringify(body),
    });

    const rawText = await response.text();
    let parsed: any;
    try {
      parsed = rawText ? JSON.parse(rawText) : {};
    } catch (_error) {
      parsed = { raw: rawText };
    }

    if (!response.ok) {
      throw new Error(`Azure OpenAI completion failed (${response.status}): ${JSON.stringify(parsed)}`);
    }

    const message = parsed?.choices?.[0]?.message || {};
    return {
      provider: 'azure_openai',
      model: deployment,
      text: this.extractMessageText(message),
      message,
      toolCalls: Array.isArray(message?.tool_calls) ? message.tool_calls : [],
      raw: parsed,
    };
  }

  private async listOpenAICompatibleModels(
    options: StudioAIModelListOptions,
    provider: 'openai' | 'groq'
  ): Promise<StudioAIModelInfo[]> {
    const apiKey =
      String(options.apiKey || '').trim() ||
      (provider === 'openai'
        ? String(process.env.OPENAI_API_KEY || '').trim()
        : String(process.env.GROQ_API_KEY || '').trim());

    if (!apiKey) {
      throw new Error(
        provider === 'openai'
          ? 'Missing OpenAI API key'
          : 'Missing Groq API key'
      );
    }

    const baseUrlRaw =
      provider === 'openai'
        ? options.endpoint || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'
        : options.endpoint || process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1';
    const baseUrl = String(baseUrlRaw).replace(/\/$/, '');

    const response = await fetch(`${baseUrl}/models`, {
      method: 'GET',
      headers: {
        authorization: `Bearer ${apiKey}`,
      },
    });

    const rawText = await response.text();
    let parsed: any;
    try {
      parsed = rawText ? JSON.parse(rawText) : {};
    } catch (_error) {
      parsed = { raw: rawText };
    }

    if (!response.ok) {
      throw new Error(
        `${provider === 'openai' ? 'OpenAI' : 'Groq'} model list failed (${response.status}): ${JSON.stringify(parsed)}`
      );
    }

    const data = Array.isArray(parsed?.data) ? parsed.data : [];
    return data
      .map((item: any) => ({
        id: String(item?.id || '').trim(),
        provider,
        ownedBy: item?.owned_by ? String(item.owned_by) : undefined,
        object: item?.object ? String(item.object) : undefined,
      }))
      .filter((item: StudioAIModelInfo) => item.id.length > 0);
  }

  private async listAzureModels(options: StudioAIModelListOptions): Promise<StudioAIModelInfo[]> {
    const apiKey =
      String(options.apiKey || '').trim() ||
      String(process.env.AZURE_OPENAI_API_KEY || '').trim() ||
      String(config.azureOpenAI.apiKey || '').trim();
    const endpoint =
      String(options.endpoint || '').trim() ||
      String(process.env.AZURE_OPENAI_ENDPOINT || '').trim() ||
      String(config.azureOpenAI.endpoint || '').trim();
    const apiVersion =
      String(options.apiVersion || '').trim() ||
      String(process.env.AZURE_OPENAI_API_VERSION || '').trim() ||
      String(config.azureOpenAI.apiVersion || '').trim();

    const fallbacks = new Set<string>();
    const addFallback = (value: string | undefined) => {
      const normalized = String(value || '').trim();
      if (normalized) {
        fallbacks.add(normalized);
      }
    };

    addFallback(options.deployment);
    addFallback(process.env.AZURE_OPENAI_DEPLOYMENT_NAME);
    addFallback(process.env.AZURE_OPENAI_GPT5_MINI_DEPLOYMENT);
    addFallback(config.azureOpenAI.deploymentName);
    addFallback(config.azureOpenAI.gpt5MiniDeployment);

    if (!apiKey || !endpoint || !apiVersion) {
      return [...fallbacks].map(id => ({ id, provider: 'azure_openai' }));
    }

    const url = `${endpoint.replace(/\/$/, '')}/openai/deployments?api-version=${encodeURIComponent(apiVersion)}`;
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'api-key': apiKey,
        },
      });

      const rawText = await response.text();
      let parsed: any;
      try {
        parsed = rawText ? JSON.parse(rawText) : {};
      } catch (_error) {
        parsed = { raw: rawText };
      }

      if (response.ok) {
        const data = Array.isArray(parsed?.data) ? parsed.data : [];
        for (const item of data) {
          addFallback(item?.id);
          addFallback(item?.model);
        }
      }
    } catch (_error) {
      // Fall back to configured deployments.
    }

    return [...fallbacks].map(id => ({
      id,
      provider: 'azure_openai',
    }));
  }

  private extractMessageText(message: any): string {
    const content = message?.content;
    if (typeof content === 'string') {
      return content;
    }

    if (Array.isArray(content)) {
      const parts: string[] = [];
      for (const part of content) {
        if (typeof part === 'string') {
          parts.push(part);
        } else if (part?.type === 'text' && typeof part?.text === 'string') {
          parts.push(part.text);
        }
      }
      return parts.join('\n').trim();
    }

    return '';
  }
}
