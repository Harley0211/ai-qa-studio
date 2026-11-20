import { Router } from "express";
import multer from "multer";
import { asyncHandler } from "../../lib/asyncHandler.js";
import {
  createDocumentSchema,
  generateFromDocumentSchema,
  uploadDocumentFieldsSchema,
} from "./documents.schemas.js";
import { createDocumentsService } from "./documents.service.js";

// PDFs carry fonts and layout, so they are much larger than their text.
const MAX_DOCUMENT_UPLOAD_BYTES = 10 * 1024 * 1024;

export function documentsRouter({ prisma, generationService }) {
  const router = Router({ mergeParams: true });
  const service = createDocumentsService(prisma, generationService);
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_DOCUMENT_UPLOAD_BYTES, files: 1 },
  });

  router.get(
    "/",
    asyncHandler(async (req, res) => {
      res.json(await service.list(req.params.projectId));
    }),
  );

  // Pasted text.
  router.post(
    "/",
    asyncHandler(async (req, res) => {
      const input = createDocumentSchema.parse(req.body ?? {});
      res.status(201).json(await service.createFromText(req.params.projectId, input));
    }),
  );

  // Uploaded .txt / .md file.
  router.post(
    "/upload",
    (req, res, next) => {
      upload.single("file")(req, res, (error) => (error ? next(error) : next()));
    },
    asyncHandler(async (req, res) => {
      const { title } = uploadDocumentFieldsSchema.parse(req.body ?? {});
      res
        .status(201)
        .json(await service.createFromUpload(req.params.projectId, req.file, title));
    }),
  );

  router.get(
    "/:documentId",
    asyncHandler(async (req, res) => {
      res.json(await service.get(req.params.projectId, req.params.documentId));
    }),
  );

  router.delete(
    "/:documentId",
    asyncHandler(async (req, res) => {
      await service.remove(req.params.projectId, req.params.documentId);
      res.status(204).end();
    }),
  );

  router.post(
    "/:documentId/generations",
    asyncHandler(async (req, res) => {
      const input = generateFromDocumentSchema.parse(req.body ?? {});
      const result = await service.generate(
        req.params.projectId,
        req.params.documentId,
        input,
      );
      res.status(202).json({ data: result });
    }),
  );

  return router;
}
