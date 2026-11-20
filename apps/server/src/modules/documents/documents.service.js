import { extractText, getDocumentProxy } from "unpdf";
import { ApiError, notFound } from "../../lib/errors.js";
import { splitIntoSections } from "./documents.sections.js";

// Uploaded files aren't limited by the JSON body size, so they may be longer
// than pasted text. Each section is still cut to 12,000 characters per run.
export const MAX_UPLOADED_DOCUMENT_CHARS = 200000;

// How much section text is sent per generation run. The local model has an
// 8k-token context and needs ~3k tokens for its answer, so longer sections are
// cut here (and the UI says so).
export const MAX_SECTION_CHARS_FOR_GENERATION = 12000;

const TEXT_EXTENSIONS = [".txt", ".md", ".markdown"];
const UNSUPPORTED_MESSAGE = "Only .txt, .md and .pdf documents are supported";

function readTextFile(buffer) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    throw new ApiError(400, "UNSUPPORTED_FILE_TYPE", "The file is not UTF-8 text");
  }
}

async function readPdfFile(buffer) {
  if (buffer.subarray(0, 5).toString("latin1") !== "%PDF-") {
    throw new ApiError(400, "UNSUPPORTED_FILE_TYPE", "The file is not a valid PDF");
  }

  let text;
  try {
    // verbosity 0: errors only, so damaged files don't fill the server log.
    const pdf = await getDocumentProxy(new Uint8Array(buffer), { verbosity: 0 });
    ({ text } = await extractText(pdf, { mergePages: true }));
  } catch {
    throw new ApiError(
      400,
      "UNREADABLE_PDF",
      "Unable to read this PDF. It may be damaged or password-protected.",
    );
  }

  if (!text.trim()) {
    throw new ApiError(
      400,
      "PDF_HAS_NO_TEXT",
      "This PDF has no selectable text (it may be a scanned image). Scanned PDFs are not supported.",
    );
  }

  return text;
}

function parseSections(value) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function summary(document) {
  const sections = parseSections(document.sections);
  return {
    id: document.id,
    projectId: document.projectId,
    title: document.title,
    sourceType: document.sourceType,
    filename: document.filename,
    createdAt: document.createdAt,
    charCount: document.content.length,
    sectionCount: sections.length,
  };
}

function detail(document) {
  return {
    ...summary(document),
    sections: parseSections(document.sections).map((section) => ({
      ...section,
      charCount: section.text.length,
      truncatedForGeneration: section.text.length > MAX_SECTION_CHARS_FOR_GENERATION,
    })),
  };
}

function buildSectionMessage({ documentTitle, section, focus }) {
  const text = section.text.slice(0, MAX_SECTION_CHARS_FOR_GENERATION);
  const focusLine = focus.length
    ? `\nFocus especially on these test types: ${focus.join(", ")}.`
    : "";

  return [
    "Generate test cases from the product requirements section below.",
    "There are no screenshots: the requirements text is the only evidence.",
    "Cover the behaviour it describes, including the validation and negative scenarios it implies, and do not invent features it does not mention." +
      focusLine,
    "",
    `Document: ${documentTitle}`,
    `Section: ${section.title}`,
    "---",
    text,
    "---",
  ].join("\n");
}

export function createDocumentsService(prisma, generationService) {
  async function assertProject(projectId) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    });
    if (!project) throw notFound("Project");
  }

  async function findDocument(projectId, documentId) {
    const document = await prisma.document.findFirst({
      where: { id: documentId, projectId },
    });
    if (!document) throw notFound("Document");
    return document;
  }

  async function save(projectId, { title, content, sourceType, filename = null }) {
    await assertProject(projectId);

    const sections = splitIntoSections(content);
    if (sections.length === 0) {
      throw new ApiError(400, "VALIDATION_ERROR", "The document has no text");
    }

    const document = await prisma.document.create({
      data: {
        projectId,
        title,
        sourceType,
        filename,
        content,
        sections: JSON.stringify(sections),
      },
    });

    return detail(document);
  }

  return {
    async list(projectId) {
      await assertProject(projectId);
      const documents = await prisma.document.findMany({
        where: { projectId },
        orderBy: { createdAt: "desc" },
      });
      const items = documents.map(summary);
      return { items, total: items.length };
    },

    async get(projectId, documentId) {
      await assertProject(projectId);
      return detail(await findDocument(projectId, documentId));
    },

    createFromText(projectId, { title, content }) {
      return save(projectId, { title, content, sourceType: "PASTE" });
    },

    async createFromUpload(projectId, file, title) {
      if (!file) {
        throw new ApiError(400, "VALIDATION_ERROR", "A file is required", {
          fields: { file: "A file is required" },
        });
      }

      const name = file.originalname ?? "document";
      const dot = name.lastIndexOf(".");
      const extension = dot === -1 ? "" : name.slice(dot).toLowerCase();

      let raw;
      if (extension === ".pdf") {
        raw = await readPdfFile(file.buffer);
      } else if (TEXT_EXTENSIONS.includes(extension)) {
        raw = readTextFile(file.buffer);
      } else {
        throw new ApiError(400, "UNSUPPORTED_FILE_TYPE", UNSUPPORTED_MESSAGE);
      }

      const content = raw.trim();

      if (!content) {
        throw new ApiError(400, "VALIDATION_ERROR", "The document has no text");
      }
      if (content.length > MAX_UPLOADED_DOCUMENT_CHARS) {
        throw new ApiError(
          400,
          "VALIDATION_ERROR",
          `Document text must be ${MAX_UPLOADED_DOCUMENT_CHARS.toLocaleString("en-US")} characters or fewer`,
        );
      }

      return save(projectId, {
        title: title || name.replace(/\.[^.]+$/, ""),
        content,
        sourceType: "UPLOAD",
        filename: name,
      });
    },

    async remove(projectId, documentId) {
      await assertProject(projectId);
      await findDocument(projectId, documentId);
      // Linked runs and test cases keep their section title; the link is cleared.
      await prisma.document.delete({ where: { id: documentId } });
    },

    // Starts one generation run per selected section, so every generated case
    // can be traced to the section it came from.
    async generate(projectId, documentId, { sectionIds, generationFormat, focus }) {
      await assertProject(projectId);
      const document = await findDocument(projectId, documentId);
      const sections = parseSections(document.sections);

      const selected = sectionIds.map((id) => sections.find((s) => s.id === id));
      if (selected.some((section) => !section)) {
        throw new ApiError(400, "VALIDATION_ERROR", "One or more sections were not found");
      }

      const runs = [];
      for (const section of selected) {
        const run = await generationService.startGeneration(
          projectId,
          buildSectionMessage({ documentTitle: document.title, section, focus }),
          [],
          generationFormat,
          { documentId: document.id, sectionTitle: section.title },
        );
        runs.push({ ...run, sectionId: section.id, sectionTitle: section.title });
      }

      return { runs };
    },
  };
}
