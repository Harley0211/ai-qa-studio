import { Router } from "express";
import multer from "multer";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { ApiError } from "../../lib/errors.js";
import { detectImageType } from "../evidence/evidence.storage.js";
import { MAX_BUG_REPORT_IMAGES, bugReportInputSchema } from "./bugReports.schemas.js";

// POST /api/bug-reports       multipart: "details" (JSON) + up to 12 "images"
//                             (screenshots and frames taken from videos)
// GET  /api/bug-reports/:id   the job: PENDING, then SUCCEEDED with the report
//                             or FAILED with a reason
// Videos and HAR files stay in the browser: it sends video frames as images
// and the HAR's errors as text.
export function bugReportsRouter({ service, maxUploadBytes }) {
  const router = Router();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxUploadBytes, files: MAX_BUG_REPORT_IMAGES, fieldSize: 64 * 1024 },
  });

  router.post(
    "/",
    (req, res, next) => upload.array("images", MAX_BUG_REPORT_IMAGES)(req, res, next),
    asyncHandler(async (req, res) => {
      let details;
      try {
        details = JSON.parse(req.body?.details ?? "{}");
      } catch {
        throw new ApiError(400, "VALIDATION_ERROR", "Bug report details are not valid JSON");
      }
      const input = bugReportInputSchema.parse(details);

      const images = (req.files ?? []).map((file) => {
        if (!detectImageType(file.buffer)) {
          throw new ApiError(400, "INVALID_FILE_TYPE", `${file.originalname} is not a PNG, JPG or WEBP image`);
        }
        return file.buffer;
      });

      res.status(202).json({ data: service.start(req.auth.user.id, input, images) });
    }),
  );

  router.get(
    "/:id",
    asyncHandler(async (req, res) => {
      res.json({ data: service.get(req.auth.user.id, req.params.id) });
    }),
  );

  return router;
}
