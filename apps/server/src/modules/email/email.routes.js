import { Router } from "express";
import { asyncHandler } from "../../lib/asyncHandler.js";

// Admin → Emails: what the app sent, and retrying one that failed.
export function emailsRouter({ emails }) {
  const router = Router();

  router.get(
    "/",
    asyncHandler(async (_req, res) => {
      res.json(await emails.list());
    }),
  );

  router.post(
    "/:emailId/retry",
    asyncHandler(async (req, res) => {
      res.json({ data: await emails.retry(req.params.emailId) });
    }),
  );

  return router;
}

// The app's address for links in emails: PUBLIC_APP_URL if set, otherwise
// the address the admin (or new user) is using right now, e.g. the public
// tunnel link. Hosts are already limited to known ones by hostGuard.
export function appUrlFor(req, publicAppUrl) {
  if (publicAppUrl) return publicAppUrl.replace(/\/+$/, "");
  return `${req.protocol}://${req.get("host")}`;
}
