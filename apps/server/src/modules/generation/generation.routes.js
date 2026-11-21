import { Router } from "express";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { ApiError } from "../../lib/errors.js";
import { createGenerationService } from "./generation.service.js";
import {
  acceptDraftsSchema,
  generateTestCasesSchema,
  generationCallbackSchema,
  generationFailureSchema,
  listGenerationsQuerySchema,
  refineDraftsSchema,
} from "./generation.schemas.js";

export function generationRouter({
  prisma,
  n8nClient,
  publicBackendUrl,
  evidenceSigningSecret,
  evidenceUrlTtlSeconds,
}) {
  const router = Router({ mergeParams: true });

  const service = createGenerationService({
    prisma,
    n8nClient,
    publicBackendUrl,
    evidenceSigningSecret,
    evidenceUrlTtlSeconds,
  });

  // Start test case generation.
  router.post(
    "/",
    asyncHandler(async (req, res) => {
      const input = generateTestCasesSchema.parse(req.body ?? {});

      const result = await service.startGeneration(
        req.params.projectId,
        input.message,
        input.evidenceIds,
        input.generationFormat,
      );

      res.status(202).json({
        data: result,
      });
    }),
  );

  function callbackToken(req) {
    const authorization = req.get("authorization") ?? "";
    const tokenMatch = /^Bearer ([a-fA-F0-9]{64})$/.exec(authorization);

    if (!tokenMatch) {
      throw new ApiError(
        401,
        "INVALID_CALLBACK_TOKEN",
        "A valid callback authorization token is required",
      );
    }

    return tokenMatch[1];
  }

  // Receive generated test cases from n8n.
  router.post(
    "/:runId/callback",
    asyncHandler(async (req, res) => {
      const token = callbackToken(req);
      const input = generationCallbackSchema.parse(req.body ?? {});

      const result = await service.completeGeneration(
        req.params.projectId,
        req.params.runId,
        token,
        input.testCases,
        input.summary,
      );

      res.status(200).json({
        data: result,
      });
    }),
  );

  // n8n reports that the run failed, so the app can stop waiting for it.
  router.post(
    "/:runId/failure",
    asyncHandler(async (req, res) => {
      const token = callbackToken(req);
      const { error } = generationFailureSchema.parse(req.body ?? {});

      const result = await service.failGeneration(
        req.params.projectId,
        req.params.runId,
        token,
        error,
      );

      res.status(200).json({ data: result });
    }),
  );

  // List runs whose generated test cases are waiting for review (?review=pending).
  router.get(
    "/",
    asyncHandler(async (req, res) => {
      listGenerationsQuerySchema.parse(req.query);

      res.json(await service.listPendingReviews(req.params.projectId));
    }),
  );

  router.get(
    "/:runId",
    asyncHandler(async (req, res) => {
      const result = await service.getGenerationRun(
        req.params.projectId,
        req.params.runId,
      );

      res.status(200).json({ data: result });
    }),
  );

  // Save the selected drafts as test cases; the rest are discarded.
  router.post(
    "/:runId/accept",
    asyncHandler(async (req, res) => {
      const { indexes } = acceptDraftsSchema.parse(req.body ?? {});

      const result = await service.acceptDrafts(
        req.params.projectId,
        req.params.runId,
        indexes,
      );

      res.json({ data: result });
    }),
  );

  // AI chat: ask for a change to a batch that is waiting for review.
  router.post(
    "/:runId/refine",
    asyncHandler(async (req, res) => {
      const { instruction } = refineDraftsSchema.parse(req.body ?? {});

      const result = await service.startRefinement(
        req.params.projectId,
        req.params.runId,
        instruction,
      );

      res.status(202).json({ data: result });
    }),
  );

  // AI chat history of a batch: each request, its status and the reply.
  router.get(
    "/:runId/refinements",
    asyncHandler(async (req, res) => {
      res.json(
        await service.listRefinements(req.params.projectId, req.params.runId),
      );
    }),
  );

  // Discard all drafts without saving any.
  router.post(
    "/:runId/discard",
    asyncHandler(async (req, res) => {
      const result = await service.discardDrafts(
        req.params.projectId,
        req.params.runId,
      );

      res.json({ data: result });
    }),
  );

  return router;
}
