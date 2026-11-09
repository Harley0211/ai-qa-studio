import { z } from "zod";

export const generateTestCasesSchema = z.object({
  message: z.string().trim().min(1).max(5000),
  evidenceIds: z.array(z.string().min(1)).max(20).default([]),
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
    data: z.string().max(5000).nullable().optional(),
    expectedResult: z.string().trim().min(1).max(5000),
  })
  .strict();

export const generationCallbackSchema = z
  .object({
    testCases: z.array(generatedTestCaseSchema).min(1).max(100),
  })
  .strict();
