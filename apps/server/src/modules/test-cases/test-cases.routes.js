import { Router } from "express";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { createTestCasesService } from "./test-cases.service.js";
import {
  createTestCaseSchema,
  updateTestCaseSchema,
  updateTestCaseStatusSchema,
  listTestCasesQuerySchema,
  bulkDeleteTestCasesSchema,
  bulkUpdateTestCaseStatusSchema,
} from "./test-cases.schemas.js";

export function testCasesRouter({ prisma }) {
  const router = Router({ mergeParams: true });
  const service = createTestCasesService(prisma);

  // List test cases
  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const filters = listTestCasesQuerySchema.parse(req.query);

      res.json(await service.list(req.params.projectId, filters));
    }),
  );

  // Create a manual test case
  router.post(
    "/",
    asyncHandler(async (req, res) => {
      const input = createTestCaseSchema.parse(req.body);

      const testCase = await service.create(req.params.projectId, input);

      res.status(201).json(testCase);
    }),
  );

  // Bulk update execution status
  router.patch(
    "/bulk/status",
    asyncHandler(async (req, res) => {
      const { ids, runStatus } = bulkUpdateTestCaseStatusSchema.parse(req.body);

      const result = await service.bulkUpdateStatus(
        req.params.projectId,
        ids,
        runStatus,
      );

      res.json(result);
    }),
  );
  // Update individual execution status
  router.patch(
    "/:testCaseId/status",
    asyncHandler(async (req, res) => {
      const { runStatus } = updateTestCaseStatusSchema.parse(req.body);

      const testCase = await service.updateStatus(
        req.params.projectId,
        req.params.testCaseId,
        runStatus,
      );

      res.json(testCase);
    }),
  );

  // Bulk delete test cases
  router.delete(
    "/bulk",
    asyncHandler(async (req, res) => {
      const { ids } = bulkDeleteTestCasesSchema.parse(req.body);

      const result = await service.bulkRemove(req.params.projectId, ids);

      res.json(result);
    }),
  );
  // Get a single test case
  router.get(
    "/:testCaseId",
    asyncHandler(async (req, res) => {
      const testCase = await service.get(
        req.params.projectId,
        req.params.testCaseId,
      );

      res.json(testCase);
    }),
  );

  // Update test case details
  router.patch(
    "/:testCaseId",
    asyncHandler(async (req, res) => {
      const input = updateTestCaseSchema.parse(req.body);

      const testCase = await service.update(
        req.params.projectId,
        req.params.testCaseId,
        input,
      );

      res.json(testCase);
    }),
  );

  // Delete a test case
  router.delete(
    "/:testCaseId",
    asyncHandler(async (req, res) => {
      await service.remove(req.params.projectId, req.params.testCaseId);

      res.status(204).end();
    }),
  );

  return router;
}
