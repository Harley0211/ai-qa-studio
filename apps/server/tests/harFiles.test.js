import { existsSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { env } from "../src/config/env.js";
import { apiFor, createSignedInUser, n8nClient, prisma, resetDb } from "./helpers.js";

const filesRoot = mkdtempSync(path.join(os.tmpdir(), "aqs-har-tests-"));
const app = createApp({ prisma, env, n8nClient, ollamaClient: { chat: async () => "{}" }, filesRoot });
const api = () => apiFor(app);

const summary = {
  total: 5,
  failedCount: 3,
  durationMs: 5400,
  totalBytes: 1234,
  capturedAt: "2026-11-23T02:00:00.000Z",
  classCounts: { "2xx": 2, "3xx": 0, "4xx": 1, "5xx": 1, failed: 1 },
  topErrors: [{ method: "POST", path: "/api/orders", status: 500 }],
};
const har = Buffer.from(JSON.stringify({ log: { entries: [] } }));

function save(body = summary, name = "session.har") {
  return api()
    .post(base)
    .field("summary", JSON.stringify(body))
    .attach("file", har, { filename: name, contentType: "application/json" });
}

let base;
let project;
beforeEach(async () => {
  await resetDb();
  project = (await api().post("/api/projects").send({ name: "PNCC" })).body;
  base = `/api/projects/${project.id}/har-files`;
});
afterAll(async () => {
  rmSync(filesRoot, { recursive: true, force: true });
  await prisma.$disconnect();
});

describe("HAR library", () => {
  it("saves a HAR in its own folder and lists it", async () => {
    const res = await save();
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ name: "session.har", size: har.length, summary, createdBy: { name: "Test Admin" } });
    const { id } = res.body.data;
    expect(existsSync(path.join(filesRoot, "har-files", id, "session.har"))).toBe(true);

    const list = await api().get(base);
    expect(list.body.items.map((item) => item.id)).toEqual([id]);

    const file = await api().get(`${base}/${id}/file`);
    expect(file.status).toBe(200);
    expect(file.headers["content-disposition"]).toMatch(/attachment; filename="session.har"/);
    expect(JSON.parse(file.text ?? file.body.toString())).toEqual({ log: { entries: [] } });
  });

  it("needs a valid summary and a file", async () => {
    expect((await save({ total: "many" })).status).toBe(400);
    expect((await api().post(base).field("summary", JSON.stringify(summary))).status).toBe(400);
    expect((await api().get(base)).body.total).toBe(0);
  });

  it("deletes the HAR and its folder; only the uploader or an admin may", async () => {
    const { id } = (await save()).body.data;
    const dir = path.join(filesRoot, "har-files", id);
    const member = await createSignedInUser({ email: "member@test.local", name: "Member", projectIds: [project.id] });

    expect((await request(app).get(`${base}/${id}`).set("Cookie", member.cookie)).status).toBe(200);
    expect((await request(app).delete(`${base}/${id}`).set("Cookie", member.cookie)).status).toBe(403);
    expect(existsSync(dir)).toBe(true);

    expect((await api().delete(`${base}/${id}`)).status).toBe(204);
    expect(existsSync(dir)).toBe(false);
    expect((await api().get(`${base}/${id}`)).status).toBe(404);
  });

  it("needs a sign-in", async () => {
    expect((await request(app).get(base)).status).toBe(401);
  });

  it("keeps each project's HAR files to itself", async () => {
    const { id } = (await save()).body.data;
    const fiber = (await api().post("/api/projects").send({ name: "Fiber" })).body;
    const fiberBase = `/api/projects/${fiber.id}/har-files`;

    expect((await api().get(fiberBase)).body.items).toEqual([]);
    expect((await api().get(`${fiberBase}/${id}`)).status).toBe(404);
    expect((await api().get(`${fiberBase}/${id}/file`)).status).toBe(404);
    expect((await api().delete(`${fiberBase}/${id}`)).status).toBe(404);
    expect((await api().get(`${base}/${id}`)).status).toBe(200);

    expect((await api().get("/api/projects/nope/har-files")).status).toBe(404);
  });

  it("deletes a project's HAR folders with the project", async () => {
    const { id } = (await save()).body.data;
    const dir = path.join(filesRoot, "har-files", id);
    expect(existsSync(dir)).toBe(true);

    expect((await api().delete(`/api/projects/${project.id}`)).status).toBe(204);
    expect(existsSync(dir)).toBe(false);
    expect(await prisma.harFile.count()).toBe(0);
  });
});
