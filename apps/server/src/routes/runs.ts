import { Router } from "express";
import { studioStore } from "../services/store.js";
import { requireSession } from "../middleware/requireSession.js";

export const runRouter = Router();
runRouter.use(requireSession);
runRouter.get("/:runId", (request, response) => {
  const run = studioStore.getRun(request.params.runId);
  if (!run) return response.status(404).json({ error: "Run not found" });
  return response.json(run);
});
