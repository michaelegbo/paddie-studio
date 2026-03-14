import type { AuthenticatedUserContext } from './middleware/jwt.middleware.js';
import type { StudioSessionRecord } from './services/session.service.js';

declare global {
  namespace Express {
    interface Request {
      session?: StudioSessionRecord;
      user?: AuthenticatedUserContext;
    }
  }
}

export {};
