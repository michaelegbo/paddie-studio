import type { AuthenticatedUserContext } from './middleware/jwt.middleware';
import type { StudioSessionRecord } from './services/session.service';

declare global {
  namespace Express {
    interface Request {
      session?: StudioSessionRecord;
      user?: AuthenticatedUserContext;
    }
  }
}

export {};
