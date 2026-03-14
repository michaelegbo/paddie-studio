import type { StudioSession } from "@paddie-studio/types";

declare global {
  namespace Express {
    interface Request {
      session?: StudioSession;
    }
  }
}

export {};
