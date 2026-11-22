import cors from "cors";
import express from "express";
import helmet from "helmet";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { hostGuard } from "./middleware/hostGuard.js";
import {
  loadSession,
  originGuard,
  requireAdmin,
  requireAuth,
} from "./modules/auth/auth.middleware.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { createSessionStore } from "./modules/auth/auth.sessions.js";
import { usersRouter } from "./modules/auth/users.routes.js";
import { healthRouter } from "./modules/health/health.routes.js";
import { projectsRouter } from "./modules/projects/projects.routes.js";
import { DEFAULT_STORAGE_ROOT } from "./modules/evidence/evidence.storage.js";
import { createN8nClient } from "./modules/generation/generation.n8n.js";

// App factory: dependencies are injected so tests can build isolated instances.
export function createApp({
  prisma,
  env,
  storageRoot = DEFAULT_STORAGE_ROOT,
  n8nClient: injectedN8nClient,
}) {
  const app = express();
  const n8nClient =
    injectedN8nClient ??
    createN8nClient({
      webhookUrl: env.N8N_WEBHOOK_URL,
      requestSecret: env.N8N_REQUEST_SECRET,
    });
  app.disable("x-powered-by");

  app.use(helmet());
  app.use(hostGuard());
  app.use(
    cors({
      origin: env.corsOrigins,
      methods: ["GET", "POST", "PATCH", "DELETE"],
    }),
  );

  app.use(express.json({ limit: "100kb" }));

  const sessions = createSessionStore({
    prisma,
    secureCookies: env.NODE_ENV === "production",
  });
  app.use(originGuard(env.corsOrigins));
  app.use(loadSession(sessions));

  app.use("/api/health", healthRouter({ prisma }));
  app.use("/api/auth", authRouter({ prisma, sessions }));
  app.use("/api/users", requireAdmin, usersRouter({ prisma, sessions }));
  app.use(
    "/api/projects",
    // n8n's callbacks and its signed screenshot downloads carry their own
    // one-time tokens instead of a sign-in.
    requireAuth({
      publicPaths: [
        /^\/[^/]+\/generations\/[^/]+\/(callback|failure)$/,
        /^\/[^/]+\/evidence\/[^/]+\/signed-file$/,
      ],
    }),
    projectsRouter({
      prisma,
      storageRoot,
      maxUploadBytes: env.MAX_UPLOAD_MB * 1024 * 1024,
      n8nClient,
      publicBackendUrl: env.PUBLIC_BACKEND_URL,
      evidenceSigningSecret: env.EVIDENCE_SIGNING_SECRET,
      evidenceUrlTtlSeconds: env.EVIDENCE_URL_TTL_SECONDS,
    }),
  );

  app.use("/api", notFoundHandler);
  app.use(errorHandler);
  return app;
}
