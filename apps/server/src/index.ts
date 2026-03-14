import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { authRouter } from "./routes/auth.js";
import { flowRouter } from "./routes/flows.js";
import { runRouter } from "./routes/runs.js";
import { chatRouter } from "./routes/chat.js";
import { webhookRouter } from "./routes/webhooks.js";
import { codegenRouter } from "./routes/codegen.js";
import { providerRouter } from "./routes/providers.js";

const app = express();
const port = Number(process.env.PORT ?? 4300);

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());

app.get("/api/health", (_request, response) => response.json({ ok: true, service: "paddie-studio-server" }));
app.get("/api/me", (request, response) => response.json(request.cookies?.studio_session ? { authenticated: true } : { authenticated: false }));
app.use("/api/auth", authRouter);
app.use("/api/flows", flowRouter);
app.use("/api/runs", runRouter);
app.use("/api/chat", chatRouter);
app.use("/api/webhooks", webhookRouter);
app.use("/api/codegen", codegenRouter);
app.use("/api/providers", providerRouter);

app.listen(port, () => {
  console.log(`Paddie Studio server listening on ${port}`);
});
