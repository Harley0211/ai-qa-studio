import { randomUUID } from "node:crypto";
import { ApiError } from "../../lib/errors.js";
import { SEVERITIES, modelOutputSchema } from "./bugReports.schemas.js";

// Bug report generation runs in the background (the local model can take a
// few minutes, longer than a tunnel lets one request stay open); the browser
// polls for the result. Jobs live in memory for an hour: the finished report
// is downloaded by the person, not stored.
const JOB_TTL_MS = 60 * 60 * 1000;

const clip = (value, max) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

export function buildPrompt(input) {
  const { environment = {} } = input;
  const env = [
    environment.url && `Page / URL: ${environment.url}`,
    environment.browser && `Browser: ${environment.browser}`,
    environment.device && `Device / OS: ${environment.device}`,
    environment.build && `Build / version: ${environment.build}`,
  ].filter(Boolean);

  const sections = [
    "You are a senior QA engineer writing a bug report for developers.",
    "Use ONLY the information below and the attached images. Do not invent features, screens, error messages or status codes.",
    "",
    "WHAT THE TESTER SAW:",
    input.description,
  ];
  if (input.steps) sections.push("", "STEPS THE TESTER TOOK (keep them, you may clean up wording):", input.steps);
  if (input.expected) sections.push("", "WHAT THE TESTER EXPECTED:", input.expected);
  if (env.length) sections.push("", "ENVIRONMENT:", ...env);
  if (input.imageNotes?.length) {
    sections.push("", "ATTACHED IMAGES, in order:", ...input.imageNotes.map((note, i) => `${i + 1}. ${note}`));
  }
  if (input.harFacts) {
    sections.push(
      "",
      "NETWORK EVIDENCE FROM THE HAR FILE (exact, computed from the file):",
      input.harFacts,
    );
  }

  sections.push(
    "",
    "Write the bug report as JSON with these fields:",
    '- title: one line under 100 characters, in the form "[Area] What goes wrong when doing what". No "Bug:" prefix.',
    "- summary: 1-3 sentences a developer can act on.",
    "- stepsToReproduce: numbered-style short steps, starting from where the tester was.",
    "- expectedResult and actualResult: one or two sentences each.",
    "- rootCause: the most likely technical cause. If the network evidence shows failed requests, name the exact request, status code and error message and say whether it points to the backend (5xx), the request or permissions (4xx), or connectivity (no response). If the evidence is not enough, say so and give the most likely hypothesis and what to check next.",
    `- severity: one of ${SEVERITIES.join(", ")}. Blocker = no workaround and blocks testing or release; Critical = core feature broken or data loss; Major = feature broken with a workaround; Minor = small functional issue; Trivial = cosmetic.`,
    "- affectedArea: the screen or feature, two to four words.",
    "Return only JSON.",
  );

  return sections.join("\n");
}

function parseModelJson(raw) {
  const cleaned = String(raw ?? "")
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        /* fall through */
      }
    }
    return null;
  }
}

// Checks and tidies the model's answer; falls back to the tester's own words
// where the model left something out.
export function normalizeReport(output, input) {
  if (!output || typeof output !== "object") return null;

  const steps = (Array.isArray(output.stepsToReproduce) ? output.stepsToReproduce : [])
    .map((step) => clip(step, 400).replace(/^\s*(?:step\s*)?\d+[.):-]\s*/i, ""))
    .filter(Boolean)
    .slice(0, 15);
  const affectedArea = clip(output.affectedArea, 80);
  let title = clip(output.title, 150).replace(/^(bug|issue)\s*[:-]\s*/i, "");

  if (!title) return null;
  // Titles read "[Area] What goes wrong"; small models often drop the area.
  if (affectedArea && !title.startsWith("[")) title = `[${affectedArea}] ${title}`.slice(0, 150);

  return {
    title,
    summary: clip(output.summary, 1200) || clip(input.description, 600),
    stepsToReproduce: steps.length ? steps : input.steps ? input.steps.split(/\r?\n/).map((s) => clip(s, 400)).filter(Boolean) : [],
    expectedResult: clip(output.expectedResult, 800) || clip(input.expected, 800),
    actualResult: clip(output.actualResult, 800) || clip(input.description, 800),
    rootCause: clip(output.rootCause, 1500) || "Not enough evidence to tell; needs investigation.",
    severity: SEVERITIES.includes(output.severity) ? output.severity : "Major",
    affectedArea,
  };
}

export function createBugReportService({ ollama, now = () => Date.now() }) {
  const jobs = new Map();

  function sweep() {
    const cutoff = now() - JOB_TTL_MS;
    for (const [id, job] of jobs) if (job.createdAt < cutoff) jobs.delete(id);
  }

  async function run(job, input, images) {
    try {
      const raw = await ollama.chat({
        prompt: buildPrompt(input),
        images: images.map((buffer) => buffer.toString("base64")),
        format: modelOutputSchema,
      });
      const report = normalizeReport(parseModelJson(raw), input);
      if (!report) throw Object.assign(new Error("The AI model returned an unreadable answer. Try again."), { code: "AI_BAD_OUTPUT" });
      Object.assign(job, { status: "SUCCEEDED", report, completedAt: now() });
    } catch (error) {
      Object.assign(job, {
        status: "FAILED",
        error: error?.code ? error.message : "Unable to generate the bug report",
        completedAt: now(),
      });
    }
  }

  return {
    start(userId, input, images) {
      sweep();
      for (const job of jobs.values()) {
        if (job.userId === userId && job.status === "PENDING") {
          throw new ApiError(409, "BUG_REPORT_IN_PROGRESS", "Wait for your current bug report to finish");
        }
      }
      const job = { id: randomUUID(), userId, status: "PENDING", createdAt: now() };
      jobs.set(job.id, job);
      job.done = run(job, input, images);
      return { id: job.id, status: job.status };
    },

    get(userId, id) {
      sweep();
      const job = jobs.get(id);
      if (!job || job.userId !== userId) throw new ApiError(404, "NOT_FOUND", "Bug report not found");
      const { done, userId: _owner, ...view } = job;
      return view;
    },

    // For tests: wait for a job's model call to finish.
    async settled(id) {
      await jobs.get(id)?.done;
    },
  };
}
