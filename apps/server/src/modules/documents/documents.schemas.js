import { z } from "zod";

// Pasted text travels in a JSON body (100 kb limit), so keep it well below.
export const MAX_DOCUMENT_CHARS = 60000;
// Sections are generated in separate runs; cap one request so a single click
// can't queue a long list of slow local-model runs.
export const MAX_SECTIONS_PER_REQUEST = 10;

const title = z.string().trim().min(1, "Title is required").max(200);

export const createDocumentSchema = z
  .object({
    title,
    content: z
      .string()
      .trim()
      .min(1, "Document text is required")
      .max(MAX_DOCUMENT_CHARS, `Document text must be ${MAX_DOCUMENT_CHARS} characters or fewer`),
  })
  .strict();

export const uploadDocumentFieldsSchema = z
  .object({
    title: title.optional(),
  })
  .strict();

export const generateFromDocumentSchema = z
  .object({
    sectionIds: z
      .array(z.string().trim().min(1))
      .min(1, "Select at least one section")
      .max(MAX_SECTIONS_PER_REQUEST, `Select up to ${MAX_SECTIONS_PER_REQUEST} sections at a time`)
      .refine((ids) => new Set(ids).size === ids.length, {
        message: "Duplicate sections are not allowed",
      }),
    generationFormat: z.enum(["OVERALL", "PER_STEP"]).default("OVERALL"),
    focus: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
  })
  .strict();
