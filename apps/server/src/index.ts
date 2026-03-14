import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { authRouter } from "./routes/auth.js";
import studioRouter from "./routes/studio.js";
import { compatRouter } from "./routes/compat.js";
import { MongoDBService } from "./services/mongodb.service.js";
import { SessionService } from "./services/session.service.js";
import { RedisService } from "./services/redis.service.js";
import { config } from "./config.js";
import { logger } from "./utils/logger.js";

const app = express();
const port = config.server.port;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());

app.get("/api/health", (_request, response) =>
  response.json({
    ok: true,
    service: "paddie-studio-server",
    dependencies: {
      mongo: true,
      redis: RedisService.getInstance().isReady(),
    },
  })
);
app.get("/api/me", async (request, response) => {
  const sessionId = request.cookies?.studio_session as string | undefined;
  if (!sessionId) {
    response.json({ authenticated: false });
    return;
  }

  const session = await SessionService.getInstance().get(sessionId);
  if (!session) {
    response.json({ authenticated: false });
    return;
  }

  response.json({
    authenticated: true,
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      tenantId: session.user.tenantId,
    },
    expiresAt: session.expiresAt,
  });
});

app.use("/api/auth", authRouter);
app.use("/api", compatRouter);
app.use("/api", studioRouter);

async function start() {
  await MongoDBService.getInstance().connect();
  await RedisService.getInstance().connect();
  app.listen(port, () => {
    logger.info(`Paddie Studio server listening on ${port}`);
  });
}

void start();
