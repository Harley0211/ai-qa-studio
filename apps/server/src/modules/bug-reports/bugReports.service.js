import { open, readFile } from "node:fs/promises";
import { ApiError } from "../../lib/errors.js";
import { safeFileName } from "../../lib/fileStore.js";
import { detectImageType } from "../evidence/evidence.storage.js";
import { SEVERITIES, modelOutputSchema } from "./bugReports.schemas.js";

// Bug reports are saved from the moment they are started: the AI runs on the
// server, so the report keeps generating when the person opens another page
// or closes the browser, and every report stays in the list (its own folder
// of files) until someone deletes it.

export const INTERRUPTED_ERROR = "Generation was interrupted (the server restarted). Click Retry.";

const clip = (value, max) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const folderOf = (id) => `bug-reports/${id}`;

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
    sections.push("", "NETWORK EVIDENCE FROM THE HAR FILE (exact, computed from the file):", input.harFacts);
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
    stepsToReproduce: steps.length
      ? steps
      : input.steps
        ? input.steps.split(/\r?\n/).map((s) => clip(s, 400)).filter(Boolean)
        : [],
    expectedResult: clip(output.expectedResult, 800) || clip(input.expected, 800),
    actualResult: clip(output.actualResult, 800) || clip(input.description, 800),
    rootCause: clip(output.rootCause, 1500) || "Not enough evidence to tell; needs investigation.",
    severity: SEVERITIES.includes(output.severity) ? output.severity : "Major",
    affectedArea,
  };
}

// The type a saved file is served with is decided here, never taken from the
// browser, so a file can't be served back as a page.
async function storedType(upload, kind) {
  if (kind === "image") {
    const handle = await open(upload.path, "r");
    try {
      const { buffer } = await handle.read(Buffer.alloc(16), 0, 16, 0);
      const type = detectImageType(buffer);
      if (!type) throw new ApiError(400, "INVALID_FILE_TYPE", `${upload.originalname} is not a PNG, JPG or WEBP image`);
      return type.mimeType;
    } finally {
      await handle.close();
    }
  }
  if (kind === "video") {
    return /^video\/[\w.+-]+$/.test(upload.mimetype ?? "") ? upload.mimetype : "application/octet-stream";
  }
  if (kind === "har") return "application/json";
  return "text/markdown; charset=utf-8";
}

const parseJson = (value, fallback = null) => {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const fileView = ({ id, name, kind, mimeType, size, aiOrder, createdAt }) => ({
  id,
  name,
  kind,
  mimeType,
  size,
  usedByAi: aiOrder != null,
  createdAt,
});

const listSelect = {
  id: true,
  status: true,
  error: true,
  title: true,
  severity: true,
  affectedArea: true,
  input: true,
  createdAt: true,
  completedAt: true,
  createdById: true,
  createdBy: { select: { id: true, name: true } },
  files: { select: { size: true } },
};

function listView(row) {
  const input = parseJson(row.input, {});
  return {
    id: row.id,
    status: row.status,
    error: row.error,
    title: row.title,
    severity: row.severity,
    affectedArea: row.affectedArea,
    description: clip(input.description, 200),
    createdAt: row.createdAt,
    completedAt: row.completedAt,
    createdBy: row.createdBy,
    fileCount: row.files.length,
    totalSize: row.files.reduce((sum, file) => sum + file.size, 0),
  };
}

export function createBugReportService({ prisma, store, ollama }) {
  const running = new Map();

  // A report only exists inside its own project.
  async function findOr404(projectId, id) {
    const row = await prisma.bugReport.findFirst({ where: { id, projectId } });
    if (!row) throw new ApiError(404, "NOT_FOUND", "Bug report not found");
    return row;
  }

  function assertCanChange(user, row) {
    if (user.role !== "ADMIN" && row.createdById !== user.id) {
      throw new ApiError(403, "FORBIDDEN", "Only the person who created this bug report or an admin can change it");
    }
  }

  async function aiImages(id) {
    const files = await prisma.bugReportFile.findMany({
      where: { bugReportId: id, aiOrder: { not: null } },
      orderBy: { aiOrder: "asc" },
    });
    return Promise.all(files.map((file) => readFile(store.resolve(file.storageKey))));
  }

  // Runs the AI for a saved report and stores the outcome.
  function generate(id, input, images) {
    const job = (async () => {
      let data;
      try {
        const raw = await ollama.chat({
          prompt: buildPrompt(input),
          images: images.map((buffer) => buffer.toString("base64")),
          format: modelOutputSchema,
        });
        const report = normalizeReport(parseModelJson(raw), input);
        if (!report) {
          throw Object.assign(new Error("The AI model returned an unreadable answer. Click Retry."), { code: "AI_BAD_OUTPUT" });
        }
        data = {
          status: "SUCCEEDED",
          error: null,
          report: JSON.stringify(report),
          title: report.title,
          severity: report.severity,
          affectedArea: report.affectedArea,
          completedAt: new Date(),
        };
      } catch (error) {
        data = {
          status: "FAILED",
          error: error?.code ? error.message : "Unable to generate the bug report",
          completedAt: new Date(),
        };
      }
      // The report may have been deleted meanwhile.
      await prisma.bugReport.updateMany({ where: { id, status: "PENDING" }, data });
    })().finally(() => running.delete(id));
    running.set(id, job);
    return job;
  }

  async function assertNoRunningReport(userId) {
    const busy = await prisma.bugReport.count({ where: { createdById: userId, status: "PENDING" } });
    if (busy > 0) {
      throw new ApiError(409, "BUG_REPORT_IN_PROGRESS", "Wait for your current bug report to finish");
    }
  }

  return {
    // Reports left PENDING by a server restart can't finish on their own.
    async recoverInterrupted() {
      await prisma.bugReport.updateMany({
        where: { status: "PENDING" },
        data: { status: "FAILED", error: INTERRUPTED_ERROR, completedAt: new Date() },
      });
    },

    // images: [{ buffer, name, kind: "image" | "frame", mimeType }], in the
    // order the AI sees them.
    async create(user, projectId, input, images) {
      await assertNoRunningReport(user.id);

      const row = await prisma.bugReport.create({
        data: { input: JSON.stringify(input), createdById: user.id, projectId },
      });

      try {
        for (const [index, image] of images.entries()) {
          const name = safeFileName(image.name, `image-${index + 1}.png`);
          const storageKey = `${folderOf(row.id)}/${image.kind === "frame" ? "video-frames" : "attachments"}/${index + 1}-${name}`;
          await store.save(storageKey, image.buffer);
          await prisma.bugReportFile.create({
            data: {
              bugReportId: row.id,
              name,
              kind: image.kind,
              mimeType: image.mimeType,
              size: image.buffer.length,
              storageKey,
              aiOrder: index,
            },
          });
        }
      } catch (error) {
        await prisma.bugReport.delete({ where: { id: row.id } }).catch(() => {});
        await store.removeFolder(folderOf(row.id)).catch(() => {});
        throw error;
      }

      generate(row.id, input, images.map((image) => image.buffer));
      return { id: row.id, status: "PENDING" };
    },

    // Adds a file to a report's folder (videos, HAR copies, HAR summaries,
    // screenshots beyond what the AI looks at).
    async addFile(user, projectId, id, upload, kind) {
      const row = await findOr404(projectId, id);
      assertCanChange(user, row);
      const mimeType = await storedType(upload, kind);
      const name = safeFileName(upload.originalname, `${kind}-file`);
      const folder = { video: "attachments", image: "attachments", har: "har", "har-summary": "har" }[kind];
      const storageKey = `${folderOf(id)}/${folder}/${Date.now()}-${name}`;
      await store.moveIn(storageKey, upload.path);
      const file = await prisma.bugReportFile.create({
        data: { bugReportId: id, name, kind, mimeType, size: upload.size, storageKey },
      });
      return fileView(file);
    },

    async list(projectId) {
      const rows = await prisma.bugReport.findMany({ where: { projectId }, orderBy: { createdAt: "desc" }, select: listSelect });
      return { items: rows.map(listView), total: rows.length };
    },

    async get(projectId, id) {
      const row = await prisma.bugReport.findFirst({
        where: { id, projectId },
        include: { files: { orderBy: [{ aiOrder: "asc" }, { createdAt: "asc" }] }, createdBy: { select: { id: true, name: true } } },
      });
      if (!row) throw new ApiError(404, "NOT_FOUND", "Bug report not found");
      return {
        id: row.id,
        status: row.status,
        error: row.error,
        title: row.title,
        severity: row.severity,
        affectedArea: row.affectedArea,
        input: parseJson(row.input, {}),
        report: parseJson(row.report),
        texts: parseJson(row.texts),
        createdAt: row.createdAt,
        completedAt: row.completedAt,
        createdBy: row.createdBy,
        files: row.files.map(fileView),
      };
    },

    // Saves the title, severity and edited Jira/Slack texts.
    async update(user, projectId, id, changes) {
      const row = await findOr404(projectId, id);
      assertCanChange(user, row);
      const report = parseJson(row.report);
      if (row.status !== "SUCCEEDED" || !report) {
        throw new ApiError(409, "NOT_READY", "This bug report has not finished generating");
      }
      const next = {
        ...report,
        ...(changes.title !== undefined ? { title: changes.title } : {}),
        ...(changes.severity !== undefined ? { severity: changes.severity } : {}),
      };
      await prisma.bugReport.update({
        where: { id },
        data: {
          report: JSON.stringify(next),
          title: next.title,
          severity: next.severity,
          ...(changes.texts !== undefined ? { texts: changes.texts ? JSON.stringify(changes.texts) : null } : {}),
        },
      });
      return this.get(projectId, id);
    },

    async retry(user, projectId, id) {
      const row = await findOr404(projectId, id);
      assertCanChange(user, row);
      if (row.status !== "FAILED") throw new ApiError(409, "NOT_FAILED", "Only a failed bug report can be retried");
      await assertNoRunningReport(user.id);
      await prisma.bugReport.update({
        where: { id },
        data: { status: "PENDING", error: null, completedAt: null },
      });
      generate(id, parseJson(row.input, {}), await aiImages(id));
      return { id, status: "PENDING" };
    },

    // Deletes the report and its whole folder of files.
    async remove(user, projectId, id) {
      const row = await findOr404(projectId, id);
      assertCanChange(user, row);
      await prisma.bugReport.delete({ where: { id } });
      await store.removeFolder(folderOf(id));
    },

    async file(projectId, id, fileId) {
      const file = await prisma.bugReportFile.findFirst({ where: { id: fileId, bugReportId: id, bugReport: { projectId } } });
      if (!file) throw new ApiError(404, "NOT_FOUND", "File not found");
      return { file, path: store.resolve(file.storageKey) };
    },

    // Folders to delete from storage when a project is deleted.
    async foldersOfProject(projectId) {
      const rows = await prisma.bugReport.findMany({ where: { projectId }, select: { id: true } });
      return rows.map((row) => folderOf(row.id));
    },

    // For tests: wait for a report's AI call to finish.
    async settled(id) {
      await running.get(id);
    },
  };
}
