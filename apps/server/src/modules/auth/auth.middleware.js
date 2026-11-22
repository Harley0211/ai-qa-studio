import { ApiError } from "../../lib/errors.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// Attaches the signed-in user (if any) to req.auth = { user, sessionId }.
export function loadSession(sessions) {
  return async (req, _res, next) => {
    try {
      req.auth = await sessions.findUser(req);
      next();
    } catch (err) {
      next(err);
    }
  };
}

export const unauthenticated = () =>
  new ApiError(401, "UNAUTHENTICATED", "Please sign in to continue");

// Requires a signed-in user, except for paths matched by `publicPaths`
// (relative to where the middleware is mounted).
export function requireAuth({ publicPaths = [] } = {}) {
  return (req, _res, next) => {
    if (req.auth?.user) return next();
    if (publicPaths.some((pattern) => pattern.test(req.path))) return next();
    next(unauthenticated());
  };
}

export function requireAdmin(req, _res, next) {
  if (!req.auth?.user) return next(unauthenticated());
  if (req.auth.user.role !== "ADMIN") {
    return next(new ApiError(403, "FORBIDDEN", "Only an admin can do this"));
  }
  next();
}

// Extra protection for cookie-based sign-in: a browser request that changes
// something must come from one of the app's own origins. (Requests without an
// Origin header, such as n8n's callbacks, are not browser requests.)
export function originGuard(allowedOrigins) {
  const allowed = new Set(allowedOrigins);
  return (req, _res, next) => {
    const origin = req.headers.origin;
    if (SAFE_METHODS.has(req.method) || !origin || allowed.has(origin)) return next();
    next(new ApiError(403, "FORBIDDEN_ORIGIN", "Requests must come from the app itself"));
  };
}
