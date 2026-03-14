import type { Request } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export interface AuthenticatedUserContext {
  userId: string;
  tenantId: string;
  email?: string;
  sessionId?: string;
  accessToken?: string;
  refreshToken?: string;
}

export interface AuthenticatedRequest extends Request<Record<string, string>, any, any, any> {
  user?: AuthenticatedUserContext;
}

export function signToken(payload: AuthenticatedUserContext): string {
  return jwt.sign(payload, config.jwt.secret, { expiresIn: config.jwt.expiresIn as any });
}

export function verifyToken(token: string): AuthenticatedUserContext | null {
  try {
    return jwt.verify(token, config.jwt.secret) as AuthenticatedUserContext;
  } catch (_error) {
    return null;
  }
}
