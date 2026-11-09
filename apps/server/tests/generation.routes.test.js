import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { api, createProject, n8nClient, prisma, resetDb } from "./helpers.js";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

const sampleTestCases = [
  {
    title: "Login with valid credentials",
    description: "Verify successful login.",
    precondition: "A registered user exists.",
    steps: ["Open the login page", "Enter valid credentials", "Click Login"],
    data: "Email: user@example.com",
    expectedResult: "The user is redirected to the dashboard.",
  },
  {
    title: "Login with invalid password",
    steps: [
      "Open the login page",
      "Enter an incorrect password",
      "Click Login",
    ],
    expectedResult: "An appropriate error message is displayed.",
  },
];

async function startGeneration(projectId) {
  const callIndex = n8nClient.triggerGeneration.mock.calls.length;

  const response = await api()
    .post(`/api/projects/${projectId}/generations`)
    .send({ message: "Generate login test cases" });

  expect(response.status).toBe(202);

  const payload = n8nClient.triggerGeneration.mock.calls[callIndex][0];

  return {
    runId: response.body.data.id,
    callbackToken: payload.callbackToken,
    callbackUrl: payload.callbackUrl,
  };
}

async function sendCallback({
  callbackUrl,
  callbackToken,
  testCases = sampleTestCases,
}) {
  return api()
    .post(new URL(callbackUrl).pathname)
    .set("Authorization", `Bearer ${callbackToken}`)
    .send({ testCases });
}

describe("POST /api/projects/:projectId/generations", () => {
  it("starts generation and returns a pending run", async () => {
    const project = await createProject({ name: "QA Project" });

    const res = await api()
      .post(`/api/projects/${project.id}/generations`)
      .send({ message: "Generate login test cases" });

    expect(res.status).toBe(202);
    expect(res.body.data).toMatchObject({
      id: expect.any(String),
      projectId: project.id,
      status: "PENDING",
    });

    expect(n8nClient.triggerGeneration).toHaveBeenCalledOnce();

    const payload = n8nClient.triggerGeneration.mock.calls.at(-1)[0];
    expect(payload).toMatchObject({
      projectId: project.id,
      message: "Generate login test cases",
      evidenceIds: [],
    });

    expect(payload.callbackToken).toHaveLength(64);
    expect(payload.callbackUrl).toContain("/generations/");
    expect(payload.callbackUrl).toContain("/callback");

    expect(JSON.stringify(res.body)).not.toContain(payload.callbackToken);

    const savedRun = await prisma.generationRun.findUnique({
      where: { id: res.body.data.id },
    });

    expect(savedRun.status).toBe("PENDING");
    expect(savedRun.callbackTokenHash).not.toBe(payload.callbackToken);
  });

  it("rejects an empty prompt", async () => {
    const project = await createProject();

    const res = await api()
      .post(`/api/projects/${project.id}/generations`)
      .send({ message: "   " });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(n8nClient.triggerGeneration).not.toHaveBeenCalled();
  });

  it("rejects an unknown project", async () => {
    const res = await api()
      .post("/api/projects/unknown-project/generations")
      .send({ message: "Generate test cases" });

    expect(res.status).toBe(404);
    expect(n8nClient.triggerGeneration).not.toHaveBeenCalled();
  });

  it("rejects evidence IDs that do not belong to the project", async () => {
    const project = await createProject();

    const res = await api()
      .post(`/api/projects/${project.id}/generations`)
      .send({
        message: "Generate test cases",
        evidenceIds: ["missing-evidence"],
      });

    expect(res.status).toBe(400);
    expect(n8nClient.triggerGeneration).not.toHaveBeenCalled();
  });

  it("returns an error and marks the run failed when n8n is unavailable", async () => {
    const project = await createProject();

    n8nClient.triggerGeneration.mockRejectedValueOnce(
      Object.assign(new Error("Unable to connect to n8n"), {
        code: "N8N_CONNECTION_ERROR",
        status: 502,
      }),
    );

    const res = await api()
      .post(`/api/projects/${project.id}/generations`)
      .send({ message: "Generate test cases" });

    expect(res.status).toBe(502);

    const failedRun = await prisma.generationRun.findFirst({
      where: { projectId: project.id },
    });

    expect(failedRun.status).toBe("FAILED");
    expect(failedRun.callbackTokenHash).toBeNull();
    expect(failedRun.callbackTokenExpiresAt).toBeNull();
  });
});

describe("POST /api/projects/:projectId/generations/:runId/callback", () => {
  it("saves generated test cases and completes the run", async () => {
    const project = await createProject({ name: "Callback Project" });
    const { runId, callbackToken, callbackUrl } = await startGeneration(
      project.id,
    );

    const res = await sendCallback({ callbackUrl, callbackToken });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      runId,
      status: "SUCCEEDED",
      createdCount: 2,
    });

    const savedCases = await prisma.testCase.findMany({
      where: { projectId: project.id },
      orderBy: { caseId: "asc" },
    });

    expect(savedCases).toHaveLength(2);
    expect(savedCases[0]).toMatchObject({
      caseId: "TC-0001",
      title: "Login with valid credentials",
      runStatus: "Not Run",
    });
    expect(savedCases[0].steps).toContain("1. Open the login page");
    expect(savedCases[1].caseId).toBe("TC-0002");

    const savedRun = await prisma.generationRun.findUnique({
      where: { id: runId },
    });

    expect(savedRun.status).toBe("SUCCEEDED");
    expect(savedRun.callbackTokenHash).toBeNull();
    expect(savedRun.callbackTokenUsedAt).not.toBeNull();
  });

  it("rejects a callback without an authorization header", async () => {
    const project = await createProject();
    const { callbackUrl } = await startGeneration(project.id);

    const res = await api()
      .post(new URL(callbackUrl).pathname)
      .send({ testCases: sampleTestCases });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_CALLBACK_TOKEN");
  });

  it("rejects an invalid callback token", async () => {
    const project = await createProject();
    const { callbackUrl } = await startGeneration(project.id);

    const res = await sendCallback({
      callbackUrl,
      callbackToken: "a".repeat(64),
    });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_CALLBACK_TOKEN");
  });

  it("rejects an expired callback token", async () => {
    const project = await createProject();
    const { runId, callbackToken, callbackUrl } = await startGeneration(
      project.id,
    );

    await prisma.generationRun.update({
      where: { id: runId },
      data: {
        callbackTokenExpiresAt: new Date(Date.now() - 1000),
      },
    });

    const res = await sendCallback({ callbackUrl, callbackToken });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_CALLBACK_TOKEN");
  });

  it("rejects a duplicate callback", async () => {
    const project = await createProject();
    const { callbackToken, callbackUrl } = await startGeneration(project.id);

    const firstResponse = await sendCallback({ callbackUrl, callbackToken });
    const secondResponse = await sendCallback({ callbackUrl, callbackToken });

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(401);
    expect(secondResponse.body.error.code).toBe("INVALID_CALLBACK_TOKEN");

    const cases = await prisma.testCase.findMany({
      where: { projectId: project.id },
    });

    expect(cases).toHaveLength(2);
  });

  it("rejects malformed test cases without consuming the callback token", async () => {
    const project = await createProject();
    const { runId, callbackToken, callbackUrl } = await startGeneration(
      project.id,
    );

    const invalidResponse = await sendCallback({
      callbackUrl,
      callbackToken,
      testCases: [{ title: "Missing required fields" }],
    });

    expect(invalidResponse.status).toBe(400);

    const runAfterInvalidRequest = await prisma.generationRun.findUnique({
      where: { id: runId },
    });

    expect(runAfterInvalidRequest.status).toBe("PENDING");
    expect(runAfterInvalidRequest.callbackTokenUsedAt).toBeNull();

    const validResponse = await sendCallback({ callbackUrl, callbackToken });

    expect(validResponse.status).toBe(200);
  });

  it("continues sequential test case IDs across generation runs", async () => {
    const project = await createProject();

    // First generation run
    const firstRun = await startGeneration(project.id);

    const firstResponse = await sendCallback({
      callbackUrl: firstRun.callbackUrl,
      callbackToken: firstRun.callbackToken,
    });

    expect(firstResponse.status).toBe(200);

    // Second generation run
    const secondRun = await startGeneration(project.id);

    const secondResponse = await sendCallback({
      callbackUrl: secondRun.callbackUrl,
      callbackToken: secondRun.callbackToken,
    });

    const secondSavedRun = await prisma.generationRun.findUnique({
      where: { id: secondRun.runId },
    });

    expect(secondResponse.status).toBe(200);

    const cases = await prisma.testCase.findMany({
      where: { projectId: project.id },
      orderBy: { caseId: "asc" },
      select: { caseId: true },
    });

    expect(cases.map((testCase) => testCase.caseId)).toEqual([
      "TC-0001",
      "TC-0002",
      "TC-0003",
      "TC-0004",
    ]);
  });
});
