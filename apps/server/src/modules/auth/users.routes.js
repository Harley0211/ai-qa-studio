import { Router } from "express";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { ApiError } from "../../lib/errors.js";
import { hashPassword } from "./auth.passwords.js";
import { createUserSchema, updateUserSchema } from "./auth.schemas.js";
import { publicUser } from "./auth.sessions.js";

const userNotFound = () => new ApiError(404, "NOT_FOUND", "User not found");
const emailTaken = () =>
  new ApiError(409, "EMAIL_TAKEN", "A user with this email already exists", {
    fields: { email: "A user with this email already exists" },
  });
const lastAdmin = () =>
  new ApiError(409, "LAST_ADMIN", "The app needs at least one admin");

// Admin-only user management (mounted behind requireAdmin).
export function usersRouter({ prisma, sessions }) {
  const router = Router();

  async function findUser(id) {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) throw userNotFound();
    return user;
  }

  const otherAdmins = (id) =>
    prisma.user.count({ where: { role: "ADMIN", id: { not: id } } });

  router.get(
    "/",
    asyncHandler(async (_req, res) => {
      const users = await prisma.user.findMany({ orderBy: { createdAt: "asc" } });
      res.json({ items: users.map(publicUser), total: users.length });
    }),
  );

  router.post(
    "/",
    asyncHandler(async (req, res) => {
      const input = createUserSchema.parse(req.body ?? {});

      if (await prisma.user.findUnique({ where: { email: input.email } })) throw emailTaken();

      const user = await prisma.user.create({
        data: {
          name: input.name,
          email: input.email,
          role: input.role,
          passwordHash: await hashPassword(input.password),
        },
      });

      res.status(201).json({ data: publicUser(user) });
    }),
  );

  // Rename, change role, or set a new password (which signs the user out).
  router.patch(
    "/:userId",
    asyncHandler(async (req, res) => {
      const input = updateUserSchema.parse(req.body ?? {});
      const user = await findUser(req.params.userId);

      if (input.role === "MEMBER" && user.role === "ADMIN" && (await otherAdmins(user.id)) === 0) {
        throw lastAdmin();
      }

      const updated = await prisma.user.update({
        where: { id: user.id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.role !== undefined ? { role: input.role } : {}),
          ...(input.password !== undefined
            ? { passwordHash: await hashPassword(input.password) }
            : {}),
        },
      });

      if (input.password !== undefined) {
        // Keep the admin's own current session when they reset their own password.
        const exceptSessionId = user.id === req.auth.user.id ? req.auth.sessionId : undefined;
        await sessions.destroyAllFor(user.id, { exceptSessionId });
      }

      res.json({ data: publicUser(updated) });
    }),
  );

  router.delete(
    "/:userId",
    asyncHandler(async (req, res) => {
      const user = await findUser(req.params.userId);

      if (user.id === req.auth.user.id) {
        throw new ApiError(400, "CANNOT_REMOVE_SELF", "You can't remove your own account");
      }
      if (user.role === "ADMIN" && (await otherAdmins(user.id)) === 0) throw lastAdmin();

      // Sessions are removed with the user (onDelete: Cascade).
      await prisma.user.delete({ where: { id: user.id } });
      res.status(204).end();
    }),
  );

  return router;
}
