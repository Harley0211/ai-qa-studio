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

function acceptDrafts(projectId, runId, indexes) {
  return api()
    .post(`/api/projects/${projectId}/generations/${runId}/accept`)
    .send({ indexes });
}

async function generateDrafts(projectId, testCases = sampleTestCases) {
  const run = await startGeneration(projectId);
  const callback = await sendCallback({ ...run, testCases });
  expect(callback.status).toBe(200);
  return run.runId;
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

describe("GET /api/projects/:projectId/generations/:runId", () => {
  it("returns a pending generation run", async () => {
    const project = await createProject();
    const { runId } = await startGeneration(project.id);

    const res = await api().get(
      `/api/projects/${project.id}/generations/${runId}`,
    );

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      id: runId,
      status: "PENDING",
      error: null,
    });
    expect(res.body.data.createdAt).toBeDefined();
  });

  it("returns the updated status after generation succeeds", async () => {
    const project = await createProject();
    const { runId, callbackToken, callbackUrl } = await startGeneration(
      project.id,
    );

    await sendCallback({ callbackUrl, callbackToken });

    const res = await api().get(
      `/api/projects/${project.id}/generations/${runId}`,
    );

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      id: runId,
      status: "SUCCEEDED",
      error: null,
      reviewStatus: "PENDING_REVIEW",
    });
    expect(res.body.data.completedAt).toBeDefined();
    expect(res.body.data.drafts).toHaveLength(2);
    expect(res.body.data.drafts[0]).toMatchObject({
      index: 0,
      title: "Login with valid credentials",
      steps: "1. Open the login page\n2. Enter valid credentials\n3. Click Login",
      expectedResult: "The user is redirected to the dashboard.",
      stepExpectedResults: null,
    });
    expect(res.body.data.drafts[1]).toMatchObject({ index: 1, description: null });
    expect(res.body.data).not.toHaveProperty("draftTestCases");
  });

  it("returns 404 for an unknown generation run", async () => {
    const project = await createProject();

    const res = await api().get(
      `/api/projects/${project.id}/generations/unknown-run`,
    );

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });
});

describe("POST /api/projects/:projectId/generations/:runId/callback", () => {
  it("stores generated test cases as drafts and completes the run", async () => {
    const project = await createProject({ name: "Callback Project" });
    const { runId, callbackToken, callbackUrl } = await startGeneration(
      project.id,
    );

    const res = await sendCallback({ callbackUrl, callbackToken });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      runId,
      status: "SUCCEEDED",
      draftCount: 2,
    });

    // Nothing reaches the library until the drafts are reviewed.
    expect(
      await prisma.testCase.count({ where: { projectId: project.id } }),
    ).toBe(0);

    const savedRun = await prisma.generationRun.findUnique({
      where: { id: runId },
    });

    expect(savedRun.status).toBe("SUCCEEDED");
    expect(JSON.parse(savedRun.draftTestCases)).toHaveLength(2);
    expect(savedRun.reviewedAt).toBeNull();
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

    const runs = await prisma.generationRun.findMany({
      where: { projectId: project.id },
    });

    expect(runs).toHaveLength(1);
    expect(JSON.parse(runs[0].draftTestCases)).toHaveLength(2);
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

  it("continues sequential test case IDs across accepted generation runs", async () => {
    const project = await createProject();

    for (let i = 0; i < 2; i += 1) {
      const run = await startGeneration(project.id);
      const callback = await sendCallback(run);
      expect(callback.status).toBe(200);

      const accept = await acceptDrafts(project.id, run.runId, [0, 1]);
      expect(accept.status).toBe(200);
    }

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

describe("Runs that fail or never return", () => {
  function reportFailure({ callbackUrl, callbackToken }, body = { error: "Parser: no usable test cases" }) {
    return api()
      .post(new URL(callbackUrl).pathname.replace(/\/callback$/, "/failure"))
      .set("Authorization", `Bearer ${callbackToken}`)
      .send(body);
  }

  it("marks the run failed when n8n reports an error", async () => {
    const project = await createProject();
    const run = await startGeneration(project.id);

    const res = await reportFailure(run);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ runId: run.runId, status: "FAILED" });

    const saved = await api().get(`/api/projects/${project.id}/generations/${run.runId}`);
    expect(saved.body.data).toMatchObject({
      status: "FAILED",
      error: "Generation failed in n8n: Parser: no usable test cases",
      drafts: null,
    });
    expect(saved.body.data.completedAt).not.toBeNull();
  });

  it("uses the one-time token: no callback after a failure, no failure after a callback", async () => {
    const project = await createProject();

    const failed = await startGeneration(project.id);
    await reportFailure(failed);
    expect((await sendCallback(failed)).status).toBe(401);

    const succeeded = await startGeneration(project.id);
    expect((await sendCallback(succeeded)).status).toBe(200);
    expect((await reportFailure(succeeded)).status).toBe(401);

    const run = await api().get(`/api/projects/${project.id}/generations/${succeeded.runId}`);
    expect(run.body.data.status).toBe("SUCCEEDED");
  });

  it("rejects failure reports without a valid token", async () => {
    const project = await createProject();
    const run = await startGeneration(project.id);

    const noToken = await api()
      .post(new URL(run.callbackUrl).pathname.replace(/\/callback$/, "/failure"))
      .send({ error: "x" });
    expect(noToken.status).toBe(401);

    const wrongToken = await reportFailure({ ...run, callbackToken: "b".repeat(64) });
    expect(wrongToken.status).toBe(401);

    const saved = await prisma.generationRun.findUnique({ where: { id: run.runId } });
    expect(saved.status).toBe("PENDING");
  });

  it("keeps a short reason, with a fallback for an empty one", async () => {
    const project = await createProject();

    const longRun = await startGeneration(project.id);
    await reportFailure(longRun, { error: "x".repeat(2000) });
    const long = await prisma.generationRun.findUnique({ where: { id: longRun.runId } });
    expect(long.error.length).toBeLessThanOrEqual(500);

    const emptyRun = await startGeneration(project.id);
    await reportFailure(emptyRun, {});
    const empty = await prisma.generationRun.findUnique({ where: { id: emptyRun.runId } });
    expect(empty.error).toBe("Generation failed in n8n: Unknown error");
  });

  it("closes a pending run once its callback token has expired", async () => {
    const project = await createProject();
    const stale = await startGeneration(project.id);
    const fresh = await startGeneration(project.id);

    await prisma.generationRun.update({
      where: { id: stale.runId },
      data: { callbackTokenExpiresAt: new Date(Date.now() - 1000) },
    });

    const res = await api().get(`/api/projects/${project.id}/generations/${stale.runId}`);
    expect(res.body.data).toMatchObject({
      status: "FAILED",
      error: "Timed out: n8n did not return test cases within 30 minutes",
    });

    const other = await api().get(`/api/projects/${project.id}/generations/${fresh.runId}`);
    expect(other.body.data.status).toBe("PENDING");
  });
});

describe("Reviewing generated test cases", () => {
  it("lists runs waiting for review, newest first", async () => {
    const project = await createProject();
    const first = await generateDrafts(project.id);
    await new Promise((r) => setTimeout(r, 15)); // distinct completedAt
    const second = await generateDrafts(project.id, [sampleTestCases[0]]);
    await startGeneration(project.id); // still pending: not listed

    const res = await api()
      .get(`/api/projects/${project.id}/generations`)
      .query({ review: "pending" });

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.items.map((run) => [run.id, run.draftCount])).toEqual([
      [second, 1],
      [first, 2],
    ]);
  });

  it("requires the review filter and a known project when listing", async () => {
    const project = await createProject();

    const noFilter = await api().get(`/api/projects/${project.id}/generations`);
    expect(noFilter.status).toBe(400);

    const unknown = await api()
      .get("/api/projects/unknown/generations")
      .query({ review: "pending" });
    expect(unknown.status).toBe(404);
  });

  it("saves only the selected drafts and discards the rest", async () => {
    const project = await createProject();
    const runId = await generateDrafts(project.id);

    const res = await acceptDrafts(project.id, runId, [1]);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      createdCount: 1,
      discardedCount: 1,
      caseIds: ["TC-0001"],
    });

    const cases = await prisma.testCase.findMany({ where: { projectId: project.id } });
    expect(cases).toHaveLength(1);
    expect(cases[0]).toMatchObject({
      caseId: "TC-0001",
      title: "Login with invalid password",
      generationRunId: runId,
      runStatus: "Not Run",
    });

    const run = await api().get(`/api/projects/${project.id}/generations/${runId}`);
    expect(run.body.data).toMatchObject({ reviewStatus: "REVIEWED", drafts: null });

    const pending = await api()
      .get(`/api/projects/${project.id}/generations`)
      .query({ review: "pending" });
    expect(pending.body.total).toBe(0);
  });

  it("keeps per-step expected results when accepting", async () => {
    const project = await createProject();
    const runId = await generateDrafts(project.id, [
      {
        title: "Per-step login",
        steps: ["Open page", "Submit"],
        stepExpectedResults: ["Page opens", "Dashboard shows"],
      },
    ]);

    await acceptDrafts(project.id, runId, [0]);

    const res = await api().get(`/api/projects/${project.id}/test-cases`);
    expect(res.body.items[0]).toMatchObject({
      expectedResult: "",
      stepExpectedResults: ["Page opens", "Dashboard shows"],
    });
  });

  it("can only be reviewed once", async () => {
    const project = await createProject();
    const runId = await generateDrafts(project.id);

    expect((await acceptDrafts(project.id, runId, [0])).status).toBe(200);

    const again = await acceptDrafts(project.id, runId, [1]);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("ALREADY_REVIEWED");

    const discard = await api().post(
      `/api/projects/${project.id}/generations/${runId}/discard`,
    );
    expect(discard.status).toBe(409);

    expect(await prisma.testCase.count({ where: { projectId: project.id } })).toBe(1);
  });

  it("discards all drafts without saving anything", async () => {
    const project = await createProject();
    const runId = await generateDrafts(project.id);

    const res = await api().post(
      `/api/projects/${project.id}/generations/${runId}/discard`,
    );

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ discardedCount: 2 });
    expect(await prisma.testCase.count({ where: { projectId: project.id } })).toBe(0);

    // Numbers are only used by accepted cases, so the next case is still TC-0001.
    const next = await generateDrafts(project.id);
    const accepted = await acceptDrafts(project.id, next, [0]);
    expect(accepted.body.data.caseIds).toEqual(["TC-0001"]);
  });

  it("rejects an out-of-range selection and leaves the drafts pending", async () => {
    const project = await createProject();
    const runId = await generateDrafts(project.id);

    const res = await acceptDrafts(project.id, runId, [0, 5]);
    expect(res.status).toBe(400);

    const run = await api().get(`/api/projects/${project.id}/generations/${runId}`);
    expect(run.body.data.reviewStatus).toBe("PENDING_REVIEW");
    expect(await prisma.testCase.count({ where: { projectId: project.id } })).toBe(0);
  });

  it("validates the accept request", async () => {
    const project = await createProject();
    const runId = await generateDrafts(project.id);

    expect((await acceptDrafts(project.id, runId, [])).status).toBe(400);
    expect((await acceptDrafts(project.id, runId, [0, 0])).status).toBe(400);
    expect((await acceptDrafts(project.id, "unknown-run", [0])).status).toBe(404);
  });
});

describe("AI chat: refining generated test cases", () => {
  async function refine(projectId, runId, instruction = "Add a test for a locked account") {
    const callIndex = n8nClient.triggerGeneration.mock.calls.length;
    const res = await api()
      .post(`/api/projects/${projectId}/generations/${runId}/refine`)
      .send({ instruction });
    const payload = n8nClient.triggerGeneration.mock.calls[callIndex]?.[0];
    return { res, payload };
  }

  const history = (projectId, runId) =>
    api().get(`/api/projects/${projectId}/generations/${runId}/refinements`);

  const drafts = async (projectId, runId) =>
    (await api().get(`/api/projects/${projectId}/generations/${runId}`)).body.data.drafts;

  const lockedAccount = {
    title: "Login with a locked account",
    steps: ["Open the login page", "Sign in as a locked user"],
    expectedResult: "An 'account locked' message is shown.",
  };

  it("sends the batch's current cases and the instruction to n8n", async () => {
    const project = await createProject();
    const runId = await generateDrafts(project.id);

    const { res, payload } = await refine(project.id, runId);

    expect(res.status).toBe(202);
    expect(res.body.data).toMatchObject({ status: "PENDING", projectId: project.id });
    expect(res.body.data.id).not.toBe(runId);

    expect(payload).toMatchObject({
      mode: "REFINE",
      runId: res.body.data.id,
      message: "Add a test for a locked account",
      instruction: "Add a test for a locked account",
      generationFormat: "OVERALL",
      history: [],
      evidenceIds: [],
      evidence: [],
    });
    expect(payload.currentTestCases).toHaveLength(2);
    expect(payload.currentTestCases[0]).toMatchObject({
      title: "Login with valid credentials",
      steps: ["Open the login page", "Enter valid credentials", "Click Login"],
    });
    expect(payload.callbackUrl).toContain(`/generations/${res.body.data.id}/callback`);
    expect(payload.callbackToken).toHaveLength(64);

    const list = await history(project.id, runId);
    expect(list.body.items).toEqual([
      expect.objectContaining({
        id: res.body.data.id,
        status: "PENDING",
        instruction: "Add a test for a locked account",
        replySummary: null,
      }),
    ]);

    // The chat request is not a batch of its own.
    const pending = await api()
      .get(`/api/projects/${project.id}/generations`)
      .query({ review: "pending" });
    expect(pending.body.items.map((run) => run.id)).toEqual([runId]);
  });

  it("replaces the batch's drafts with the changed cases and keeps the reply", async () => {
    const project = await createProject();
    const runId = await generateDrafts(project.id);
    const { payload } = await refine(project.id, runId);

    const callback = await sendCallback({
      ...payload,
      testCases: [...sampleTestCases, lockedAccount],
    });
    expect(callback.status).toBe(200);
    expect(callback.body.data).toMatchObject({ status: "SUCCEEDED", draftCount: 3 });

    // sendCallback sends no summary; send one through a second request.
    const second = await refine(project.id, runId, "Remove the invalid password case");
    const withSummary = await api()
      .post(new URL(second.payload.callbackUrl).pathname)
      .set("Authorization", `Bearer ${second.payload.callbackToken}`)
      .send({
        testCases: [sampleTestCases[0], lockedAccount],
        summary: "Removed the invalid password case.",
      });
    expect(withSummary.status).toBe(200);

    expect((await drafts(project.id, runId)).map((d) => d.title)).toEqual([
      "Login with valid credentials",
      "Login with a locked account",
    ]);

    const list = await history(project.id, runId);
    expect(list.body.items.map((item) => [item.instruction, item.status, item.replySummary])).toEqual([
      ["Add a test for a locked account", "SUCCEEDED", null],
      ["Remove the invalid password case", "SUCCEEDED", "Removed the invalid password case."],
    ]);

    // Earlier exchanges are sent along so the model has the conversation.
    expect(second.payload.history).toEqual([
      { instruction: "Add a test for a locked account", reply: "" },
    ]);

    // Accepting uses the changed drafts.
    const accepted = await acceptDrafts(project.id, runId, [1]);
    expect(accepted.body.data.caseIds).toEqual(["TC-0001"]);
    const saved = await prisma.testCase.findFirst({ where: { projectId: project.id } });
    expect(saved.title).toBe("Login with a locked account");
  });

  it("allows one change at a time per batch", async () => {
    const project = await createProject();
    const runId = await generateDrafts(project.id);
    await refine(project.id, runId);

    const { res } = await refine(project.id, runId, "Another change");
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("REFINEMENT_IN_PROGRESS");
  });

  it("does not change a batch that was reviewed while the change was running", async () => {
    const project = await createProject();
    const runId = await generateDrafts(project.id);
    const { payload } = await refine(project.id, runId);

    await acceptDrafts(project.id, runId, [0]);

    const callback = await sendCallback({ ...payload, testCases: [lockedAccount] });
    expect(callback.status).toBe(200);
    expect(callback.body.data.status).toBe("FAILED");

    const [item] = (await history(project.id, runId)).body.items;
    expect(item).toMatchObject({
      status: "FAILED",
      error: "The test cases were reviewed before this change finished, so it was not applied",
    });

    const saved = await prisma.testCase.findMany({ where: { projectId: project.id } });
    expect(saved.map((c) => c.title)).toEqual(["Login with valid credentials"]);

    // A reviewed batch can't be changed any more.
    const { res } = await refine(project.id, runId);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("ALREADY_REVIEWED");
  });

  it("marks the change failed when n8n reports an error, and allows a new one", async () => {
    const project = await createProject();
    const runId = await generateDrafts(project.id);
    const { payload } = await refine(project.id, runId);

    await api()
      .post(new URL(payload.callbackUrl).pathname.replace(/callback$/, "failure"))
      .set("Authorization", `Bearer ${payload.callbackToken}`)
      .send({ error: "Build Refine Request: Could not work out what to change" });

    const [item] = (await history(project.id, runId)).body.items;
    expect(item).toMatchObject({
      status: "FAILED",
      error: "Couldn't make this change: Could not work out what to change",
    });
    expect(await drafts(project.id, runId)).toHaveLength(2);

    expect((await refine(project.id, runId)).res.status).toBe(202);
  });

  it("closes a change that never comes back, so the chat is not stuck", async () => {
    const project = await createProject();
    const runId = await generateDrafts(project.id);
    const { res } = await refine(project.id, runId);

    await prisma.generationRun.update({
      where: { id: res.body.data.id },
      data: { callbackTokenExpiresAt: new Date(Date.now() - 1000) },
    });

    const [item] = (await history(project.id, runId)).body.items;
    expect(item.status).toBe("FAILED");
    expect((await refine(project.id, runId)).res.status).toBe(202);
  });

  it("returns an error and records the failure when n8n is unavailable", async () => {
    const project = await createProject();
    const runId = await generateDrafts(project.id);

    n8nClient.triggerGeneration.mockRejectedValueOnce(
      Object.assign(new Error("Unable to connect to n8n"), {
        code: "N8N_CONNECTION_ERROR",
        status: 502,
      }),
    );

    const { res } = await refine(project.id, runId);
    expect(res.status).toBe(502);

    const [item] = (await history(project.id, runId)).body.items;
    expect(item.status).toBe("FAILED");
  });

  it("sends per-step batches as per-step and splits numbered step text", async () => {
    const project = await createProject();
    const runId = await generateDrafts(project.id, [
      {
        title: "Per-step login",
        steps: "1. Open page\n2. Submit",
        stepExpectedResults: ["Page opens", "Dashboard shows"],
      },
    ]);

    const { payload } = await refine(project.id, runId);

    expect(payload.generationFormat).toBe("PER_STEP");
    expect(payload.currentTestCases[0]).toMatchObject({
      steps: ["Open page", "Submit"],
      stepExpectedResults: ["Page opens", "Dashboard shows"],
    });
  });

  it("validates the request", async () => {
    const project = await createProject();
    const runId = await generateDrafts(project.id);

    expect((await refine(project.id, runId, "   ")).res.status).toBe(400);
    expect((await refine(project.id, runId, "x".repeat(1001))).res.status).toBe(400);
    expect((await refine(project.id, "unknown-run")).res.status).toBe(404);
    expect((await history(project.id, "unknown-run")).status).toBe(404);

    // A chat request is not itself a batch that can be refined.
    const { res } = await refine(project.id, runId);
    expect((await refine(project.id, res.body.data.id)).res.status).toBe(404);
  });
});
