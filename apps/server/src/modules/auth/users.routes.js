import { randomBytes } from "node:crypto";
import { Router } from "express";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { ApiError } from "../../lib/errors.js";
import { createNotifier, newInvitation } from "../email/notifications.js";
import { hashPassword } from "./auth.passwords.js";
import { emailTaken } from "./auth.routes.js";
import { createUserSchema, updateUserSchema } from "./auth.schemas.js";
import { publicUser } from "./auth.sessions.js";

const userNotFound = () => new ApiError(404, "NOT_FOUND", "User not found");
const lastAdmin = () =>
  new ApiError(409, "LAST_ADMIN", "The app needs at least one active admin");
const notYourself = (what) =>
  new ApiError(400, "CANNOT_CHANGE_SELF", `You can't ${what} your own account`);

const withProjects = { projects: { select: { projectId: true } } };

// A user for the admin screens: with the projects they are assigned to and
// the state of their invitation.
const adminUser = ({ projects, inviteTokenHash, inviteExpiresAt, ...user }) => ({
  ...publicUser(user),
  projectIds: projects.map((p) => p.projectId),
  invitation: user.lastLoginAt
    ? null
    : !inviteTokenHash
      ? "NONE"
      : inviteExpiresAt > new Date()
        ? "PENDING"
        : "EXPIRED",
  inviteExpiresAt: user.lastLoginAt ? null : inviteExpiresAt ?? null,
});

// Admin-only user management (mounted behind requireAdmin). Changes that
// affect a person send them an email (see email/notifications.js); the
// response lists those emails and whether they went out.
export function usersRouter({ prisma, sessions, mail }) {
  const router = Router();
  const notify = createNotifier({ prisma, mail });

  async function findUser(id) {
    const user = await prisma.user.findUnique({ where: { id }, include: withProjects });
    if (!user) throw userNotFound();
    return user;
  }

  const otherActiveAdmins = (id) =>
    prisma.user.count({ where: { role: "ADMIN", active: true, id: { not: id } } });

  // Only projects that exist are kept.
  async function existingProjectIds(ids) {
    if (!ids?.length) return [];
    const rows = await prisma.project.findMany({ where: { id: { in: [...new Set(ids)] } }, select: { id: true } });
    return rows.map((row) => row.id);
  }

  router.get(
    "/",
    asyncHandler(async (_req, res) => {
      const [users, projectTotal] = await Promise.all([
        prisma.user.findMany({ orderBy: { createdAt: "asc" }, include: withProjects }),
        prisma.project.count(),
      ]);
      res.json({ items: users.map(adminUser), total: users.length, projectTotal });
    }),
  );

  router.get(
    "/:userId",
    asyncHandler(async (req, res) => {
      res.json({ data: adminUser(await findUser(req.params.userId)) });
    }),
  );

  // Without a password the person is invited by email and chooses their own
  // password from the link. (With a password, nothing is emailed.)
  router.post(
    "/",
    asyncHandler(async (req, res) => {
      const input = createUserSchema.parse(req.body ?? {});

      if (await prisma.user.findUnique({ where: { email: input.email } })) throw emailTaken();
      const projectIds = input.role === "ADMIN" ? [] : await existingProjectIds(input.projectIds);
      const invitation = input.password ? null : newInvitation();

      const user = await prisma.user.create({
        data: {
          name: input.name,
          email: input.email,
          role: input.role,
          // Invited: an unknown random password until they choose one.
          passwordHash: await hashPassword(input.password ?? randomBytes(32).toString("hex")),
          ...(invitation ? { inviteTokenHash: invitation.inviteTokenHash, inviteExpiresAt: invitation.inviteExpiresAt } : {}),
          projects: { create: projectIds.map((projectId) => ({ projectId })) },
        },
        include: withProjects,
      });

      const emails = invitation ? [await notify.invitation(req, user, invitation.token, req.auth.user)] : [];
      res.status(201).json({ data: adminUser(user), emails });
    }),
  );

  // Send a new invitation link (the old one stops working).
  router.post(
    "/:userId/invitation",
    asyncHandler(async (req, res) => {
      const user = await findUser(req.params.userId);
      if (user.lastLoginAt) {
        throw new ApiError(409, "ALREADY_JOINED", `${user.name} has already signed in. Reset their password instead.`);
      }
      if (!user.active) throw new ApiError(409, "ACCOUNT_DISABLED", "Enable the account before inviting them again");

      const invitation = newInvitation();
      const updated = await prisma.user.update({
        where: { id: user.id },
        data: { inviteTokenHash: invitation.inviteTokenHash, inviteExpiresAt: invitation.inviteExpiresAt },
        include: withProjects,
      });
      const emails = [await notify.invitation(req, updated, invitation.token, req.auth.user)];
      res.json({ data: adminUser(updated), emails });
    }),
  );

  // Profile, role, active, password and project access. A new password or a
  // disabled account signs the user out; project changes apply on their next
  // request (the server checks access on every project request).
  router.patch(
    "/:userId",
    asyncHandler(async (req, res) => {
      const input = updateUserSchema.parse(req.body ?? {});
      const user = await findUser(req.params.userId);
      const isSelf = user.id === req.auth.user.id;

      if (isSelf && input.active === false) throw notYourself("disable");
      if (isSelf && input.role === "MEMBER" && user.role === "ADMIN") throw notYourself("demote");

      const losesAdmin =
        user.role === "ADMIN" && user.active && (input.role === "MEMBER" || input.active === false);
      if (losesAdmin && (await otherActiveAdmins(user.id)) === 0) throw lastAdmin();

      if (input.email !== undefined && input.email !== user.email) {
        if (await prisma.user.findUnique({ where: { email: input.email } })) throw emailTaken();
      }

      const projectIds = input.projectIds === undefined ? undefined : await existingProjectIds(input.projectIds);

      const updated = await prisma.$transaction(async (tx) => {
        if (projectIds !== undefined) {
          await tx.projectMember.deleteMany({ where: { userId: user.id } });
          if (projectIds.length > 0) {
            await tx.projectMember.createMany({ data: projectIds.map((projectId) => ({ userId: user.id, projectId })) });
          }
        }
        return tx.user.update({
          where: { id: user.id },
          data: {
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.email !== undefined ? { email: input.email } : {}),
            ...(input.role !== undefined ? { role: input.role } : {}),
            ...(input.active !== undefined ? { active: input.active } : {}),
            ...(input.password !== undefined ? { passwordHash: await hashPassword(input.password) } : {}),
          },
          include: withProjects,
        });
      });

      if (input.password !== undefined || input.active === false) {
        // Keep the admin's own current session when they reset their own password.
        const exceptSessionId = isSelf ? req.auth.sessionId : undefined;
        await sessions.destroyAllFor(user.id, { exceptSessionId });
      }

      // Emails about what changed for them.
      const byName = req.auth.user.name;
      const emails = [];
      if (input.active !== undefined && input.active !== user.active && user.lastLoginAt) {
        emails.push(await notify.accountState(req, updated, input.active, byName));
      }
      if (projectIds !== undefined) {
        emails.push(
          ...(await notify.projectChanges(req, updated, user.projects.map((p) => p.projectId), projectIds, byName)),
        );
      }

      res.json({ data: adminUser(updated), emails });
    }),
  );

  router.delete(
    "/:userId",
    asyncHandler(async (req, res) => {
      const user = await findUser(req.params.userId);

      if (user.id === req.auth.user.id) {
        throw new ApiError(400, "CANNOT_REMOVE_SELF", "You can't remove your own account");
      }
      if (user.role === "ADMIN" && user.active && (await otherActiveAdmins(user.id)) === 0) throw lastAdmin();

      // Sessions and project assignments are removed with the user (cascade).
      await prisma.user.delete({ where: { id: user.id } });
      res.json({ emails: [await notify.accountRemoved(user, req.auth.user.name)] });
    }),
  );

  return router;
}
