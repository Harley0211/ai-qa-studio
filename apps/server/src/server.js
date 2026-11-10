import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { prisma } from "./db/prisma.js";

const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1"]);
if (!LOOPBACK.has(env.HOST)) {
  console.error(
    `Refusing to start: HOST="${env.HOST}" is not a loopback address. ` +
      "This single-user version must only listen on 127.0.0.1.",
  );
  process.exit(1);
}

const app = createApp({ prisma, env });
const server = app.listen(env.PORT, env.HOST, () => {
  console.log(`AI QA Studio API listening on http://${env.HOST}:${env.PORT}`);
});

server.on("error", (err) => {
  console.error(
    err.code === "EADDRINUSE" ? `Port ${env.PORT} is already in use.` : err,
  );
  process.exit(1);
});

async function shutdown() {
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
