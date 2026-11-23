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
import { createGenerationService } from "../generation/generation.service.js";
import { documentsRouter } from "../documents/documents.routes.js";
import { testCasesRouter } from "../test-cases/test-cases.routes.js";
import { requireAdmin } from "../auth/auth.middleware.js";
import { bugReportsRouter } from "../bug-reports/bugReports.routes.js";
import { harFilesRouter } from "../har-files/harFiles.routes.js";
import { notFound } from "../../lib/errors.js";

export function projectsRouter({
  prisma,
  storageRoot,
  maxUploadBytes,
  n8nClient,
  publicBackendUrl,
  evidenceSigningSecret,
  evidenceUrlTtlSeconds,
  bugReports,
  fileStore,
  maxFileBytes,
}) {
  const router = Router();

  // Tools that live inside a project need the project to exist.
  const requireProject = asyncHandler(async (req, _res, next) => {
    const project = await prisma.project.findUnique({ where: { id: req.params.projectId }, select: { id: true } });
    if (!project) throw notFound("Project");
    next();
  });
  const service = createProjectsService(prisma, storageRoot);
  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const { q } = listProjectsQuerySchema.parse(req.query);
      res.json(await service.list({ q: q || undefined }));
    }),
  );

  // Only admins create, rename and delete projects; everyone can open them.
  router.post(
    "/",
    requireAdmin,
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
    requireAdmin,
    asyncHandler(async (req, res) => {
      const input = updateProjectSchema.parse(req.body ?? {});
      res.json(await service.update(req.params.projectId, input));
    }),
  );

  router.delete(
    "/:projectId",
    requireAdmin,
    asyncHandler(async (req, res) => {
      // The project's bug report and HAR folders go with it.
      const folders = [
        ...(await bugReports.foldersOfProject(req.params.projectId)),
        ...(await prisma.harFile.findMany({ where: { projectId: req.params.projectId }, select: { id: true } })).map(
          ({ id }) => `har-files/${id}`,
        ),
      ];
      await service.remove(req.params.projectId);
      await Promise.all(folders.map((folder) => fileStore.removeFolder(folder).catch(() => {})));
      res.status(204).end();
    }),
  );

  router.use("/:projectId/urls", urlsRouter({ prisma }));
  router.use(
    "/:projectId/evidence",
    evidenceRouter({
      prisma,
      storageRoot,
      maxUploadBytes,
      evidenceSigningSecret,
    }),
  );

  router.use(
    "/:projectId/generations",
    generationRouter({
      prisma,
      n8nClient,
      publicBackendUrl,
      evidenceSigningSecret,
      evidenceUrlTtlSeconds,
    }),
  );

  router.use(
    "/:projectId/documents",
    documentsRouter({
      prisma,
      generationService: createGenerationService({
        prisma,
        n8nClient,
        publicBackendUrl,
        evidenceSigningSecret,
        evidenceUrlTtlSeconds,
      }),
    }),
  );

  router.use("/:projectId/test-cases", testCasesRouter({ prisma }));

  router.use(
    "/:projectId/bug-reports",
    requireProject,
    bugReportsRouter({ service: bugReports, maxUploadBytes, maxFileBytes }),
  );
  router.use("/:projectId/har-files", requireProject, harFilesRouter({ prisma, store: fileStore, maxFileBytes }));

  return router;
}
