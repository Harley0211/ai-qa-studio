import { Router } from "express";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { ApiError } from "../../lib/errors.js";
import { unauthenticated } from "./auth.middleware.js";
import { burnPasswordCheck, hashPassword, verifyPassword } from "./auth.passwords.js";
import { changePasswordSchema, loginSchema, setupSchema } from "./auth.schemas.js";
import { publicUser } from "./auth.sessions.js";

const MAX_FAILED_LOGINS = 10;
const FAILED_LOGIN_WINDOW_MS = 15 * 60 * 1000;

const invalidCredentials = () =>
  new ApiError(401, "INVALID_CREDENTIALS", "Email or password is incorrect");

// Slows down password guessing: after too many failures for one key (visitor and email),
// sign-in for that key is refused for a while (kept in memory).
function createLoginThrottle() {
  const failures = new Map();

  const current = (email) => {
    const entry = failures.get(email);
    if (entry && Date.now() - entry.since > FAILED_LOGIN_WINDOW_MS) {
      failures.delete(email);
      return null;
    }
    return entry ?? null;
  };

  return {
    check(email) {
      if ((current(email)?.count ?? 0) >= MAX_FAILED_LOGINS) {
        throw new ApiError(
          429,
          "TOO_MANY_ATTEMPTS",
          "Too many failed sign-in attempts. Try again in 15 minutes.",
        );
      }
    },
    fail(email) {
      const entry = current(email) ?? { count: 0, since: Date.now() };
      entry.count += 1;
      failures.set(email, entry);
    },
    succeed(email) {
      failures.delete(email);
    },
  };
}

export function authRouter({ prisma, sessions }) {
  const router = Router();
  const throttle = createLoginThrottle();

  // Who is signed in, and whether the first admin still has to be created.
  router.get(
    "/status",
    asyncHandler(async (req, res) => {
      const setupRequired = (await prisma.user.count()) === 0;
      res.json({
        setupRequired,
        user: req.auth?.user ? publicUser(req.auth.user) : null,
      });
    }),
  );

  // First run only: create the first admin and sign them in.
  router.post(
    "/setup",
    asyncHandler(async (req, res) => {
      const input = setupSchema.parse(req.body ?? {});
      const passwordHash = await hashPassword(input.password);

      const user = await prisma.$transaction(async (tx) => {
        if ((await tx.user.count()) > 0) {
          throw new ApiError(409, "SETUP_DONE", "The first admin has already been created");
        }
        return tx.user.create({
          data: { name: input.name, email: input.email, passwordHash, role: "ADMIN" },
        });
      });

      await sessions.create(req, res, user.id);
      res.status(201).json({ user: publicUser(user) });
    }),
  );

  router.post(
    "/login",
    asyncHandler(async (req, res) => {
      const { email, password } = loginSchema.parse(req.body ?? {});
      // Counted per visitor (IP) and email, so someone guessing from elsewhere
      // can't lock the real user out of their own account.
      const attemptKey = `${req.ip}|${email}`;
      throttle.check(attemptKey);

      const user = await prisma.user.findUnique({ where: { email } });
      const ok = user
        ? await verifyPassword(password, user.passwordHash)
        : await burnPasswordCheck(password);

      if (!ok) {
        throttle.fail(attemptKey);
        throw invalidCredentials();
      }

      throttle.succeed(attemptKey);
      await sessions.create(req, res, user.id);
      res.json({ user: publicUser(user) });
    }),
  );

  router.post(
    "/logout",
    asyncHandler(async (req, res) => {
      await sessions.destroy(req, res);
      res.status(204).end();
    }),
  );

  // Change your own password; other browsers you are signed in on are signed out.
  router.post(
    "/password",
    asyncHandler(async (req, res) => {
      if (!req.auth?.user) throw unauthenticated();
      const { currentPassword, newPassword } = changePasswordSchema.parse(req.body ?? {});
      const { user, sessionId } = req.auth;

      if (!(await verifyPassword(currentPassword, user.passwordHash))) {
        throw new ApiError(400, "WRONG_PASSWORD", "Current password is incorrect", {
          fields: { currentPassword: "Current password is incorrect" },
        });
      }

      await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: await hashPassword(newPassword) },
      });
      await sessions.destroyAllFor(user.id, { exceptSessionId: sessionId });

      res.status(204).end();
    }),
  );

  return router;
}
