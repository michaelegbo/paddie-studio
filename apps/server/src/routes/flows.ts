import { Router } from "express";
import { createPlaceholderRun } from "@paddie-studio/runtime";
import { studioStore } from "../services/store.js";
import { requireSession } from "../middleware/requireSession.js";

export const flowRouter = Router();
flowRouter.use(requireSession);

flowRouter.get("/", (_request, response) => response.json(studioStore.listFlows()));
flowRouter.post("/", (request, response) => response.status(201).json(studioStore.saveFlow(request.body)));
flowRouter.get("/:id", (request, response) => {
  const flow = studioStore.getFlow(request.params.id);
  if (!flow) return response.status(404).json({ error: "Flow not found" });
  return response.json(flow);
});
flowRouter.put("/:id", (request, response) => response.json(studioStore.saveFlow({ ...request.body, id: request.params.id })));
flowRouter.delete("/:id", (request, response) => response.json({ deleted: studioStore.deleteFlow(request.params.id) }));
flowRouter.post("/:id/execute", (request, response) => {
  const flow = studioStore.getFlow(request.params.id);
  if (!flow) return response.status(404).json({ error: "Flow not found" });
  const run = studioStore.saveRun(createPlaceholderRun(flow, { trigger: "manual", input: request.body?.input }));
  return response.json(run);
});
flowRouter.post("/:id/test-node", (request, response) => response.json({ ok: true, nodeId: request.body?.nodeId ?? null, input: request.body?.input ?? null }));
flowRouter.get("/:id/runs", (request, response) => response.json(studioStore.listRuns(request.params.id)));
