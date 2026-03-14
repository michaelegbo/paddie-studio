import { Router } from 'express';
import { config } from '../config.js';
import { OIDCService } from '../services/oidc.service.js';
import { SessionService } from '../services/session.service.js';
import { logger } from '../utils/logger.js';

const oidc = OIDCService.getInstance();
const sessions = SessionService.getInstance();

function parseReturnTo(value: unknown, fallback: string): string {
  const raw = String(value || '').trim();
  if (!raw) return fallback;
  if (!raw.startsWith('/')) return fallback;
  return raw;
}

export const authRouter = Router();

authRouter.get('/login', (req, res) => {
  const returnTo = parseReturnTo(req.query.returnTo, '/app');
  const client = String(req.query.client || 'web').toLowerCase() === 'desktop' ? 'desktop' : 'web';
  const screenHint =
    String(req.query.screenHint || '').toLowerCase() === 'signup' ? 'signup' : 'login';
  const request = oidc.createAuthorizationRequest(client, returnTo, { screenHint });

  if (req.query.json === '1' || req.query.json === 'true') {
    res.json({ success: true, authorizationUrl: request.url, state: request.state, client, screenHint });
    return;
  }

  res.redirect(request.url);
});

authRouter.get('/callback', async (req, res) => {
  const code = String(req.query.code || '').trim();
  const state = String(req.query.state || '').trim();

  if (!code || !state) {
    res.status(400).json({ success: false, error: 'Missing code or state' });
    return;
  }

  try {
    const exchanged = await oidc.exchangeCode({ code, state });
    const accessToken = exchanged.tokens.access_token;
    if (!accessToken) {
      throw new Error('OIDC exchange succeeded but no access token was returned');
    }

    const userInfo = await oidc.fetchUserInfo(accessToken);
    const userId = String(userInfo.sub || '').trim();
    if (!userId) {
      throw new Error('OIDC user info missing sub');
    }

    const tenantId =
      String(userInfo.tenant_id || userInfo.tenantId || process.env.STUDIO_DEFAULT_TENANT_ID || '').trim() ||
      'studio-default-tenant';

    const session = await sessions.create({
      user: {
        id: userId,
        email: String(userInfo.email || 'unknown@paddie.io'),
        name: String(userInfo.name || 'Studio User'),
        tenantId,
      },
      accessToken,
      refreshToken: exchanged.tokens.refresh_token,
      idToken: exchanged.tokens.id_token,
      expiresInSeconds: exchanged.tokens.expires_in,
    });

    const secureCookie = String(process.env.COOKIE_SECURE || 'true').toLowerCase() !== 'false';
    res.cookie('studio_session', session.id, {
      httpOnly: true,
      sameSite: 'lax',
      secure: secureCookie,
      path: '/',
      maxAge: Math.max(60, exchanged.tokens.expires_in || 3600) * 1000,
    });

    if (exchanged.state.client === 'desktop') {
      const callbackUrl = `studio://auth/callback?session=${encodeURIComponent(session.id)}`;
      res.redirect(callbackUrl);
      return;
    }

    res.redirect(exchanged.state.returnTo || '/app');
  } catch (error) {
    logger.error('Studio auth callback failed:', error);
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Auth callback failed' });
  }
});

authRouter.get('/session/:sessionId', async (req, res) => {
  const session = await sessions.get(String(req.params.sessionId || ''));
  if (!session) {
    res.status(404).json({ success: false, error: 'Session not found' });
    return;
  }

  res.json({
    success: true,
    data: {
      sessionId: session.id,
      user: session.user,
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      expiresAt: session.expiresAt,
    },
  });
});

authRouter.post('/logout', async (req, res) => {
  const sessionId = req.cookies?.studio_session as string | undefined;
  if (sessionId) {
    await sessions.delete(sessionId);
  }

  res.clearCookie('studio_session', { path: '/' });
  res.status(204).send();
});

authRouter.get('/oidc-config', (_req, res) => {
  res.json({
    success: true,
    data: {
      issuer: config.oidc.issuer,
      clientIdWeb: config.oidc.clientIdWeb,
      clientIdDesktop: config.oidc.clientIdDesktop,
      redirectUriWeb: config.oidc.redirectUriWeb,
      redirectUriDesktop: config.oidc.redirectUriDesktop,
      scope: config.oidc.scope,
    },
  });
});
