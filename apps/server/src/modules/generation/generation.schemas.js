import { z } from "zod";

export const generateTestCasesSchema = z.object({
  message: z.string().trim().min(1).max(5000),
  evidenceIds: z.array(z.string().min(1)).max(20).default([]),
  generationFormat: z.enum(["OVERALL", "PER_STEP"]).default("OVERALL"),
});

const generatedTestCaseSchema = z
  .object({
    title: z.string().trim().min(1).max(300),
    description: z.string().max(5000).nullable().optional(),
    precondition: z.string().max(5000).nullable().optional(),
    steps: z.union([
      z.string().min(1),
      z.array(z.string().min(1)).min(1).max(50),
    ]),
    stepExpectedResults: z
      .array(z.string().trim().min(1).max(5000))
      .min(1)
      .max(50)
      .optional(),
    data: z.string().max(5000).nullable().optional(),
    expectedResult: z.string().trim().min(1).max(5000).optional(),
  })
  .strict()
  .superRefine((testCase, ctx) => {
    if (!testCase.expectedResult && !testCase.stepExpectedResults?.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["expectedResult"],
        message: "Provide an overall expected result or step expected results",
      });
    }
  });

export const listGenerationsQuerySchema = z
  .object({
    review: z.literal("pending"),
  })
  .strict();

export const acceptDraftsSchema = z
  .object({
    indexes: z
      .array(z.number().int().min(0))
      .min(1)
      .max(100)
      .refine((indexes) => new Set(indexes).size === indexes.length, {
        message: "Duplicate test case selections are not allowed",
      }),
  })
  .strict();

// n8n error messages can be long or empty; keep a short readable reason.
export const generationFailureSchema = z
  .object({
    error: z
      .string()
      .trim()
      .transform((value) => value.slice(0, 400) || "Unknown error")
      .default("Unknown error"),
  })
  .strict();

export const generationCallbackSchema = z
  .object({
    testCases: z.array(generatedTestCaseSchema).min(1).max(100),
    // A chat change's short reply ("Added 3 negative cases..."). Empty or
    // missing for normal generation runs.
    summary: z
      .string()
      .trim()
      .max(1000)
      .nullish()
      .transform((value) => value || undefined),
  })
  .strict();

// AI chat: what the user wants changed in a batch of generated test cases.
export const refineDraftsSchema = z
  .object({
    instruction: z.string().trim().min(1).max(1000),
  })
  .strict();
