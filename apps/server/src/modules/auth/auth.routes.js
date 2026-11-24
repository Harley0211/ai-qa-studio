import { Router } from "express";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { ApiError } from "../../lib/errors.js";
import { unauthenticated } from "./auth.middleware.js";
import { burnPasswordCheck, hashPassword, verifyPassword } from "./auth.passwords.js";
import { createNotifier, hashInviteToken } from "../email/notifications.js";
import {
  acceptInvitationSchema,
  changePasswordSchema,
  loginSchema,
  registerSchema,
  setupSchema,
} from "./auth.schemas.js";
import { publicUser } from "./auth.sessions.js";

const MAX_FAILED_LOGINS = 10;
const FAILED_LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_SIGNUPS_PER_HOUR = 5;

const invalidCredentials = () =>
  new ApiError(401, "INVALID_CREDENTIALS", "Email or password is incorrect");

export const emailTaken = () =>
  new ApiError(409, "EMAIL_TAKEN", "A user with this email already exists", {
    fields: { email: "A user with this email already exists" },
  });

// At most a few new accounts per visitor (IP) per hour, kept in memory.
function createSignupLimit() {
  const recent = new Map();
  return {
    check(key) {
      const now = Date.now();
      const times = (recent.get(key) ?? []).filter((t) => now - t < 60 * 60 * 1000);
      if (times.length >= MAX_SIGNUPS_PER_HOUR) {
        throw new ApiError(429, "TOO_MANY_SIGNUPS", "Too many new accounts from here. Try again later.");
      }
      recent.set(key, [...times, now]);
    },
  };
}

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

const invalidInvitation = () =>
  new ApiError(
    404,
    "INVITATION_INVALID",
    "This invitation link is invalid, already used or expired. Ask an admin to send a new one.",
  );

export function authRouter({ prisma, sessions, allowSignup = true, mail }) {
  const router = Router();
  const throttle = createLoginThrottle();
  const signups = createSignupLimit();
  const notify = mail ? createNotifier({ prisma, mail }) : null;

  // The person an invitation link belongs to, if the link still works.
  async function invitedUser(token) {
    if (!/^[a-f0-9]{64}$/.test(token)) throw invalidInvitation();
    const user = await prisma.user.findUnique({ where: { inviteTokenHash: hashInviteToken(token) } });
    if (!user || !user.active || !user.inviteExpiresAt || user.inviteExpiresAt <= new Date()) throw invalidInvitation();
    return user;
  }

  // Opening an invitation link: who it is for.
  router.get(
    "/invitations/:token",
    asyncHandler(async (req, res) => {
      const user = await invitedUser(req.params.token);
      res.json({ name: user.name, email: user.email, role: user.role });
    }),
  );

  // Accepting it: choose a password, then you're signed in. The link stops
  // working.
  router.post(
    "/invitations/:token/accept",
    asyncHandler(async (req, res) => {
      const { password } = acceptInvitationSchema.parse(req.body ?? {});
      const user = await invitedUser(req.params.token);
      const updated = await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: await hashPassword(password), inviteTokenHash: null, inviteExpiresAt: null },
      });
      await sessions.destroyAllFor(user.id);
      await sessions.create(req, res, user.id, { remember: false });
      res.json({ user: publicUser({ ...updated, lastLoginAt: new Date() }) });
    }),
  );

  // Who is signed in, whether the first admin still has to be created, and
  // whether visitors can create their own (tester) account.
  router.get(
    "/status",
    asyncHandler(async (req, res) => {
      const setupRequired = (await prisma.user.count()) === 0;
      res.json({
        setupRequired,
        signupAllowed: allowSignup && !setupRequired,
        user: req.auth?.user ? publicUser(req.auth.user) : null,
        ...(req.auth?.user ? { remember: req.auth.remember } : {}),
      });
    }),
  );

  // Create your own account: always a tester with no projects. An admin
  // assigns projects afterwards.
  router.post(
    "/register",
    asyncHandler(async (req, res) => {
      if (!allowSignup) {
        throw new ApiError(403, "SIGNUP_CLOSED", "New accounts are created by an admin");
      }
      if ((await prisma.user.count()) === 0) {
        throw new ApiError(409, "SETUP_REQUIRED", "Create the first admin account first");
      }
      const input = registerSchema.parse(req.body ?? {});
      if (await prisma.user.findUnique({ where: { email: input.email } })) throw emailTaken();
      signups.check(req.ip);

      const user = await prisma.user.create({
        data: {
          name: input.name,
          email: input.email,
          role: "MEMBER",
          passwordHash: await hashPassword(input.password),
        },
      });

      await sessions.create(req, res, user.id, { remember: false });
      const emails = notify ? [await notify.welcome(req, user)] : [];
      res.status(201).json({ user: publicUser({ ...user, lastLoginAt: new Date() }), emails });
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
      res.status(201).json({ user: publicUser({ ...user, lastLoginAt: new Date() }) });
    }),
  );

  router.post(
    "/login",
    asyncHandler(async (req, res) => {
      const { email, password, remember } = loginSchema.parse(req.body ?? {});
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
      // Only said after the right password, so it doesn't reveal accounts.
      if (!user.active) {
        throw new ApiError(403, "ACCOUNT_DISABLED", "This account is disabled. Ask an admin to enable it.");
      }
      await sessions.create(req, res, user.id, { remember });
      res.json({ user: publicUser({ ...user, lastLoginAt: new Date() }) });
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
