import { randomBytes, createHash, timingSafeEqual } from "node:crypto";

import { ApiError } from "../../lib/errors.js";
import { createEvidenceSignature } from "../evidence/evidence.signing.js";

const CALLBACK_TOKEN_TTL_MS = 5 * 60 * 1000;

function hashToken(token) {
  return createHash("sha256").update(token).digest();
}

function tokensMatch(receivedToken, storedHash) {
  if (
    typeof receivedToken !== "string" ||
    !/^[a-fA-F0-9]{64}$/.test(receivedToken) ||
    typeof storedHash !== "string" ||
    !/^[a-fA-F0-9]{64}$/.test(storedHash)
  ) {
    return false;
  }

  const receivedHash = hashToken(receivedToken);
  const savedHash = Buffer.from(storedHash, "hex");

  return timingSafeEqual(receivedHash, savedHash);
}

export function createGenerationService({
  prisma,
  n8nClient,
  publicBackendUrl,
  evidenceSigningSecret,
  evidenceUrlTtlSeconds,
}) {
  async function createRun(projectId, message, evidenceIds = []) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    });

    if (!project) {
      throw new ApiError(404, "NOT_FOUND", "Project not found");
    }

    let evidence = [];

    if (evidenceIds.length > 0) {
      evidence = await prisma.evidence.findMany({
        where: {
          projectId,
          id: { in: evidenceIds },
        },
        select: { id: true },
      });

      if (evidence.length !== evidenceIds.length) {
        throw new ApiError(
          400,
          "VALIDATION_ERROR",
          "One or more evidence files were not found",
        );
      }
    }

    const callbackToken = randomBytes(32).toString("hex");
    const callbackTokenHash = createHash("sha256")
      .update(callbackToken)
      .digest("hex");

    const expiresAt = new Date(Date.now() + CALLBACK_TOKEN_TTL_MS);

    const run = await prisma.generationRun.create({
      data: {
        projectId,
        status: "PENDING",
        callbackTokenHash,
        callbackTokenExpiresAt: expiresAt,
      },
    });

    async function getGenerationRun(projectId, runId) {
      const run = await prisma.generationRun.findFirst({
        where: {
          id: runId,
          projectId,
        },
        select: {
          id: true,
          status: true,
          error: true,
          createdAt: true,
          completedAt: true,
        },
      });

      if (!run) {
        throw new ApiError(404, "NOT_FOUND", "Generation run not found");
      }

      return run;
    }

    return {
      run,
      callbackToken,
      message,
      evidenceIds,
      evidence,
    };
  }

  async function startGeneration(projectId, message, evidenceIds = []) {
    const { run, callbackToken, evidence } = await createRun(
      projectId,
      message,
      evidenceIds,
    );

    const callbackUrl =
      `${publicBackendUrl}/api/projects/${projectId}` +
      `/generations/${run.id}/callback`;

    const expires = String(
      Math.floor(Date.now() / 1000) + evidenceUrlTtlSeconds,
    );

    const evidencePayload = evidence.map(({ id }) => {
      const signature = createEvidenceSignature({
        secret: evidenceSigningSecret,
        projectId,
        evidenceId: id,
        expires,
      });

      const url =
        `${publicBackendUrl.replace(/\/+$/, "")}` +
        `/api/projects/${encodeURIComponent(projectId)}` +
        `/evidence/${encodeURIComponent(id)}/signed-file` +
        `?expires=${expires}&signature=${signature}`;

      return { id, url };
    });

    try {
      await n8nClient.triggerGeneration({
        runId: run.id,
        projectId,
        message,
        evidenceIds,
        evidence: evidencePayload,
        callbackUrl,
        callbackToken,
      });

      return {
        id: run.id,
        projectId,
        status: "PENDING",
        createdAt: run.createdAt,
      };
    } catch (error) {
      await prisma.generationRun.update({
        where: { id: run.id },
        data: {
          status: "FAILED",
          error: "Unable to submit generation request to n8n",
          completedAt: new Date(),
          callbackTokenHash: null,
          callbackTokenExpiresAt: null,
        },
      });

      throw new ApiError(
        error.status || 502,
        error.code || "N8N_REQUEST_FAILED",
        error.message || "Unable to submit generation request to n8n",
      );
    }
  }
  async function completeGeneration(projectId, runId, token, testCases) {
    const receivedHash = hashToken(token).toString("hex");
    const now = new Date();

    return prisma.$transaction(async (tx) => {
      const run = await tx.generationRun.findFirst({
        where: {
          id: runId,
          projectId,
          status: "PENDING",
          callbackTokenExpiresAt: { gt: now },
          callbackTokenUsedAt: null,
        },
      });

      if (!run || !tokensMatch(token, run.callbackTokenHash)) {
        throw new ApiError(
          401,
          "INVALID_CALLBACK_TOKEN",
          "Callback token is invalid, expired, or already used",
        );
      }

      // Atomically consume the callback token.
      const consumed = await tx.generationRun.updateMany({
        where: {
          id: runId,
          projectId,
          status: "PENDING",
          callbackTokenHash: receivedHash,
          callbackTokenExpiresAt: { gt: now },
          callbackTokenUsedAt: null,
        },
        data: {
          callbackTokenUsedAt: now,
        },
      });

      if (consumed.count !== 1) {
        throw new ApiError(
          401,
          "INVALID_CALLBACK_TOKEN",
          "Callback token is invalid, expired, or already used",
        );
      }

      // Atomically reserve sequential test case numbers.
      const project = await tx.project.update({
        where: {
          id: projectId,
        },
        data: {
          nextTestCaseNumber: {
            increment: testCases.length,
          },
        },
        select: {
          nextTestCaseNumber: true,
        },
      });

      const firstNumber = project.nextTestCaseNumber - testCases.length;

      const records = testCases.map((testCase, index) => ({
        caseId: `TC-${String(firstNumber + index).padStart(4, "0")}`,
        projectId,
        generationRunId: runId,
        title: testCase.title,
        description: testCase.description ?? null,
        precondition: testCase.precondition ?? null,
        steps: Array.isArray(testCase.steps)
          ? testCase.steps
              .map((step, stepIndex) => `${stepIndex + 1}. ${step}`)
              .join("\n")
          : testCase.steps,
        data: testCase.data ?? null,
        expectedResult: testCase.expectedResult,
        runStatus: "Not Run",
      }));

      await tx.testCase.createMany({
        data: records,
      });

      await tx.generationRun.update({
        where: { id: runId },
        data: {
          status: "SUCCEEDED",
          completedAt: now,
          callbackTokenHash: null,
          callbackTokenExpiresAt: null,
        },
      });

      return {
        runId,
        status: "SUCCEEDED",
        createdCount: records.length,
        testCases: records,
      };
    });
  }

  return {
    createRun,
    startGeneration,
    completeGeneration,
    getGenerationRun,
  };
}
