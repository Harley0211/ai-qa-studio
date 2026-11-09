import { Router } from "express";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { createProjectsService } from "./projects.service.js";
import {
  createProjectSchema,
  listProjectsQuerySchema,
  updateProjectSchema,
} from "./projects.schemas.js";
import { urlsRouter } from "./urls.routes.js";
import { evidenceRouter } from "../evidence/evidence.routes.js";
import { generationRouter } from "../generation/generation.routes.js";

export function projectsRouter({
  prisma,
  storageRoot,
  maxUploadBytes,
  n8nClient,
  publicBackendUrl,
}) {
  const router = Router();
  const service = createProjectsService(prisma, storageRoot);
  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const { q } = listProjectsQuerySchema.parse(req.query);
      res.json(await service.list({ q: q || undefined }));
    }),
  );

  router.post(
    "/",
    asyncHandler(async (req, res) => {
      const input = createProjectSchema.parse(req.body ?? {});
      res.status(201).json(await service.create(input));
    }),
  );

  router.get(
    "/:projectId",
    asyncHandler(async (req, res) => {
      res.json(await service.get(req.params.projectId));
    }),
  );

  router.patch(
    "/:projectId",
    asyncHandler(async (req, res) => {
      const input = updateProjectSchema.parse(req.body ?? {});
      res.json(await service.update(req.params.projectId, input));
    }),
  );

  router.delete(
    "/:projectId",
    asyncHandler(async (req, res) => {
      await service.remove(req.params.projectId);
      res.status(204).end();
    }),
  );

  router.use("/:projectId/urls", urlsRouter({ prisma }));
  router.use(
    "/:projectId/evidence",
    evidenceRouter({ prisma, storageRoot, maxUploadBytes }),
  );

  router.use(
    "/:projectId/generations",
    generationRouter({ prisma, n8nClient, publicBackendUrl }),
  );

  return router;
}
