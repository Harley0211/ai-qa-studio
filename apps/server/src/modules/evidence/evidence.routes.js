import { Router } from "express";
import multer from "multer";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { ApiError } from "../../lib/errors.js";
import { createEvidenceService } from "./evidence.service.js";
import { verifyEvidenceSignature } from "./evidence.signing.js";

export function evidenceRouter({
  prisma,
  storageRoot,
  maxUploadBytes,
  evidenceSigningSecret,
}) {
  const router = Router({ mergeParams: true });
  const service = createEvidenceService(prisma, storageRoot);

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: maxUploadBytes,
      files: 1,
    },
  });

  router.get(
    "/",
    asyncHandler(async (req, res) => {
      res.json(await service.list(req.params.projectId));
    }),
  );

  router.post(
    "/",
    (req, res, next) => {
      upload.single("file")(req, res, (error) => {
        if (error) return next(error);
        next();
      });
    },
    asyncHandler(async (req, res) => {
      const evidence = await service.create(req.params.projectId, req.file);
      res.status(201).json(evidence);
    }),
  );

  // Existing evidence download endpoint.
  router.get(
    "/:evidenceId/file",
    asyncHandler(async (req, res, next) => {
      const { evidence, filePath } = await service.getFilePath(
        req.params.projectId,
        req.params.evidenceId,
      );

      res.set({
        "Content-Type": evidence.mimeType,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
        "Content-Disposition": "inline",
      });

      res.sendFile(filePath, (error) => {
        if (error && !res.headersSent) next(error);
      });
    }),
  );

  // Temporary signed download endpoint for n8n.
  router.get(
    "/:evidenceId/signed-file",
    asyncHandler(async (req, res, next) => {
      const { expires, signature } = req.query;

      const isValid = verifyEvidenceSignature({
        secret: evidenceSigningSecret,
        projectId: req.params.projectId,
        evidenceId: req.params.evidenceId,
        expires,
        signature,
      });

      if (!isValid) {
        throw new ApiError(
          401,
          "INVALID_EVIDENCE_SIGNATURE",
          "The evidence URL is invalid or expired",
        );
      }

      const { evidence, filePath } = await service.getFilePath(
        req.params.projectId,
        req.params.evidenceId,
      );

      res.set({
        "Content-Type": evidence.mimeType,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
        "Content-Disposition": "inline",
      });

      res.sendFile(filePath, (error) => {
        if (error && !res.headersSent) next(error);
      });
    }),
  );

  router.delete(
    "/:evidenceId",
    asyncHandler(async (req, res) => {
      await service.remove(req.params.projectId, req.params.evidenceId);
      res.status(204).end();
    }),
  );

  return router;
}
