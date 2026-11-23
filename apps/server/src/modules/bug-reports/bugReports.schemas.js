import { z } from "zod";

export const MAX_BUG_REPORT_IMAGES = 12;
export const SEVERITIES = ["Blocker", "Critical", "Major", "Minor", "Trivial"];

const text = (max) => z.string().trim().max(max).optional().default("");

// What the person tells us about the bug, plus facts the browser worked out
// from the attachments (HAR errors, which images are video frames).
export const bugReportInputSchema = z.object({
  description: z.string().trim().min(10, "Describe the bug in at least 10 characters").max(5000),
  steps: text(3000),
  expected: text(1000),
  environment: z
    .object({
      url: text(500),
      browser: text(200),
      device: text(200),
      build: text(200),
    })
    .optional()
    .default({}),
  harFacts: text(12000),
  imageNotes: z.array(z.string().trim().max(200)).max(MAX_BUG_REPORT_IMAGES).optional().default([]),
  attachments: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(255),
        kind: z.enum(["image", "video", "har"]),
      }),
    )
    .max(40)
    .optional()
    .default([]),
});

// The JSON shape the model must return (Ollama structured output).
export const modelOutputSchema = {
  type: "object",
  properties: {
    title: { type: "string" },
    summary: { type: "string" },
    stepsToReproduce: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 15 },
    expectedResult: { type: "string" },
    actualResult: { type: "string" },
    rootCause: { type: "string" },
    severity: { type: "string", enum: SEVERITIES },
    affectedArea: { type: "string" },
  },
  required: [
    "title",
    "summary",
    "stepsToReproduce",
    "expectedResult",
    "actualResult",
    "rootCause",
    "severity",
    "affectedArea",
  ],
};
