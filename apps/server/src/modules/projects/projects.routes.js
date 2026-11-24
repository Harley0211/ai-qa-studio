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
import { ApiError, notFound } from "../../lib/errors.js";
import { projectMembersSchema } from "../auth/auth.schemas.js";

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

  // Every request inside a project (the project itself and all its tools)
  // checks that a tester is assigned to it, so removing access takes effect
  // on their very next request. Admins open every project. Requests without
  // a sign-in only get here for n8n's callbacks and signed downloads, which
  // carry their own one-time tokens.
  router.use(
    "/:projectId",
    asyncHandler(async (req, _res, next) => {
      const user = req.auth?.user;
      if (!user || (await service.canOpen(user, req.params.projectId))) return next();
      if (!(await service.exists(req.params.projectId))) throw notFound("Project");
      throw new ApiError(
        403,
        "NO_PROJECT_ACCESS",
        "You don't have access to this project. Ask an admin to assign it to you.",
      );
    }),
  );

  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const { q } = listProjectsQuerySchema.parse(req.query);
      res.json(await service.list(req.auth.user, { q: q || undefined }));
    }),
  );

  // Admins: which testers are assigned to a project, and changing that list.
  router.get(
    "/:projectId/members",
    requireAdmin,
    asyncHandler(async (req, res) => {
      if (!(await service.exists(req.params.projectId))) throw notFound("Project");
      res.json({ userIds: await service.memberIds(req.params.projectId) });
    }),
  );

  router.put(
    "/:projectId/members",
    requireAdmin,
    asyncHandler(async (req, res) => {
      const { userIds } = projectMembersSchema.parse(req.body ?? {});
      res.json({ userIds: await service.setMembers(req.params.projectId, userIds) });
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
