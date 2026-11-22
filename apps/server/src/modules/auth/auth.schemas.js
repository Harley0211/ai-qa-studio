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
  })
  .strict();

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required").max(200),
    newPassword: password,
  })
  .strict();

export const createUserSchema = z
  .object({ name, email, password, role: z.enum(ROLES).default("MEMBER") })
  .strict();

export const updateUserSchema = z
  .object({
    name: name.optional(),
    role: z.enum(ROLES).optional(),
    password: password.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: "Nothing to update" });
