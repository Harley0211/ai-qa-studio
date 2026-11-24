import { z } from "zod";

export const ROLES = ["ADMIN", "MEMBER"];

export const email = z.string().trim().toLowerCase().email("Enter a valid email address").max(254);
export const name = z.string().trim().min(1, "Name is required").max(100);
// Not trimmed: spaces are allowed in passwords.
export const password = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(200, "Password must be at most 200 characters");

export const setupSchema = z.object({ name, email, password }).strict();

export const loginSchema = z
  .object({
    email,
    password: z.string().min(1, "Password is required").max(200),
    remember: z.boolean().default(true),
  })
  .strict();

// Anyone can create a tester account; it opens no project until an admin
// assigns one.
export const registerSchema = z
  .object({
    name,
    email,
    password,
    storedLocally: z.literal(true, {
      errorMap: () => ({ message: "Please confirm you understand your data is stored locally" }),
    }),
  })
  .strict();

const ids = z.array(z.string().min(1).max(64)).max(1000);

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required").max(200),
    newPassword: password,
  })
  .strict();

// Without a password the person is invited by email to choose their own.
export const createUserSchema = z
  .object({ name, email, password: password.optional(), role: z.enum(ROLES).default("MEMBER"), projectIds: ids.optional() })
  .strict();

export const acceptInvitationSchema = z.object({ password }).strict();

export const updateUserSchema = z
  .object({
    name: name.optional(),
    email: email.optional(),
    role: z.enum(ROLES).optional(),
    password: password.optional(),
    active: z.boolean().optional(),
    // The full list of projects this tester can open (replaces the old list).
    projectIds: ids.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: "Nothing to update" });

// The full list of testers assigned to one project.
export const projectMembersSchema = z.object({ userIds: ids }).strict();
