import { unlink } from "node:fs/promises";
import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { ApiError } from "../../lib/errors.js";
import { safeFileName } from "../../lib/fileStore.js";
import { diskUpload, sendStoredFile } from "../bug-reports/bugReports.routes.js";

// The HAR reader's library (under /api/projects/:projectId; a HAR is only
// visible in its project): every HAR opened in the reader is saved (the
// browser uploads a redacted copy) in its own folder, storage/har-files/<id>/.
// Shared with the team; the uploader or an admin can delete one, which deletes
// its folder too.

const count = z.number().int().min(0).max(10_000_000);
const summarySchema = z.object({
  total: count,
  failedCount: count,
  durationMs: z.number().min(0).max(1e12),
  totalBytes: z.number().min(0).max(1e13),
  capturedAt: z.string().max(40).nullable().optional().default(null),
  classCounts: z.object({ "2xx": count, "3xx": count, "4xx": count, "5xx": count, failed: count }),
  topErrors: z
    .array(z.object({ method: z.string().max(20), path: z.string().max(300), status: z.number().int().min(0).max(999) }))
    .max(5)
    .optional()
    .default([]),
});

const folderOf = (id) => `har-files/${id}`;
const view = (row) => ({
  id: row.id,
  name: row.name,
  size: row.size,
  summary: JSON.parse(row.summary),
  createdAt: row.createdAt,
  createdBy: row.createdBy ?? null,
});
const withCreator = { createdBy: { select: { id: true, name: true } } };

export function harFilesRouter({ prisma, store, maxFileBytes }) {
  const router = Router({ mergeParams: true });
  const upload = diskUpload(maxFileBytes);

  async function findOr404(projectId, id) {
    const row = await prisma.harFile.findFirst({ where: { id, projectId }, include: withCreator });
    if (!row) throw new ApiError(404, "NOT_FOUND", "HAR file not found");
    return row;
  }

  router.post(
    "/",
    (req, res, next) => upload.single("file")(req, res, next),
    asyncHandler(async (req, res) => {
      if (!req.file) throw new ApiError(400, "FILE_REQUIRED", "Choose a HAR file");
      try {
        let summary;
        try {
          summary = summarySchema.parse(JSON.parse(req.body?.summary ?? "null"));
        } catch {
          throw new ApiError(400, "VALIDATION_ERROR", "The HAR summary is missing or invalid");
        }
        const name = safeFileName(req.file.originalname, "network.har");
        const row = await prisma.harFile.create({
          data: {
            name,
            size: req.file.size,
            summary: JSON.stringify(summary),
            storageKey: "",
            createdById: req.auth.user.id,
            projectId: req.params.projectId,
          },
        });
        const storageKey = `${folderOf(row.id)}/${name}`;
        await store.moveIn(storageKey, req.file.path);
        const saved = await prisma.harFile.update({ where: { id: row.id }, data: { storageKey }, include: withCreator });
        res.status(201).json({ data: view(saved) });
      } finally {
        await unlink(req.file.path).catch(() => {});
      }
    }),
  );

  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const rows = await prisma.harFile.findMany({
        where: { projectId: req.params.projectId },
        orderBy: { createdAt: "desc" },
        include: withCreator,
      });
      res.json({ items: rows.map(view), total: rows.length });
    }),
  );

  router.get(
    "/:id",
    asyncHandler(async (req, res) => {
      res.json({ data: view(await findOr404(req.params.projectId, req.params.id)) });
    }),
  );

  router.get(
    "/:id/file",
    asyncHandler(async (req, res, next) => {
      const row = await findOr404(req.params.projectId, req.params.id);
      sendStoredFile(res, next, { file: { name: row.name, mimeType: "application/json" }, path: store.resolve(row.storageKey) }, true);
    }),
  );

  router.delete(
    "/:id",
    asyncHandler(async (req, res) => {
      const row = await findOr404(req.params.projectId, req.params.id);
      const user = req.auth.user;
      if (user.role !== "ADMIN" && row.createdById !== user.id) {
        throw new ApiError(403, "FORBIDDEN", "Only the person who saved this HAR file or an admin can delete it");
      }
      await prisma.harFile.delete({ where: { id: row.id } });
      await store.removeFolder(folderOf(row.id));
      res.status(204).end();
    }),
  );

  return router;
}
