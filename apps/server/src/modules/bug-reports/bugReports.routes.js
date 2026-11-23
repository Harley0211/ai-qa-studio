import { mkdirSync } from "node:fs";
import { unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Router } from "express";
import multer from "multer";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { ApiError } from "../../lib/errors.js";
import { detectImageType } from "../evidence/evidence.storage.js";
import {
  BUG_REPORT_FILE_KINDS,
  MAX_BUG_REPORT_IMAGES,
  bugReportInputSchema,
  bugReportUpdateSchema,
} from "./bugReports.schemas.js";

export const UPLOAD_TEMP_DIR = path.join(os.tmpdir(), "aqs-uploads");

// Uploads of large files (videos, HAR copies) go to a temp file first.
export function diskUpload(maxFileBytes) {
  mkdirSync(UPLOAD_TEMP_DIR, { recursive: true });
  return multer({
    storage: multer.diskStorage({ destination: UPLOAD_TEMP_DIR }),
    limits: { fileSize: maxFileBytes, files: 1 },
  });
}

export function sendStoredFile(res, next, { file, path: filePath }, download) {
  res.set({
    "Content-Type": file.mimeType,
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "private, no-store",
  });
  res.attachment(file.name);
  if (!download && file.mimeType.startsWith("image/")) res.set("Content-Disposition", "inline");
  res.sendFile(filePath, (error) => {
    if (error && !res.headersSent) next(error);
  });
}

// POST   /api/bug-reports                    start one: "details" (JSON) + up to
//                                           12 "images" the AI looks at
// POST   /api/bug-reports/:id/files          add a file to its folder ("kind", "file")
// GET    /api/bug-reports                    all reports, newest first
// GET    /api/bug-reports/:id                one report with its files
// PATCH  /api/bug-reports/:id                save title, severity, edited texts
// POST   /api/bug-reports/:id/retry          run the AI again after a failure
// DELETE /api/bug-reports/:id                delete the report and its folder
// GET    /api/bug-reports/:id/files/:fileId  download one file
export function bugReportsRouter({ service, maxUploadBytes, maxFileBytes }) {
  const router = Router();
  const imageUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxUploadBytes, files: MAX_BUG_REPORT_IMAGES, fieldSize: 512 * 1024 },
  });
  const fileUpload = diskUpload(maxFileBytes);

  router.post(
    "/",
    (req, res, next) => imageUpload.array("images", MAX_BUG_REPORT_IMAGES)(req, res, next),
    asyncHandler(async (req, res) => {
      let details;
      try {
        details = JSON.parse(req.body?.details ?? "{}");
      } catch {
        throw new ApiError(400, "VALIDATION_ERROR", "Bug report details are not valid JSON");
      }
      const input = bugReportInputSchema.parse(details);

      const images = (req.files ?? []).map((file, index) => {
        const type = detectImageType(file.buffer);
        if (!type) {
          throw new ApiError(400, "INVALID_FILE_TYPE", `${file.originalname} is not a PNG, JPG or WEBP image`);
        }
        return {
          buffer: file.buffer,
          name: file.originalname,
          mimeType: type.mimeType,
          kind: input.imageKinds[index] ?? "image",
        };
      });

      res.status(202).json({ data: await service.create(req.auth.user, input, images) });
    }),
  );

  router.get(
    "/",
    asyncHandler(async (_req, res) => {
      res.json(await service.list());
    }),
  );

  router.get(
    "/:id",
    asyncHandler(async (req, res) => {
      res.json({ data: await service.get(req.params.id) });
    }),
  );

  router.patch(
    "/:id",
    asyncHandler(async (req, res) => {
      const changes = bugReportUpdateSchema.parse(req.body ?? {});
      res.json({ data: await service.update(req.auth.user, req.params.id, changes) });
    }),
  );

  router.post(
    "/:id/retry",
    asyncHandler(async (req, res) => {
      res.status(202).json({ data: await service.retry(req.auth.user, req.params.id) });
    }),
  );

  router.delete(
    "/:id",
    asyncHandler(async (req, res) => {
      await service.remove(req.auth.user, req.params.id);
      res.status(204).end();
    }),
  );

  router.post(
    "/:id/files",
    (req, res, next) => fileUpload.single("file")(req, res, next),
    asyncHandler(async (req, res) => {
      const kind = req.body?.kind;
      if (!req.file) throw new ApiError(400, "FILE_REQUIRED", "Choose a file to add");
      try {
        if (!BUG_REPORT_FILE_KINDS.includes(kind)) {
          throw new ApiError(400, "VALIDATION_ERROR", `kind must be one of ${BUG_REPORT_FILE_KINDS.join(", ")}`);
        }
        res.status(201).json({ data: await service.addFile(req.auth.user, req.params.id, req.file, kind) });
      } finally {
        // Moved into the folder on success; otherwise no longer needed.
        await unlink(req.file.path).catch(() => {});
      }
    }),
  );

  router.get(
    "/:id/files/:fileId",
    asyncHandler(async (req, res, next) => {
      sendStoredFile(res, next, await service.file(req.params.id, req.params.fileId), req.query.download === "1");
    }),
  );

  return router;
}
