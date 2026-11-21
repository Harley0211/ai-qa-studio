import { randomBytes, createHash, timingSafeEqual } from "node:crypto";

import { ApiError } from "../../lib/errors.js";
import { createEvidenceSignature } from "../evidence/evidence.signing.js";

const CALLBACK_TOKEN_TTL_MS = 30 * 60 * 1000;
const MAX_ERROR_LENGTH = 500;
export const TIMED_OUT_ERROR =
  "Timed out: n8n did not return test cases within 30 minutes";

const invalidCallbackToken = () =>
  new ApiError(
    401,
    "INVALID_CALLBACK_TOKEN",
    "Callback token is invalid, expired, or already used",
  );
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

function formatSteps(steps) {
  return Array.isArray(steps)
    ? steps.map((step, stepIndex) => `${stepIndex + 1}. ${step}`).join("\n")
    : steps;
}

// A generated case as the UI shows it (same shape as a saved test case).
function toDraftView(testCase, index) {
  return {
    index,
    title: testCase.title,
    description: testCase.description || null,
    precondition: testCase.precondition || null,
    steps: formatSteps(testCase.steps),
    data: testCase.data || null,
    expectedResult: testCase.expectedResult ?? "",
    stepExpectedResults: testCase.stepExpectedResults?.length
      ? testCase.stepExpectedResults
      : null,
  };
}

function parseDrafts(value) {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

// Which document section a run came from, or null for image/other runs.
const sourceSelect = {
  documentId: true,
  sectionTitle: true,
  document: { select: { title: true } },
};

function toSource({ documentId, sectionTitle, document }) {
  if (!documentId && !sectionTitle) return null;
  return {
    documentId,
    documentTitle: document?.title ?? null,
    sectionTitle,
  };
}

const alreadyReviewed = () =>
  new ApiError(
    409,
    "ALREADY_REVIEWED",
    "These generated test cases have already been reviewed",
  );

export function createGenerationService({
  prisma,
  n8nClient,
  publicBackendUrl,
  evidenceSigningSecret,
  evidenceUrlTtlSeconds,
}) {
  async function createRun(projectId, message, evidenceIds = [], source = {}) {
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
        documentId: source.documentId ?? null,
        sectionTitle: source.sectionTitle ?? null,
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

  async function startGeneration(
    projectId,
    message,
    evidenceIds = [],
    generationFormat = "OVERALL",
    source = {},
  ) {
    const { run, callbackToken, evidence } = await createRun(
      projectId,
      message,
      evidenceIds,
      source,
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
        generationFormat,
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

  // Checks the one-time callback token and marks it used, inside a transaction.
  // Used by both the success callback and the failure report from n8n.
  async function consumeCallbackToken(tx, projectId, runId, token, now) {
    const receivedHash = hashToken(token).toString("hex");

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
      throw invalidCallbackToken();
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

    if (consumed.count !== 1) throw invalidCallbackToken();
  }

  // n8n reports that it could not produce test cases for this run.
  async function failGeneration(projectId, runId, token, reason) {
    const now = new Date();

    return prisma.$transaction(async (tx) => {
      await consumeCallbackToken(tx, projectId, runId, token, now);

      await tx.generationRun.update({
        where: { id: runId },
        data: {
          status: "FAILED",
          error: `Generation failed in n8n: ${reason}`.slice(0, MAX_ERROR_LENGTH),
          completedAt: now,
          callbackTokenHash: null,
          callbackTokenExpiresAt: null,
        },
      });

      return { runId, status: "FAILED" };
    });
  }

  // A run whose callback token has expired can never complete, so it is
  // closed as failed instead of staying PENDING forever.
  async function expireStaleRuns(where) {
    const now = new Date();

    await prisma.generationRun.updateMany({
      where: { ...where, status: "PENDING", callbackTokenExpiresAt: { lt: now } },
      data: {
        status: "FAILED",
        error: TIMED_OUT_ERROR,
        completedAt: now,
        callbackTokenHash: null,
        callbackTokenExpiresAt: null,
      },
    });
  }

  async function completeGeneration(projectId, runId, token, testCases) {
    const now = new Date();

    return prisma.$transaction(async (tx) => {
      await consumeCallbackToken(tx, projectId, runId, token, now);

      // Keep the cases as drafts; they become test cases only when accepted.
      await tx.generationRun.update({
        where: { id: runId },
        data: {
          status: "SUCCEEDED",
          completedAt: now,
          callbackTokenHash: null,
          callbackTokenExpiresAt: null,
          draftTestCases: JSON.stringify(testCases),
        },
      });

      return {
        runId,
        status: "SUCCEEDED",
        draftCount: testCases.length,
      };
    });
  }

  async function getGenerationRun(projectId, runId) {
    await expireStaleRuns({ id: runId, projectId });

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
        reviewedAt: true,
        draftTestCases: true,
        ...sourceSelect,
      },
    });

    if (!run) {
      throw new ApiError(404, "NOT_FOUND", "Generation run not found");
    }

    const { draftTestCases, documentId, sectionTitle, document, ...rest } = run;
    const drafts = parseDrafts(draftTestCases);

    return {
      ...rest,
      source: toSource({ documentId, sectionTitle, document }),
      reviewStatus: drafts ? "PENDING_REVIEW" : run.reviewedAt ? "REVIEWED" : null,
      drafts: drafts ? drafts.map(toDraftView) : null,
    };
  }

  async function listPendingReviews(projectId) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    });

    if (!project) {
      throw new ApiError(404, "NOT_FOUND", "Project not found");
    }

    const runs = await prisma.generationRun.findMany({
      where: { projectId, draftTestCases: { not: null }, reviewedAt: null },
      orderBy: { completedAt: "desc" },
      select: {
        id: true,
        createdAt: true,
        completedAt: true,
        draftTestCases: true,
        ...sourceSelect,
      },
    });

    const items = runs.map(
      ({ draftTestCases, documentId, sectionTitle, document, ...run }) => ({
        ...run,
        source: toSource({ documentId, sectionTitle, document }),
        draftCount: parseDrafts(draftTestCases)?.length ?? 0,
      }),
    );

    return { items, total: items.length };
  }

  // Marks the run reviewed exactly once and returns its drafts.
  async function claimDrafts(tx, projectId, runId) {
    const run = await tx.generationRun.findFirst({
      where: { id: runId, projectId },
      select: {
        draftTestCases: true,
        reviewedAt: true,
        documentId: true,
        sectionTitle: true,
      },
    });

    if (!run) {
      throw new ApiError(404, "NOT_FOUND", "Generation run not found");
    }

    const drafts = parseDrafts(run.draftTestCases);
    if (!drafts || run.reviewedAt) throw alreadyReviewed();

    const claimed = await tx.generationRun.updateMany({
      where: { id: runId, projectId, draftTestCases: { not: null }, reviewedAt: null },
      data: { draftTestCases: null, reviewedAt: new Date() },
    });

    if (claimed.count !== 1) throw alreadyReviewed();

    return { drafts, documentId: run.documentId, sectionTitle: run.sectionTitle };
  }

  async function acceptDrafts(projectId, runId, indexes) {
    return prisma.$transaction(async (tx) => {
      const { drafts, documentId, sectionTitle } = await claimDrafts(
        tx,
        projectId,
        runId,
      );

      if (indexes.some((index) => index >= drafts.length)) {
        throw new ApiError(
          400,
          "VALIDATION_ERROR",
          "One or more selected test cases do not exist",
        );
      }

      const selected = [...indexes].sort((a, b) => a - b).map((i) => drafts[i]);

      // Atomically reserve sequential test case numbers.
      const project = await tx.project.update({
        where: { id: projectId },
        data: { nextTestCaseNumber: { increment: selected.length } },
        select: { nextTestCaseNumber: true },
      });

      const firstNumber = project.nextTestCaseNumber - selected.length;

      const records = selected.map((testCase, index) => ({
        caseId: `TC-${String(firstNumber + index).padStart(4, "0")}`,
        projectId,
        generationRunId: runId,
        title: testCase.title,
        description: testCase.description ?? null,
        precondition: testCase.precondition ?? null,
        steps: formatSteps(testCase.steps),
        data: testCase.data ?? null,
        expectedResult: testCase.expectedResult ?? "",
        stepExpectedResults: testCase.stepExpectedResults
          ? JSON.stringify(testCase.stepExpectedResults)
          : null,
        runStatus: "Not Run",
        sourceDocumentId: documentId ?? null,
        sourceSection: sectionTitle ?? null,
      }));

      await tx.testCase.createMany({ data: records });

      return {
        createdCount: records.length,
        discardedCount: drafts.length - records.length,
        caseIds: records.map((record) => record.caseId),
      };
    });
  }

  async function discardDrafts(projectId, runId) {
    return prisma.$transaction(async (tx) => {
      const { drafts } = await claimDrafts(tx, projectId, runId);
      return { discardedCount: drafts.length };
    });
  }

  return {
    createRun,
    startGeneration,
    completeGeneration,
    failGeneration,
    expireStaleRuns,
    getGenerationRun,
    listPendingReviews,
    acceptDrafts,
    discardDrafts,
  };
}

