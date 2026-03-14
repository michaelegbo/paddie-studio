import type { AIProvider, AuthProvider, MemoryProvider } from "@paddie-studio/connectors-core";
import type { AuthenticatedUser } from "@paddie-studio/types";

const baseUrl = process.env.PADDIE_API_BASE_URL ?? "https://api.paddie.io";

async function jsonRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    throw new Error(`Paddie request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export class PaddieAuthConnector implements AuthProvider {
  async getAuthorizationUrl(state: string): Promise<string> {
    return `${baseUrl}/oauth/authorize?client_id=studio-web&response_type=code&scope=openid%20profile%20email&state=${encodeURIComponent(state)}`;
  }

  async exchangeCode(code: string, codeVerifier: string): Promise<{ accessToken: string; refreshToken?: string }> {
    return jsonRequest<{ accessToken: string; refreshToken?: string }>("/api/studio-connect/auth/exchange", {
      method: "POST",
      body: JSON.stringify({ code, codeVerifier }),
    });
  }

  async getUser(accessToken: string): Promise<AuthenticatedUser> {
    return jsonRequest<AuthenticatedUser>("/oauth/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  }

  async refresh(refreshToken: string): Promise<{ accessToken: string; refreshToken?: string }> {
    return jsonRequest<{ accessToken: string; refreshToken?: string }>("/api/studio-connect/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refreshToken }),
    });
  }

  async logout(token: string): Promise<void> {
    await jsonRequest("/api/studio-connect/auth/logout", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
  }
}

export class PaddieAIConnector implements AIProvider {
  async listModels(): Promise<string[]> {
    const result = await jsonRequest<{ models: string[] }>("/api/studio-connect/ai/models");
    return result.models;
  }

  async complete(prompt: string, model?: string): Promise<{ output: string; model: string }> {
    return jsonRequest<{ output: string; model: string }>("/api/studio-connect/ai/complete", {
      method: "POST",
      body: JSON.stringify({ prompt, model }),
    });
  }

  async chat(messages: Array<{ role: string; content: string }>, model?: string): Promise<{ output: string; model: string }> {
    return jsonRequest<{ output: string; model: string }>("/api/studio-connect/ai/complete", {
      method: "POST",
      body: JSON.stringify({ messages, model }),
    });
  }
}

export class PaddieMemoryConnector implements MemoryProvider {
  async router(input: { query: string; userId: string; mode?: string }): Promise<unknown> {
    return jsonRequest("/api/studio-connect/memory/router", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async create(input: { content: string; userId: string; metadata?: Record<string, unknown> }): Promise<unknown> {
    return jsonRequest("/api/studio-connect/memory/create", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async search(input: { query: string; userId: string }): Promise<unknown> {
    return jsonRequest("/api/studio-connect/memory/search", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }
}
