import { z } from 'zod';
import { httpUrl, optionalText } from './urls.schemas.js';

const name = z
  .string({ required_error: 'Name is required', invalid_type_error: 'Name must be text' })
  .trim()
  .min(1, 'Name is required')
  .max(120, 'Name must be 120 characters or fewer');

const description = optionalText('Description', 2000).nullable().optional();

export const createProjectSchema = z.object({
  name,
  description,
  url: httpUrl.optional(), // optional first application URL
});

export const updateProjectSchema = z
  .object({ name: name.optional(), description })
  .refine((o) => Object.keys(o).length > 0, { message: 'At least one field is required' });

export const listProjectsQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
});
