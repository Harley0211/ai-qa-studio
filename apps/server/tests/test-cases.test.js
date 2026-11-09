import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { api, createProject, prisma, resetDb } from "./helpers.js";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

async function createTestCase(projectId, overrides = {}) {
  return api()
    .post(`/api/projects/${projectId}/test-cases`)
    .send({
      title: "Verify successful login",
      description: "Check the login functionality",
      precondition: "User account exists",
      steps: ["Open login page", "Enter valid credentials", "Click Login"],
      data: "Username: standard_user",
      expectedResult: "User is redirected to the dashboard",
      ...overrides,
    });
}

describe("POST /api/projects/:projectId/test-cases", () => {
  it("creates a manual test case with a sequential case ID", async () => {
    const project = await createProject();

    const res = await createTestCase(project.id);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      caseId: "TC-0001",
      projectId: project.id,
      title: "Verify successful login",
      runStatus: "Not Run",
    });
    expect(res.body.id).toBeTruthy();
    expect(res.body.steps).toContain("1. Open login page");
    expect(res.body.steps).toContain("3. Click Login");
  });

  it("increments case IDs for subsequent test cases", async () => {
    const project = await createProject();

    const first = await createTestCase(project.id);
    const second = await createTestCase(project.id, {
      title: "Verify invalid login",
    });

    expect(first.body.caseId).toBe("TC-0001");
    expect(second.body.caseId).toBe("TC-0002");
  });

  it("stores optional fields as null when omitted", async () => {
    const project = await createProject();

    const res = await createTestCase(project.id, {
      description: undefined,
      precondition: undefined,
      data: undefined,
    });

    expect(res.status).toBe(201);
    expect(res.body.description).toBeNull();
    expect(res.body.precondition).toBeNull();
    expect(res.body.data).toBeNull();
  });

  it("accepts steps as a string", async () => {
    const project = await createProject();

    const res = await createTestCase(project.id, {
      steps: "Open login page and enter credentials",
    });

    expect(res.status).toBe(201);
    expect(res.body.steps).toBe("Open login page and enter credentials");
  });

  it("rejects a blank title", async () => {
    const project = await createProject();

    const res = await createTestCase(project.id, {
      title: "   ",
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects missing expected results", async () => {
    const project = await createProject();

    const res = await createTestCase(project.id, {
      expectedResult: "",
    });

    expect(res.status).toBe(400);
  });

  it("rejects an empty steps array", async () => {
    const project = await createProject();

    const res = await createTestCase(project.id, {
      steps: [],
    });

    expect(res.status).toBe(400);
  });

  it("returns 404 for an unknown project", async () => {
    const res = await createTestCase("does-not-exist");

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });
});

describe("GET /api/projects/:projectId/test-cases", () => {
  it("returns an empty list when no test cases exist", async () => {
    const project = await createProject();

    const res = await api().get(`/api/projects/${project.id}/test-cases`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ items: [], total: 0 });
  });

  it("lists test cases in case ID order", async () => {
    const project = await createProject();

    await createTestCase(project.id);
    await createTestCase(project.id, { title: "Verify logout" });

    const res = await api().get(`/api/projects/${project.id}/test-cases`);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.items.map((item) => item.caseId)).toEqual([
      "TC-0001",
      "TC-0002",
    ]);
  });

  it("filters test cases by title or case ID", async () => {
    const project = await createProject();

    await createTestCase(project.id);
    await createTestCase(project.id, { title: "Verify logout" });

    const res = await api()
      .get(`/api/projects/${project.id}/test-cases`)
      .query({ q: "logout" });

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.items[0].title).toBe("Verify logout");
  });

  it("filters test cases by execution status", async () => {
    const project = await createProject();

    await createTestCase(project.id);
    const second = await createTestCase(project.id, {
      title: "Verify logout",
    });

    await api()
      .patch(`/api/projects/${project.id}/test-cases/${second.body.id}/status`)
      .send({ runStatus: "Passed" });

    const res = await api()
      .get(`/api/projects/${project.id}/test-cases`)
      .query({ runStatus: "Passed" });

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.items[0].runStatus).toBe("Passed");
  });
});

describe("GET /api/projects/:projectId/test-cases/:testCaseId", () => {
  it("returns a single test case", async () => {
    const project = await createProject();
    const created = await createTestCase(project.id);

    const res = await api().get(
      `/api/projects/${project.id}/test-cases/${created.body.id}`,
    );

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(created.body.id);
  });

  it("returns 404 for an unknown test case", async () => {
    const project = await createProject();

    const res = await api().get(
      `/api/projects/${project.id}/test-cases/does-not-exist`,
    );

    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/projects/:projectId/test-cases/:testCaseId", () => {
  it("updates test case details", async () => {
    const project = await createProject();
    const created = await createTestCase(project.id);

    const res = await api()
      .patch(`/api/projects/${project.id}/test-cases/${created.body.id}`)
      .send({
        title: "Verify login with valid credentials",
      });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe("Verify login with valid credentials");
  });

  it("rejects an empty update body", async () => {
    const project = await createProject();
    const created = await createTestCase(project.id);

    const res = await api()
      .patch(`/api/projects/${project.id}/test-cases/${created.body.id}`)
      .send({});

    expect(res.status).toBe(400);
  });

  it("returns 404 for an unknown test case", async () => {
    const project = await createProject();

    const res = await api()
      .patch(`/api/projects/${project.id}/test-cases/does-not-exist`)
      .send({ title: "Updated title" });

    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/projects/:projectId/test-cases/:testCaseId/status", () => {
  it.each(["Passed", "Failed", "Blocked", "Not Run"])(
    "updates execution status to %s",
    async (runStatus) => {
      const project = await createProject();
      const created = await createTestCase(project.id);

      const res = await api()
        .patch(
          `/api/projects/${project.id}/test-cases/${created.body.id}/status`,
        )
        .send({ runStatus });

      expect(res.status).toBe(200);
      expect(res.body.runStatus).toBe(runStatus);
    },
  );

  it("rejects an unsupported execution status", async () => {
    const project = await createProject();
    const created = await createTestCase(project.id);

    const res = await api()
      .patch(`/api/projects/${project.id}/test-cases/${created.body.id}/status`)
      .send({ runStatus: "Skipped" });

    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/projects/:projectId/test-cases/:testCaseId", () => {
  it("deletes a test case", async () => {
    const project = await createProject();
    const created = await createTestCase(project.id);

    const res = await api().delete(
      `/api/projects/${project.id}/test-cases/${created.body.id}`,
    );

    expect(res.status).toBe(204);

    const remaining = await prisma.testCase.count({
      where: { projectId: project.id },
    });

    expect(remaining).toBe(0);
  });

  it("returns 404 for an unknown test case", async () => {
    const project = await createProject();

    const res = await api().delete(
      `/api/projects/${project.id}/test-cases/does-not-exist`,
    );

    expect(res.status).toBe(404);
  });
});
