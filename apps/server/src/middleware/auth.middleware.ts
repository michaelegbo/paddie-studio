import type { NextFunction, Response } from 'express';
import type { AuthenticatedRequest } from './jwt.middleware.js';
import { verifyToken } from './jwt.middleware.js';
import { SessionService } from '../services/session.service.js';

const sessionService = SessionService.getInstance();

function getBearerToken(headerValue?: string): string | null {
  if (!headerValue) return null;
  const match = headerValue.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

export async function authenticateRequestContext(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const sessionId = req.cookies?.studio_session as string | undefined;

  if (sessionId) {
    const session = await sessionService.get(sessionId);
    if (session) {
      req.user = {
        userId: session.user.id,
        tenantId: session.user.tenantId,
        email: session.user.email,
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        sessionId: session.id,
      };
      req.session = session;
      next();
      return;
    }
  }

  const bearer = getBearerToken(req.headers.authorization as string | undefined);
  if (bearer) {
    const verified = verifyToken(bearer);
    if (verified) {
      req.user = verified;
      next();
      return;
    }
  }

  res.status(401).json({ success: false, error: 'Authentication required' });
}
