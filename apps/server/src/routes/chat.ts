import { Router } from "express";

export const chatRouter = Router();
chatRouter.post("/:flowId", (request, response) => {
  response.json({ flowId: request.params.flowId, input: request.body, reply: "Standalone Studio chat endpoint placeholder wired through the new backend." });
});
