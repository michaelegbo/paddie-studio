import { Router } from "express";
import { randomUUID } from "node:crypto";
import { studioStore } from "../services/store.js";

export const authRouter = Router();

authRouter.get("/login", (_request, response) => {
  response.json({ loginUrl: `${process.env.PADDIE_API_BASE_URL ?? "https://api.paddie.io"}/oauth/authorize?client_id=studio-web&response_type=code` });
});

authRouter.get("/callback", (_request, response) => {
  const session = studioStore.saveSession({
    id: randomUUID(),
    user: { id: "local-studio-user", email: "studio@example.com", name: "Studio User" },
    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 12).toISOString(),
  });
  response.cookie("studio_session", session.id, { httpOnly: true, sameSite: "lax", secure: false, path: "/" });
  response.redirect("/app");
});

authRouter.post("/logout", (request, response) => {
  const sessionId = request.cookies?.studio_session as string | undefined;
  if (sessionId) studioStore.deleteSession(sessionId);
  response.clearCookie("studio_session", { path: "/" });
  response.status(204).send();
});
