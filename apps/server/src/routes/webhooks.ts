import { Router } from "express";

export const webhookRouter = Router();
webhookRouter.post("/:flowId/:token", (request, response) => {
  response.json({ flowId: request.params.flowId, token: request.params.token, body: request.body });
});
