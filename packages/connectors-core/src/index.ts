import type { AuthenticatedUser } from "@paddie-studio/types";

export interface AuthProvider {
  getAuthorizationUrl(input: {
    state: string;
    codeChallenge: string;
    redirectUri: string;
    clientId?: string;
    scope?: string;
  }): Promise<string>;
  exchangeCode(input: {
    code: string;
    codeVerifier: string;
    redirectUri: string;
    clientId?: string;
  }): Promise<{ accessToken: string; refreshToken?: string; idToken?: string; expiresIn?: number }>;
  getUser(accessToken: string): Promise<AuthenticatedUser>;
  refresh(input: {
    refreshToken: string;
    clientId?: string;
  }): Promise<{ accessToken: string; refreshToken?: string; idToken?: string; expiresIn?: number }>;
  logout(token: string): Promise<void>;
}

export interface AIProvider {
  listModels(input?: {
    provider?: "openai" | "azure_openai" | "groq";
    apiKey?: string;
    endpoint?: string;
    apiVersion?: string;
    deployment?: string;
  }): Promise<Array<{ id: string; provider: string; ownedBy?: string }>>;
  complete(input: {
    provider?: "openai" | "azure_openai" | "groq";
    prompt?: string;
    messages?: Array<{ role: string; content: string }>;
    model?: string;
    deployment?: string;
    apiKey?: string;
    endpoint?: string;
    apiVersion?: string;
    temperature?: number;
    maxTokens?: number;
  }): Promise<{ output: string; model: string; provider: string; raw?: unknown }>;
  chat(input: {
    provider?: "openai" | "azure_openai" | "groq";
    messages: Array<{ role: string; content: string }>;
    model?: string;
    deployment?: string;
    apiKey?: string;
    endpoint?: string;
    apiVersion?: string;
    temperature?: number;
    maxTokens?: number;
  }): Promise<{ output: string; model: string; provider: string; raw?: unknown }>;
}

export interface MemoryProvider {
  router(input: { query: string; userId: string; mode?: string }): Promise<unknown>;
  create(input: { content: string; userId: string; metadata?: Record<string, unknown> }): Promise<unknown>;
  search(input: { query: string; userId: string }): Promise<unknown>;
}
