// Generating again in a project that already has evidence and test cases:
// which images count as used, clearing used images, skipping what the
// library already covers, and flagging likely duplicates at review.
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { env } from "../src/config/env.js";
import { resolveStoragePath } from "../src/modules/evidence/evidence.storage.js";
import { findDuplicates, titleSimilarity, titleWords } from "../src/modules/generation/duplicates.js";
import { apiFor, createProject, n8nClient, prisma, resetDb } from "./helpers.js";

const storageRoot = mkdtempSync(path.join(os.tmpdir(), "aqs-reuse-tests-"));
const app = createApp({ prisma, env, n8nClient, storageRoot });
const api = () => apiFor(app);

const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

beforeEach(resetDb);
afterAll(async () => {
  rmSync(storageRoot, { recursive: true, force: true });
  await prisma.$disconnect();
});

async function uploadImage(projectId, filename = "screen.png") {
  const res = await api()
    .post(`/api/projects/${projectId}/evidence`)
    .attach("file", pngBuffer, { filename, contentType: "image/png" });
  expect(res.status).toBe(201);
  return res.body;
}

async function listEvidence(projectId) {
  const res = await api().get(`/api/projects/${projectId}/evidence`);
  expect(res.status).toBe(200);
  return Object.fromEntries(res.body.items.map((item) => [item.filename, item]));
}

async function startRun(projectId, evidenceIds) {
  const callIndex = n8nClient.triggerGeneration.mock.calls.length;
  const res = await api()
    .post(`/api/projects/${projectId}/generations`)
    .send({ message: "Generate test cases", evidenceIds });
  expect(res.status).toBe(202);
  const payload = n8nClient.triggerGeneration.mock.calls[callIndex][0];
  return { runId: res.body.data.id, payload };
}

function callback({ payload }, testCases) {
  return api()
    .post(new URL(payload.callbackUrl).pathname)
    .set("Authorization", `Bearer ${payload.callbackToken}`)
    .send({ testCases });
}

function failure({ payload }) {
  return api()
    .post(new URL(payload.callbackUrl).pathname.replace(/callback$/, "failure"))
    .set("Authorization", `Bearer ${payload.callbackToken}`)
    .send({ error: "Ollama is not running" });
}

const testCase = (title) => ({
  title,
  steps: ["Open the page", "Do the thing"],
  expectedResult: "It works.",
});

async function addToLibrary(projectId, titles) {
  const run = await startRun(projectId, []);
  expect((await callback(run, titles.map(testCase))).status).toBe(200);
  const res = await api()
    .post(`/api/projects/${projectId}/generations/${run.runId}/accept`)
    .send({ indexes: titles.map((_, i) => i) });
  expect(res.status).toBe(200);
}

describe("Tracking which images a generation used", () => {
  it("lists every image as new until a generation that used it succeeds", async () => {
    const project = await createProject();
    const login = await uploadImage(project.id, "login.png");
    const signup = await uploadImage(project.id, "signup.png");

    let images = await listEvidence(project.id);
    expect(images["login.png"].lastUsedAt).toBeNull();
    expect(images["signup.png"].lastUsedAt).toBeNull();

    const run = await startRun(project.id, [login.id]);
    // Still running: not used yet.
    images = await listEvidence(project.id);
    expect(images["login.png"].lastUsedAt).toBeNull();

    expect((await callback(run, [testCase("Login works")])).status).toBe(200);

    images = await listEvidence(project.id);
    expect(images["login.png"].lastUsedAt).toEqual(expect.any(String));
    // Not part of the run.
    expect(images["signup.png"].lastUsedAt).toBeNull();
    expect(signup.id).toBeTruthy();
  });

  it("keeps images new when the generation fails", async () => {
    const project = await createProject();
    const login = await uploadImage(project.id, "login.png");

    const run = await startRun(project.id, [login.id]);
    expect((await failure(run)).status).toBe(200);

    expect((await listEvidence(project.id))["login.png"].lastUsedAt).toBeNull();
  });

  it("does not mark images used by an AI chat change", async () => {
    const project = await createProject();
    const login = await uploadImage(project.id, "login.png");
    const first = await startRun(project.id, [login.id]);
    await callback(first, [testCase("Login works")]);
    const usedAt = (await listEvidence(project.id))["login.png"].lastUsedAt;

    const callIndex = n8nClient.triggerGeneration.mock.calls.length;
    const refine = await api()
      .post(`/api/projects/${project.id}/generations/${first.runId}/refine`)
      .send({ instruction: "Add a negative case" });
    expect(refine.status).toBe(202);
    const payload = n8nClient.triggerGeneration.mock.calls[callIndex][0];
    expect(
      (await callback({ payload }, [testCase("Login works"), testCase("Login fails")])).status,
    ).toBe(200);

    expect((await listEvidence(project.id))["login.png"].lastUsedAt).toBe(usedAt);
  });
});

describe("POST /api/projects/:projectId/evidence/clear-used", () => {
  it("deletes used images and their files, and keeps new ones", async () => {
    const project = await createProject();
    const used = await uploadImage(project.id, "used.png");
    await uploadImage(project.id, "new.png");
    const run = await startRun(project.id, [used.id]);
    await callback(run, [testCase("Something")]);

    const stored = await prisma.evidence.findUnique({ where: { id: used.id } });
    const filePath = resolveStoragePath(storageRoot, stored.storageKey);
    expect(existsSync(filePath)).toBe(true);

    const res = await api().post(`/api/projects/${project.id}/evidence/clear-used`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ deletedCount: 1 });

    expect(Object.keys(await listEvidence(project.id))).toEqual(["new.png"]);
    expect(existsSync(filePath)).toBe(false);
    // Test cases and runs are untouched.
    expect(await prisma.generationRun.count({ where: { id: run.runId } })).toBe(1);
  });

  it("keeps a used image that a running generation still needs", async () => {
    const project = await createProject();
    const image = await uploadImage(project.id, "login.png");
    await callback(await startRun(project.id, [image.id]), [testCase("Login works")]);
    // Used before, and part of a run that is still going.
    await startRun(project.id, [image.id]);

    const res = await api().post(`/api/projects/${project.id}/evidence/clear-used`);
    expect(res.body.data).toEqual({ deletedCount: 0 });
    expect(Object.keys(await listEvidence(project.id))).toEqual(["login.png"]);
  });

  it("only touches the given project and needs a known project", async () => {
    const alpha = await createProject({ name: "Alpha" });
    const beta = await createProject({ name: "Beta" });
    const image = await uploadImage(beta.id, "beta.png");
    await callback(await startRun(beta.id, [image.id]), [testCase("Beta works")]);

    expect((await api().post(`/api/projects/${alpha.id}/evidence/clear-used`)).body.data)
      .toEqual({ deletedCount: 0 });
    expect(Object.keys(await listEvidence(beta.id))).toEqual(["beta.png"]);

    expect((await api().post("/api/projects/nope/evidence/clear-used")).status).toBe(404);
  });
});

describe("Skipping what the library already covers", () => {
  it("sends the library's titles to n8n, newest first", async () => {
    const project = await createProject();
    await addToLibrary(project.id, ["Login with valid credentials"]);
    await addToLibrary(project.id, ["Logout from the dashboard"]);

    const { payload } = await startRun(project.id, []);
    expect(payload.existingTitles).toEqual([
      "Logout from the dashboard",
      "Login with valid credentials",
    ]);
  });

  it("flags drafts that repeat a library test case", async () => {
    const project = await createProject();
    await addToLibrary(project.id, ["Login with valid credentials"]);

    const run = await startRun(project.id, []);
    await callback(run, [
      testCase("Verify login with valid credentials"),
      testCase("Password reset email is sent"),
    ]);

    const res = await api().get(`/api/projects/${project.id}/generations/${run.runId}`);
    expect(res.status).toBe(200);
    const [repeat, fresh] = res.body.data.drafts;
    expect(repeat.duplicateOf).toMatchObject({
      caseId: "TC-0001",
      title: "Login with valid credentials",
    });
    expect(fresh.duplicateOf).toBeNull();
  });
});

describe("Title comparison", () => {
  const same = (a, b) => titleSimilarity(titleWords(a), titleWords(b)) > 0;

  it("treats rewordings of the same check as the same", () => {
    expect(same("Verify login with valid credentials", "Login with valid credentials")).toBe(true);
    expect(same("Login: valid credentials!", "login with VALID credentials")).toBe(true);
  });

  it("keeps different checks apart", () => {
    expect(same("Login with valid credentials", "Login with invalid credentials")).toBe(false);
    expect(same("Login with valid credentials", "Password reset email is sent")).toBe(false);
    expect(same("Verify", "Test")).toBe(false);
  });

  it("picks the closest library case", () => {
    const library = [
      { id: "1", caseId: "TC-0001", title: "Login page loads" },
      { id: "2", caseId: "TC-0002", title: "Login with valid email and password" },
    ];
    const [match, none] = findDuplicates(
      [{ title: "Verify login with valid email and password" }, { title: "Sign up" }],
      library,
    );
    expect(match.caseId).toBe("TC-0002");
    expect(none).toBeNull();
  });
});
