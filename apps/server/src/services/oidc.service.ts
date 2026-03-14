import { createHash, randomBytes } from 'crypto';
import { config } from '../config.js';

interface OIDCStateEntry {
  codeVerifier: string;
  client: 'web' | 'desktop';
  returnTo: string;
  createdAt: number;
}

export interface OIDCTokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
  refresh_token?: string;
  id_token?: string;
}

export interface OIDCUserInfo {
  sub: string;
  email?: string;
  name?: string;
  tenant_id?: string;
  tenantId?: string;
  [key: string]: any;
}

export class OIDCService {
  private static instance: OIDCService;
  private readonly stateStore = new Map<string, OIDCStateEntry>();

  static getInstance(): OIDCService {
    if (!OIDCService.instance) {
      OIDCService.instance = new OIDCService();
    }
    return OIDCService.instance;
  }

  createAuthorizationRequest(
    client: 'web' | 'desktop',
    returnTo: string,
    options?: { screenHint?: 'login' | 'signup' }
  ): {
    state: string;
    url: string;
  } {
    const state = this.randomUrlSafe(18);
    const codeVerifier = this.randomUrlSafe(64);
    const codeChallenge = this.codeChallenge(codeVerifier);

    this.stateStore.set(state, {
      codeVerifier,
      client,
      returnTo,
      createdAt: Date.now(),
    });

    this.cleanupStateStore();

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: client === 'desktop' ? config.oidc.clientIdDesktop : config.oidc.clientIdWeb,
      redirect_uri:
        client === 'desktop' ? config.oidc.redirectUriDesktop : config.oidc.redirectUriWeb,
      scope: config.oidc.scope,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });
    if (options?.screenHint) {
      params.set('screen_hint', options.screenHint);
    }

    return {
      state,
      url: `${config.oidc.issuer.replace(/\/$/, '')}/oauth/authorize?${params.toString()}`,
    };
  }

  consumeState(state: string): OIDCStateEntry | null {
    const value = this.stateStore.get(state);
    if (!value) {
      return null;
    }

    this.stateStore.delete(state);
    const maxAgeMs = 10 * 60 * 1000;
    if (Date.now() - value.createdAt > maxAgeMs) {
      return null;
    }

    return value;
  }

  async exchangeCode(input: {
    code: string;
    state: string;
  }): Promise<{ tokens: OIDCTokenResponse; state: OIDCStateEntry }> {
    const entry = this.consumeState(input.state);
    if (!entry) {
      throw new Error('Invalid or expired OIDC state');
    }

    const form = new URLSearchParams({
      grant_type: 'authorization_code',
      code: input.code,
      redirect_uri:
        entry.client === 'desktop' ? config.oidc.redirectUriDesktop : config.oidc.redirectUriWeb,
      client_id: entry.client === 'desktop' ? config.oidc.clientIdDesktop : config.oidc.clientIdWeb,
      code_verifier: entry.codeVerifier,
    });

    const response = await fetch(`${config.oidc.issuer.replace(/\/$/, '')}/oauth/token`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    });

    const raw = await response.text();
    let parsed: any = {};
    try {
      parsed = raw ? JSON.parse(raw) : {};
    } catch (_error) {
      parsed = { raw };
    }

    if (!response.ok) {
      throw new Error(`OIDC token exchange failed (${response.status}): ${JSON.stringify(parsed)}`);
    }

    return {
      tokens: parsed as OIDCTokenResponse,
      state: entry,
    };
  }

  async fetchUserInfo(accessToken: string): Promise<OIDCUserInfo> {
    const response = await fetch(`${config.oidc.issuer.replace(/\/$/, '')}/oauth/userinfo`, {
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

    if (!response.ok) {
      throw new Error(`OIDC userinfo failed (${response.status}): ${JSON.stringify(parsed)}`);
    }

    return parsed as OIDCUserInfo;
  }

  private cleanupStateStore(): void {
    const maxAgeMs = 10 * 60 * 1000;
    const now = Date.now();
    for (const [key, value] of this.stateStore.entries()) {
      if (now - value.createdAt > maxAgeMs) {
        this.stateStore.delete(key);
      }
    }
  }

  private codeChallenge(verifier: string): string {
    return createHash('sha256').update(verifier).digest('base64url');
  }

  private randomUrlSafe(bytes: number): string {
    return randomBytes(bytes).toString('base64url');
  }
}
