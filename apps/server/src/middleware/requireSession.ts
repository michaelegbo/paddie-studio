import type { Request, Response, NextFunction } from "express";
import { studioStore } from "../services/store.js";

export function requireSession(request: Request, response: Response, next: NextFunction) {
  const sessionId = request.cookies?.studio_session as string | undefined;
  if (!sessionId) {
    response.status(401).json({ error: "Studio session required" });
    return;
  }
  const session = studioStore.getSession(sessionId);
  if (!session) {
    response.status(401).json({ error: "Invalid Studio session" });
    return;
  }
  request.session = session;
  next();
}
