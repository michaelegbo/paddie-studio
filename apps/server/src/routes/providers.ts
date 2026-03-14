import { Router } from "express";
import { requireSession } from "../middleware/requireSession.js";

export const providerRouter = Router();
providerRouter.use(requireSession);
providerRouter.get("/models", (_request, response) => {
  response.json({ models: ["paddie-system-gpt-4.1", "gpt-4.1", "gpt-4.1-mini"] });
});
