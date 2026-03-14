import { Router } from "express";

export const codegenRouter = Router();
codegenRouter.post("/:flowId", (request, response) => {
  response.json({
    flowId: request.params.flowId,
    javascript: `fetch(\"/api/webhooks/${request.params.flowId}/token\", { method: \"POST\" })`,
    python: `import requests\nrequests.post(\"/api/webhooks/${request.params.flowId}/token\")`,
  });
});
