import { createHash, randomBytes } from "node:crypto";
import request from "supertest";
import { vi } from "vitest";
import { createApp } from "../src/app.js";
import { env } from "../src/config/env.js";
import { prisma } from "../src/db/prisma.js";
import { SESSION_COOKIE, SESSION_TTL_MS } from "../src/modules/auth/auth.sessions.js";

export const n8nClient = {
  triggerGeneration: vi.fn().mockResolvedValue({
    accepted: true,
    status: 200,
  }),
};

export const app = createApp({
  prisma,
  env,
  n8nClient,
});

// Requests from a browser that is signed in as the test admin (created by
// resetDb). Use anonymousApi() for requests without a sign-in.
let sessionCookie = null;
const METHODS = ["get", "post", "patch", "put", "delete"];

export const api = () => apiFor(app);

// Same as api(), for a test that builds its own app instance.
export const apiFor = (targetApp) => {
  const agent = request(targetApp);
  return Object.fromEntries(
    METHODS.map((method) => [
      method,
      (url) => {
        const test = agent[method](url);
        return sessionCookie ? test.set("Cookie", sessionCookie) : test;
      },
    ]),
  );
};

export const anonymousApi = () => request(app);
export { prisma };

export const TEST_ADMIN = { email: "admin@test.local", name: "Test Admin" };

// Creates a user with a session directly in the database (fast: no password
// hashing) and returns the Cookie header value for it. A tester only opens the
// projects in `projectIds`.
export async function createSignedInUser({ email, name, role = "MEMBER", passwordHash = "unused", projectIds = [] }) {
  const user = await prisma.user.create({
    data: {
      email,
      name,
      role,
      passwordHash,
      lastLoginAt: new Date(),
      projects: { create: projectIds.map((projectId) => ({ projectId })) },
    },
  });
  const token = randomBytes(32).toString("hex");
  await prisma.session.create({
    data: {
      userId: user.id,
      tokenHash: createHash("sha256").update(token).digest("hex"),
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    },
  });
  return { user, cookie: `${SESSION_COOKIE}=${token}` };
}

export async function resetDb() {
  await prisma.bugReportFile.deleteMany();
  await prisma.bugReport.deleteMany();
  await prisma.harFile.deleteMany();
  await prisma.testCase.deleteMany();
  await prisma.generationRun.deleteMany();
  await prisma.document.deleteMany();
  await prisma.evidence.deleteMany();
  await prisma.projectURL.deleteMany();
  await prisma.projectMember.deleteMany();
  await prisma.project.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();

  sessionCookie = (await createSignedInUser({ ...TEST_ADMIN, role: "ADMIN" })).cookie;

  n8nClient.triggerGeneration.mockReset();
  n8nClient.triggerGeneration.mockResolvedValue({
    accepted: true,
    status: 200,
  });
}

export const createProject = async (body = { name: "Alpha" }) =>
  (await api().post("/api/projects").send(body)).body;
