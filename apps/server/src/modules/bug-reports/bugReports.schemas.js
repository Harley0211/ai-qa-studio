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
  // One per uploaded image, in order: a screenshot or a frame from a video.
  imageKinds: z.array(z.enum(["image", "frame"])).max(MAX_BUG_REPORT_IMAGES).optional().default([]),
  // The HAR's failed requests (already redacted by the browser), so the Jira
  // and Slack texts can show them whenever the report is opened.
  harErrors: z
    .array(
      z.object({
        file: z.string().max(255).optional().default(""),
        entry: z.object({
          method: z.string().max(20),
          url: z.string().max(2000),
          status: z.number().int().min(0).max(999),
          statusText: z.string().max(200).optional().default(""),
          networkError: z.string().max(300).optional().default(""),
          time: z.number().min(0).max(1e9),
          errorMessage: z.string().max(400).nullable().optional().default(null),
        }),
      }),
    )
    .max(100)
    .optional()
    .default([]),
});

export const BUG_REPORT_FILE_KINDS = ["image", "video", "har", "har-summary"];

export const bugReportUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(150).optional(),
    severity: z.enum(SEVERITIES).optional(),
    texts: z
      .object({
        jiraMarkdown: z.string().max(100_000),
        jiraWiki: z.string().max(100_000),
        slack: z.string().max(100_000),
      })
      .nullable()
      .optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "Nothing to change");

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
