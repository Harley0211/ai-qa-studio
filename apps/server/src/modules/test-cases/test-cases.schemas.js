import { z } from "zod";

const runStatusSchema = z.enum(["Not Run", "Passed", "Failed", "Blocked"]);

const stepsSchema = z.union([
  z.string().trim().min(1),
  z.array(z.string().trim().min(1)).min(1).max(50),
]);

const testCaseFields = {
  title: z.string().trim().min(1).max(300),
  description: z.string().max(5000).nullable().optional(),
  precondition: z.string().max(5000).nullable().optional(),
  steps: stepsSchema,
  stepExpectedResults: z
    .array(z.string().trim().min(1).max(5000))
    .min(1)
    .max(50)
    .nullable()
    .optional(),
  data: z.string().max(5000).nullable().optional(),
  expectedResult: z.string().trim().min(1).max(5000),
};

export const createTestCaseSchema = z.object(testCaseFields).strict();

export const updateTestCaseSchema = z
  .object({
    title: testCaseFields.title.optional(),
    description: testCaseFields.description,
    precondition: testCaseFields.precondition,
    steps: testCaseFields.steps.optional(),
    data: testCaseFields.data,
    expectedResult: testCaseFields.expectedResult.optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

export const updateTestCaseStatusSchema = z
  .object({
    runStatus: runStatusSchema,
  })
  .strict();

export const listTestCasesQuerySchema = z
  .object({
    q: z.string().trim().max(300).optional(),
    runStatus: runStatusSchema.optional(),
  })
  .strict();
