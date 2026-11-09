import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";

// Load apps/server/.env if present. Variables already set in the process win.
const envFile = fileURLToPath(new URL("../../.env", import.meta.url));
if (existsSync(envFile) && typeof process.loadEnvFile === "function") {
  process.loadEnvFile(envFile);
}

const schema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  HOST: z.string().min(1).default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z.string().min(1).default("file:./dev.db"),
  CORS_ORIGIN: z
    .string()
    .min(1)
    .default("http://127.0.0.1:5173,http://localhost:5173"),
  MAX_UPLOAD_MB: z.coerce.number().int().min(1).max(20).default(5),
  N8N_WEBHOOK_URL: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().url().optional(),
  ),
  N8N_REQUEST_SECRET: z.string().min(32).optional(),
  PUBLIC_BACKEND_URL: z.string().url().default("http://127.0.0.1:4000"),
  EVIDENCE_URL_TTL_SECONDS: z.coerce
    .number()
    .int()
    .min(30)
    .max(3600)
    .default(300),
  EVIDENCE_SIGNING_SECRET: z.string().min(32).optional(),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const lines = parsed.error.issues.map(
    (i) => `  - ${i.path.join(".")}: ${i.message}`,
  );
  throw new Error(`Invalid environment configuration:\n${lines.join("\n")}`);
}

if (parsed.data.NODE_ENV !== "test" && !parsed.data.EVIDENCE_SIGNING_SECRET) {
  throw new Error("EVIDENCE_SIGNING_SECRET is required outside test mode");
}

export const env = Object.freeze({
  ...parsed.data,
  EVIDENCE_SIGNING_SECRET:
    parsed.data.EVIDENCE_SIGNING_SECRET ??
    (parsed.data.NODE_ENV === "test"
      ? "test-only-evidence-signing-secret-32-chars"
      : undefined),
  corsOrigins: parsed.data.CORS_ORIGIN.split(",")
    .map((s) => s.trim())
    .filter(Boolean),
});
