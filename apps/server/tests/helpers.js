import request from "supertest";
import { vi } from "vitest";
import { createApp } from "../src/app.js";
import { env } from "../src/config/env.js";
import { prisma } from "../src/db/prisma.js";

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

export const api = () => request(app);
export { prisma };

export async function resetDb() {
  await prisma.generationRun.deleteMany();
  await prisma.evidence.deleteMany();
  await prisma.projectURL.deleteMany();
  await prisma.project.deleteMany();

  n8nClient.triggerGeneration.mockReset();
  n8nClient.triggerGeneration.mockResolvedValue({
    accepted: true,
    status: 200,
  });
}

export const createProject = async (body = { name: "Alpha" }) =>
  (await api().post("/api/projects").send(body)).body;
