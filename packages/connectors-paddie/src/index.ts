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
  async getAuthorizationUrl(input: {
    state: string;
    codeChallenge: string;
    redirectUri: string;
    clientId?: string;
    scope?: string;
  }): Promise<string> {
    const params = new URLSearchParams({
      client_id: input.clientId ?? "studio-web",
      response_type: "code",
      scope: input.scope ?? "openid profile email",
      state: input.state,
      redirect_uri: input.redirectUri,
      code_challenge: input.codeChallenge,
      code_challenge_method: "S256",
    });
    return `${baseUrl}/oauth/authorize?${params.toString()}`;
  }

  async exchangeCode(input: {
    code: string;
    codeVerifier: string;
    redirectUri: string;
    clientId?: string;
  }): Promise<{ accessToken: string; refreshToken?: string; idToken?: string; expiresIn?: number }> {
    const form = new URLSearchParams({
      grant_type: "authorization_code",
      code: input.code,
      code_verifier: input.codeVerifier,
      redirect_uri: input.redirectUri,
      client_id: input.clientId ?? "studio-web",
    });

    const response = await fetch(`${baseUrl}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });

    if (!response.ok) {
      throw new Error(`Paddie token exchange failed: ${response.status}`);
    }

    const payload = await response.json() as {
      access_token: string;
      refresh_token?: string;
      id_token?: string;
      expires_in?: number;
    };

    return {
      accessToken: payload.access_token,
      refreshToken: payload.refresh_token,
      idToken: payload.id_token,
      expiresIn: payload.expires_in,
    };
  }

  async getUser(accessToken: string): Promise<AuthenticatedUser> {
    const payload = await jsonRequest<{
      sub: string;
      email?: string;
      name?: string;
    }>("/oauth/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    return {
      id: payload.sub,
      email: payload.email ?? "",
      name: payload.name ?? "Paddie User",
    };
  }

  async refresh(input: {
    refreshToken: string;
    clientId?: string;
  }): Promise<{ accessToken: string; refreshToken?: string; idToken?: string; expiresIn?: number }> {
    const form = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: input.refreshToken,
      client_id: input.clientId ?? "studio-web",
    });

    const response = await fetch(`${baseUrl}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });

    if (!response.ok) {
      throw new Error(`Paddie token refresh failed: ${response.status}`);
    }

    const payload = await response.json() as {
      access_token: string;
      refresh_token?: string;
      id_token?: string;
      expires_in?: number;
    };

    return {
      accessToken: payload.access_token,
      refreshToken: payload.refresh_token,
      idToken: payload.id_token,
      expiresIn: payload.expires_in,
    };
  }

  async logout(token: string): Promise<void> {
    await jsonRequest("/api/auth/logout", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
  }
}

export class PaddieAIConnector implements AIProvider {
  async listModels(input?: {
    provider?: "openai" | "azure_openai" | "groq";
    apiKey?: string;
    endpoint?: string;
    apiVersion?: string;
    deployment?: string;
  }): Promise<Array<{ id: string; provider: string; ownedBy?: string }>> {
    const params = new URLSearchParams();
    if (input?.provider) params.set("provider", input.provider);
    if (input?.apiKey) params.set("apiKey", input.apiKey);
    if (input?.endpoint) params.set("endpoint", input.endpoint);
    if (input?.apiVersion) params.set("apiVersion", input.apiVersion);
    if (input?.deployment) params.set("deployment", input.deployment);

    const suffix = params.toString() ? `?${params.toString()}` : "";
    const result = await jsonRequest<{ success?: boolean; data?: Array<{ id: string; provider: string; owned_by?: string }> }>(
      `/api/studio-connect/ai/models${suffix}`
    );
    return (result.data ?? []).map((item) => ({
      id: item.id,
      provider: item.provider,
      ownedBy: item.owned_by,
    }));
  }

  async complete(input: {
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
  }): Promise<{ output: string; model: string; provider: string; raw?: unknown }> {
    const result = await jsonRequest<{ success?: boolean; data?: any }>("/api/studio-connect/ai/complete", {
      method: "POST",
      body: JSON.stringify(input),
    });

    const data = result.data ?? {};
    return {
      output: data.text ?? "",
      model: data.model ?? input.model ?? input.deployment ?? "unknown",
      provider: data.provider ?? input.provider ?? "azure_openai",
      raw: data,
    };
  }

  async chat(input: {
    provider?: "openai" | "azure_openai" | "groq";
    messages: Array<{ role: string; content: string }>;
    model?: string;
    deployment?: string;
    apiKey?: string;
    endpoint?: string;
    apiVersion?: string;
    temperature?: number;
    maxTokens?: number;
  }): Promise<{ output: string; model: string; provider: string; raw?: unknown }> {
    return this.complete(input);
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
