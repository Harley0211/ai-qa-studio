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
import { createOllamaClient } from "./modules/bug-reports/bugReports.ollama.js";
import { createBugReportService } from "./modules/bug-reports/bugReports.service.js";
import { DEFAULT_FILES_ROOT, createFileStore } from "./lib/fileStore.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// App factory: dependencies are injected so tests can build isolated instances.
export function createApp({
  prisma,
  env,
  storageRoot = DEFAULT_STORAGE_ROOT,
  filesRoot = DEFAULT_FILES_ROOT,
  n8nClient: injectedN8nClient,
  ollamaClient: injectedOllamaClient,
}) {
  const app = express();
  const n8nClient =
    injectedN8nClient ??
    createN8nClient({
      webhookUrl: env.N8N_WEBHOOK_URL,
      requestSecret: env.N8N_REQUEST_SECRET,
    });
  const fileStore = createFileStore(filesRoot);
  const bugReports = createBugReportService({
    prisma,
    store: fileStore,
    ollama:
      injectedOllamaClient ??
      createOllamaClient({ baseUrl: env.OLLAMA_URL, model: env.OLLAMA_MODEL }),
  });
  // A report that was generating when the server stopped can't finish.
  bugReports.recoverInterrupted().catch((error) => {
    if (env.NODE_ENV !== "test") console.error("[bug reports] recovery failed", error);
  });
  const maxFileBytes = env.MAX_SAVED_FILE_MB * 1024 * 1024;
  app.disable("x-powered-by");
  // Behind a tunnel or reverse proxy on this machine, trust its
  // X-Forwarded-* headers (https, client IP). Nothing else can set them.
  app.set("trust proxy", "loopback");

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          // Previews of chosen files and the frames read from videos are
          // blob: URLs created by the page itself.
          "img-src": ["'self'", "data:", "blob:"],
          "media-src": ["'self'", "blob:"],
        },
      },
    }),
  );
  app.use(hostGuard(env.publicHosts ?? []));
  app.use(
    cors({
      origin: env.corsOrigins,
      methods: ["GET", "POST", "PATCH", "DELETE"],
    }),
  );

  // Saved bug report texts can be larger than other requests.
  app.use(/^\/api\/projects\/[^/]+\/bug-reports(\/|$)/, express.json({ limit: "1mb" }));
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
      bugReports,
      fileStore,
      maxFileBytes,
    }),
  );

  app.use("/api", notFoundHandler);

  // Going live: serve the built web app from this same address, so a tunnel
  // or proxy only needs to forward one port. (In development Vite serves it.)
  if (env.WEB_DIST_DIR) {
    const webDist = path.resolve(SERVER_ROOT, env.WEB_DIST_DIR);
    app.use(
      express.static(webDist, {
        index: false,
        // Built asset names change with their content, so they can be cached.
        setHeaders: (res, filePath) => {
          if (filePath.includes(`${path.sep}assets${path.sep}`)) {
            res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
          }
        },
      }),
    );
    // Every other path is a page of the single-page app.
    app.get(/^(?!\/api(\/|$)).*/, (_req, res) => {
      res.setHeader("Cache-Control", "no-cache");
      res.sendFile(path.join(webDist, "index.html"));
    });
  }

  app.use(errorHandler);
  return app;
}
