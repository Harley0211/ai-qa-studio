import { Router } from "express";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { ApiError } from "../../lib/errors.js";
import { createGenerationService } from "./generation.service.js";
import {
  generateTestCasesSchema,
  generationCallbackSchema,
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
      );

      res.status(202).json({
        data: result,
      });
    }),
  );

  // Receive generated test cases from n8n.
  router.post(
    "/:runId/callback",
    asyncHandler(async (req, res) => {
      const authorization = req.get("authorization") ?? "";
      const tokenMatch = /^Bearer ([a-fA-F0-9]{64})$/.exec(authorization);

      if (!tokenMatch) {
        throw new ApiError(
          401,
          "INVALID_CALLBACK_TOKEN",
          "A valid callback authorization token is required",
        );
      }

      const input = generationCallbackSchema.parse(req.body ?? {});

      const result = await service.completeGeneration(
        req.params.projectId,
        req.params.runId,
        tokenMatch[1],
        input.testCases,
      );

      res.status(200).json({
        data: result,
      });
    }),
  );

  return router;
}
