import type { AuthenticatedUser } from "@paddie-studio/types";

export interface AuthProvider {
  getAuthorizationUrl(state: string): Promise<string>;
  exchangeCode(code: string, codeVerifier: string): Promise<{ accessToken: string; refreshToken?: string }>;
  getUser(accessToken: string): Promise<AuthenticatedUser>;
  refresh(refreshToken: string): Promise<{ accessToken: string; refreshToken?: string }>;
  logout(token: string): Promise<void>;
}

export interface AIProvider {
  listModels(): Promise<string[]>;
  complete(prompt: string, model?: string): Promise<{ output: string; model: string }>;
  chat(messages: Array<{ role: string; content: string }>, model?: string): Promise<{ output: string; model: string }>;
}

export interface MemoryProvider {
  router(input: { query: string; userId: string; mode?: string }): Promise<unknown>;
  create(input: { content: string; userId: string; metadata?: Record<string, unknown> }): Promise<unknown>;
  search(input: { query: string; userId: string }): Promise<unknown>;
}
