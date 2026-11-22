import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { prisma } from "./db/prisma.js";
import { createGenerationService } from "./modules/generation/generation.service.js";

const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1"]);
if (!LOOPBACK.has(env.HOST)) {
  console.error(
    `Refusing to start: HOST="${env.HOST}" is not a loopback address. ` +
      "This local version must only listen on 127.0.0.1 (put a reverse proxy in front to share it).",
  );
  process.exit(1);
}

const app = createApp({ prisma, env });
const server = app.listen(env.PORT, env.HOST, () => {
  console.log(`AI QA Studio API listening on http://${env.HOST}:${env.PORT}`);
});

// Close generation runs whose callback can no longer arrive (n8n failed or
// never answered), including ones nobody is currently watching.
const STALE_RUN_SWEEP_MS = 5 * 60 * 1000;
const generations = createGenerationService({ prisma });
const sweepStaleRuns = () =>
  generations
    .expireStaleRuns({})
    .catch((err) => console.error("[generation] Stale run sweep failed:", err));
sweepStaleRuns();
const sweepTimer = setInterval(sweepStaleRuns, STALE_RUN_SWEEP_MS);
sweepTimer.unref();

server.on("error", (err) => {
  console.error(
    err.code === "EADDRINUSE" ? `Port ${env.PORT} is already in use.` : err,
  );
  process.exit(1);
});

async function shutdown() {
  clearInterval(sweepTimer);
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
