import { describe, it, expect, vi } from "vitest";
import { createGenerationService } from "../src/modules/generation/generation.service.js";
const generationConfig = {
  evidenceSigningSecret: "test-evidence-signing-secret-32-characters",
  evidenceUrlTtlSeconds: 300,
};

function createPrismaMock() {
  let runRecord = null;
  let nextTestCaseNumber = 1;

  const tx = {
    generationRun: {
      findFirst: vi.fn().mockImplementation(async () => runRecord),
      updateMany: vi.fn().mockImplementation(async ({ data }) => {
        if (!runRecord || runRecord.status !== "PENDING") {
          return { count: 0 };
        }

        Object.assign(runRecord, data);
        return { count: 1 };
      }),
      update: vi.fn().mockImplementation(async ({ data }) => {
        Object.assign(runRecord, data);
        return runRecord;
      }),
    },
    project: {
      update: vi.fn().mockImplementation(async ({ data }) => {
        nextTestCaseNumber += data.nextTestCaseNumber.increment;

        return {
          nextTestCaseNumber,
        };
      }),
    },
    testCase: {
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  };

  return {
    project: {
      findUnique: vi.fn().mockResolvedValue({ id: "project-1" }),
    },
    evidence: {
      findMany: vi.fn().mockResolvedValue([{ id: "evidence-1" }]),
    },
    generationRun: {
      create: vi.fn().mockImplementation(({ data }) => {
        runRecord = {
          id: "run-1",
          ...data,
        };

        return Promise.resolve(runRecord);
      }),
      update: vi.fn().mockResolvedValue({ id: "run-1", status: "FAILED" }),
    },
    $transaction: vi.fn().mockImplementation((callback) => callback(tx)),
    tx,
    getRun: () => runRecord,
  };
}

const sampleTestCases = [
  {
    title: "Login with valid credentials",
    description: "Verify successful login",
    precondition: "User has an active account",
    steps: ["Open login page", "Enter valid credentials", "Click Login"],
    expectedResult: "User is redirected to the dashboard",
  },
  {
    title: "Login with invalid password",
    steps: ["Open login page", "Enter an invalid password", "Click Login"],
    expectedResult: "An error message is displayed",
  },
];

describe("Generation service", () => {
  it("creates a pending generation run", async () => {
    const prisma = createPrismaMock();
    const service = createGenerationService({ prisma });

    const result = await service.createRun(
      "project-1",
      "Generate login test cases",
    );

    expect(result.run.status).toBe("PENDING");
    expect(result.run.projectId).toBe("project-1");
    expect(result.callbackToken).toHaveLength(64);
  });

  it("stores only the callback token hash", async () => {
    const prisma = createPrismaMock();
    const service = createGenerationService({ prisma });

    const result = await service.createRun("project-1", "Generate test cases");

    const savedData = prisma.generationRun.create.mock.calls[0][0].data;

    expect(savedData.callbackTokenHash).not.toBe(result.callbackToken);
    expect(savedData.callbackTokenHash).toHaveLength(64);
  });

  it("rejects an unknown project", async () => {
    const prisma = createPrismaMock();
    prisma.project.findUnique.mockResolvedValue(null);

    const service = createGenerationService({ prisma });

    await expect(
      service.createRun("unknown", "Generate test cases"),
    ).rejects.toMatchObject({ status: 404 });

    expect(prisma.generationRun.create).not.toHaveBeenCalled();
  });

  it("rejects evidence belonging to another project or missing evidence", async () => {
    const prisma = createPrismaMock();
    prisma.evidence.findMany.mockResolvedValue([]);

    const service = createGenerationService({ prisma });

    await expect(
      service.createRun("project-1", "Generate test cases", ["evidence-1"]),
    ).rejects.toMatchObject({ status: 400 });

    expect(prisma.generationRun.create).not.toHaveBeenCalled();
  });

  it("starts generation through n8n", async () => {
    const prisma = createPrismaMock();
    const n8nClient = {
      triggerGeneration: vi.fn().mockResolvedValue({
        accepted: true,
        status: 200,
      }),
    };

    const service = createGenerationService({
      prisma,
      n8nClient,
      publicBackendUrl: "http://127.0.0.1:4000",
      ...generationConfig,
    });

    const result = await service.startGeneration(
      "project-1",
      "Generate login test cases",
      ["evidence-1"],
    );

    expect(result.status).toBe("PENDING");
    expect(result.id).toBe("run-1");
    expect(n8nClient.triggerGeneration).toHaveBeenCalledOnce();

    const payload = n8nClient.triggerGeneration.mock.calls[0][0];

    expect(payload.projectId).toBe("project-1");

    expect(payload.evidence).toHaveLength(1);
    expect(payload.evidence[0].id).toBe("evidence-1");
    expect(payload.evidence[0].url).toContain(
      "/api/projects/project-1/evidence/evidence-1/signed-file",
    );

    const signedUrl = new URL(payload.evidence[0].url);
    const expires = signedUrl.searchParams.get("expires");
    const signature = signedUrl.searchParams.get("signature");

    expect(Number(expires)).toBeGreaterThan(Math.floor(Date.now() / 1000));
    expect(signature).toMatch(/^[a-f0-9]{64}$/);
    expect(payload.callbackUrl).toContain("/generations/run-1/callback");
    expect(payload.callbackToken).toHaveLength(64);
  });

  it("marks generation as failed when n8n request fails", async () => {
    const prisma = createPrismaMock();
    const n8nClient = {
      triggerGeneration: vi.fn().mockRejectedValue(
        Object.assign(new Error("Unable to connect to n8n"), {
          code: "N8N_CONNECTION_ERROR",
          status: 502,
        }),
      ),
    };

    const service = createGenerationService({
      prisma,
      n8nClient,
      publicBackendUrl: "http://127.0.0.1:4000",
      ...generationConfig,
    });
    await expect(
      service.startGeneration("project-1", "Generate test cases"),
    ).rejects.toMatchObject({
      code: "N8N_CONNECTION_ERROR",
    });

    expect(prisma.generationRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "run-1" },
        data: expect.objectContaining({
          status: "FAILED",
          callbackTokenHash: null,
          callbackTokenExpiresAt: null,
        }),
      }),
    );
  });

  it("saves generated test cases and assigns sequential IDs", async () => {
    const prisma = createPrismaMock();
    const service = createGenerationService({ prisma });

    const { callbackToken } = await service.createRun(
      "project-1",
      "Generate login test cases",
    );

    const result = await service.completeGeneration(
      "project-1",
      "run-1",
      callbackToken,
      sampleTestCases,
    );

    expect(result.status).toBe("SUCCEEDED");
    expect(result.createdCount).toBe(2);

    const savedCases = prisma.tx.testCase.createMany.mock.calls[0][0].data;

    expect(savedCases.map((item) => item.caseId)).toEqual([
      "TC-0001",
      "TC-0002",
    ]);

    expect(savedCases[0].steps).toBe(
      "1. Open login page\n2. Enter valid credentials\n3. Click Login",
    );

    expect(savedCases[0].runStatus).toBe("Not Run");
    expect(prisma.getRun().status).toBe("SUCCEEDED");
    expect(prisma.getRun().callbackTokenHash).toBeNull();
  });

  it("rejects an invalid callback token", async () => {
    const prisma = createPrismaMock();
    const service = createGenerationService({ prisma });

    await service.createRun("project-1", "Generate test cases");

    await expect(
      service.completeGeneration(
        "project-1",
        "run-1",
        "invalid-token",
        sampleTestCases,
      ),
    ).rejects.toMatchObject({
      status: 401,
      code: "INVALID_CALLBACK_TOKEN",
    });

    expect(prisma.tx.testCase.createMany).not.toHaveBeenCalled();
  });

  it("rejects an expired callback token", async () => {
    const prisma = createPrismaMock();
    const service = createGenerationService({ prisma });

    const { callbackToken } = await service.createRun(
      "project-1",
      "Generate test cases",
    );

    prisma.getRun().callbackTokenExpiresAt = new Date(Date.now() - 1000);
    prisma.tx.generationRun.findFirst.mockResolvedValue(null);

    await expect(
      service.completeGeneration(
        "project-1",
        "run-1",
        callbackToken,
        sampleTestCases,
      ),
    ).rejects.toMatchObject({
      status: 401,
      code: "INVALID_CALLBACK_TOKEN",
    });
  });

  it("rejects a callback token that has already been used", async () => {
    const prisma = createPrismaMock();
    const service = createGenerationService({ prisma });

    const { callbackToken } = await service.createRun(
      "project-1",
      "Generate test cases",
    );

    await service.completeGeneration(
      "project-1",
      "run-1",
      callbackToken,
      sampleTestCases,
    );

    await expect(
      service.completeGeneration(
        "project-1",
        "run-1",
        callbackToken,
        sampleTestCases,
      ),
    ).rejects.toMatchObject({
      status: 401,
      code: "INVALID_CALLBACK_TOKEN",
    });
  });
});
