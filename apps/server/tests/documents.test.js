import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { api, createProject, n8nClient, prisma, resetDb } from "./helpers.js";
import { makePdf } from "./pdfFixture.js";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

const PRD = [
  "# Add-ons PRD",
  "Lets users buy add-ons.",
  "## 3.1 Catalog",
  "The catalog lists every add-on with its price.",
  "## 3.2 Purchase flow",
  "1. User selects an add-on",
  "2. User confirms payment",
  "A failed payment shows an error.",
].join("\n");

const createDocument = (projectId, body = { title: "Add-ons PRD", content: PRD }) =>
  api().post(`/api/projects/${projectId}/documents`).send(body);

const uploadDocument = (projectId, content, filename, title) => {
  const req = api()
    .post(`/api/projects/${projectId}/documents/upload`)
    .attach("file", Buffer.from(content), filename);
  return title ? req.field("title", title) : req;
};

describe("Documents", () => {
  it("creates a document from pasted text and splits it into sections", async () => {
    const project = await createProject();

    const res = await createDocument(project.id);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      title: "Add-ons PRD",
      sourceType: "PASTE",
      filename: null,
      sectionCount: 3,
      charCount: PRD.length,
    });
    expect(res.body.sections.map((s) => s.title)).toEqual([
      "Add-ons PRD",
      "3.1 Catalog",
      "3.2 Purchase flow",
    ]);
    expect(res.body.sections[2]).toMatchObject({ id: "s3", truncatedForGeneration: false });
    expect(res.body.sections[2].text).toContain("1. User selects an add-on");
  });

  it("validates pasted documents", async () => {
    const project = await createProject();

    const blank = await createDocument(project.id, { title: "  ", content: "   " });
    expect(blank.status).toBe(400);
    expect(blank.body.error.details.fields).toMatchObject({
      title: "Title is required",
      content: "Document text is required",
    });

    const tooLong = await createDocument(project.id, { title: "Big", content: "x".repeat(60001) });
    expect(tooLong.status).toBe(400);

    const unknownProject = await createDocument("missing");
    expect(unknownProject.status).toBe(404);
  });

  it("uploads .txt and .md files, using the file name as the default title", async () => {
    const project = await createProject();

    const md = await uploadDocument(project.id, PRD, "addons-prd.md");
    expect(md.status).toBe(201);
    expect(md.body).toMatchObject({
      title: "addons-prd",
      sourceType: "UPLOAD",
      filename: "addons-prd.md",
      sectionCount: 3,
    });

    const txt = await uploadDocument(project.id, "Plain requirements.", "notes.txt", "Release notes");
    expect(txt.status).toBe(201);
    expect(txt.body).toMatchObject({ title: "Release notes", sectionCount: 1 });
    expect(txt.body.sections[0].title).toBe("Whole document");
  });

  it("rejects unsupported, binary, empty or missing uploads", async () => {
    const project = await createProject();

    const docx = await uploadDocument(project.id, "PK\u0003\u0004", "spec.docx");
    expect(docx.status).toBe(400);
    expect(docx.body.error).toMatchObject({
      code: "UNSUPPORTED_FILE_TYPE",
      message: "Only .txt, .md and .pdf documents are supported",
    });

    const noExtension = await uploadDocument(project.id, "text", "README");
    expect(noExtension.status).toBe(400);

    const binary = await api()
      .post(`/api/projects/${project.id}/documents/upload`)
      .attach("file", Buffer.from([0xff, 0xfe, 0x00, 0xd8]), "spec.txt");
    expect(binary.status).toBe(400);
    expect(binary.body.error.code).toBe("UNSUPPORTED_FILE_TYPE");

    const empty = await uploadDocument(project.id, "   ", "empty.txt");
    expect(empty.status).toBe(400);

    const missing = await api().post(`/api/projects/${project.id}/documents/upload`);
    expect(missing.status).toBe(400);

    expect(await prisma.document.count()).toBe(0);
  });

  it("extracts the text of a PDF and splits it at its headings", async () => {
    const project = await createProject();
    const pdf = makePdf([
      "Add-ons PRD",
      "3.1 Catalog",
      "The catalog lists every add-on with its price.",
      "3.2 Purchase flow",
      "1. User selects an add-on",
      "A failed payment shows an error.",
    ]);

    const res = await api()
      .post(`/api/projects/${project.id}/documents/upload`)
      .attach("file", pdf, { filename: "Add-ons PRD v3.pdf", contentType: "application/pdf" });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      title: "Add-ons PRD v3",
      sourceType: "UPLOAD",
      filename: "Add-ons PRD v3.pdf",
    });
    expect(res.body.sections.map((s) => s.title)).toEqual([
      "Introduction",
      "3.1 Catalog",
      "3.2 Purchase flow",
    ]);
    expect(res.body.sections[2].text).toBe(
      "3.2 Purchase flow\n1. User selects an add-on\nA failed payment shows an error.",
    );
  });

  it("explains why a PDF can't be used", async () => {
    const project = await createProject();
    const upload = (buffer) =>
      api()
        .post(`/api/projects/${project.id}/documents/upload`)
        .attach("file", buffer, { filename: "spec.pdf", contentType: "application/pdf" });

    const scanned = await upload(makePdf([]));
    expect(scanned.status).toBe(400);
    expect(scanned.body.error.code).toBe("PDF_HAS_NO_TEXT");

    const notPdf = await upload(Buffer.from("just text pretending"));
    expect(notPdf.status).toBe(400);
    expect(notPdf.body.error.message).toBe("The file is not a valid PDF");

    const damaged = await upload(Buffer.from("%PDF-1.7\nthis is not a real pdf body"));
    expect(damaged.status).toBe(400);
    expect(damaged.body.error.code).toBe("UNREADABLE_PDF");

    expect(await prisma.document.count()).toBe(0);
  });

  it("lists, gets and deletes documents, and counts them on the project", async () => {
    const project = await createProject();
    const created = (await createDocument(project.id)).body;

    const list = await api().get(`/api/projects/${project.id}/documents`);
    expect(list.body.total).toBe(1);
    expect(list.body.items[0]).toMatchObject({ id: created.id, sectionCount: 3 });
    expect(list.body.items[0].sections).toBeUndefined();

    expect((await api().get(`/api/projects/${project.id}`)).body.documentCount).toBe(1);

    const one = await api().get(`/api/projects/${project.id}/documents/${created.id}`);
    expect(one.body.sections).toHaveLength(3);

    const otherProject = await createProject({ name: "Other" });
    expect(
      (await api().get(`/api/projects/${otherProject.id}/documents/${created.id}`)).status,
    ).toBe(404);

    const removed = await api().delete(`/api/projects/${project.id}/documents/${created.id}`);
    expect(removed.status).toBe(204);
    expect((await api().get(`/api/projects/${project.id}/documents`)).body.total).toBe(0);
  });
});

describe("Generating test cases from a document", () => {
  it("starts one run per selected section with the section text as the message", async () => {
    const project = await createProject();
    const doc = (await createDocument(project.id)).body;

    const res = await api()
      .post(`/api/projects/${project.id}/documents/${doc.id}/generations`)
      .send({ sectionIds: ["s3", "s2"], generationFormat: "PER_STEP", focus: ["Negative"] });

    expect(res.status).toBe(202);
    expect(res.body.data.runs.map((r) => [r.sectionId, r.sectionTitle, r.status])).toEqual([
      ["s3", "3.2 Purchase flow", "PENDING"],
      ["s2", "3.1 Catalog", "PENDING"],
    ]);

    expect(n8nClient.triggerGeneration).toHaveBeenCalledTimes(2);
    const first = n8nClient.triggerGeneration.mock.calls[0][0];
    expect(first.generationFormat).toBe("PER_STEP");
    expect(first.evidence).toEqual([]);
    expect(first.message).toContain("the requirements text is the only evidence");
    expect(first.message).toContain("Focus especially on these test types: Negative.");
    expect(first.message).toContain("Document: Add-ons PRD\nSection: 3.2 Purchase flow");
    expect(first.message).toContain("A failed payment shows an error.");
    expect(first.message).not.toContain("The catalog lists");

    const runs = await prisma.generationRun.findMany({ orderBy: { sectionTitle: "asc" } });
    expect(runs.map((r) => [r.documentId, r.sectionTitle])).toEqual([
      [doc.id, "3.1 Catalog"],
      [doc.id, "3.2 Purchase flow"],
    ]);
  });

  it("sends at most 12,000 characters of a long section", async () => {
    const project = await createProject();
    const doc = (
      await createDocument(project.id, { title: "Long", content: `# Big\n${"a".repeat(20000)}` })
    ).body;
    expect(doc.sections[0].truncatedForGeneration).toBe(true);

    await api()
      .post(`/api/projects/${project.id}/documents/${doc.id}/generations`)
      .send({ sectionIds: ["s1"] });

    const { message } = n8nClient.triggerGeneration.mock.calls[0][0];
    expect(message.match(/a+/g).sort((x, y) => y.length - x.length)[0].length).toBeLessThan(12000);
  });

  it("validates the section selection", async () => {
    const project = await createProject();
    const doc = (await createDocument(project.id)).body;
    const generate = (body) =>
      api().post(`/api/projects/${project.id}/documents/${doc.id}/generations`).send(body);

    expect((await generate({ sectionIds: [] })).status).toBe(400);
    expect((await generate({ sectionIds: ["s1", "s1"] })).status).toBe(400);
    expect((await generate({ sectionIds: Array.from({ length: 11 }, (_, i) => `s${i}`) })).status).toBe(400);
    expect((await generate({ sectionIds: ["s9"] })).status).toBe(400);
    expect(n8nClient.triggerGeneration).not.toHaveBeenCalled();
  });

  it("links accepted test cases to their document section", async () => {
    const project = await createProject();
    const doc = (await createDocument(project.id)).body;

    await api()
      .post(`/api/projects/${project.id}/documents/${doc.id}/generations`)
      .send({ sectionIds: ["s3"] });
    const { runId, callbackUrl, callbackToken } = n8nClient.triggerGeneration.mock.calls[0][0];

    await api()
      .post(new URL(callbackUrl).pathname)
      .set("Authorization", `Bearer ${callbackToken}`)
      .send({
        testCases: [{ title: "Failed payment", steps: ["Pay with a declined card"], expectedResult: "An error is shown" }],
      });

    const pending = await api().get(`/api/projects/${project.id}/generations?review=pending`);
    expect(pending.body.items[0].source).toEqual({
      documentId: doc.id,
      documentTitle: "Add-ons PRD",
      sectionTitle: "3.2 Purchase flow",
    });

    await api().post(`/api/projects/${project.id}/generations/${runId}/accept`).send({ indexes: [0] });

    const cases = await api().get(`/api/projects/${project.id}/test-cases`);
    expect(cases.body.items[0]).toMatchObject({
      title: "Failed payment",
      sourceSection: "3.2 Purchase flow",
      sourceDocument: { id: doc.id, title: "Add-ons PRD" },
    });

    // Deleting the document keeps the test case and its section label.
    await api().delete(`/api/projects/${project.id}/documents/${doc.id}`);
    const after = await api().get(`/api/projects/${project.id}/test-cases`);
    expect(after.body.items[0]).toMatchObject({ sourceSection: "3.2 Purchase flow", sourceDocument: null });
  });

  it("leaves image runs without a source", async () => {
    const project = await createProject();
    await api().post(`/api/projects/${project.id}/generations`).send({ message: "From screenshots" });
    const { runId } = n8nClient.triggerGeneration.mock.calls[0][0];

    const run = await api().get(`/api/projects/${project.id}/generations/${runId}`);
    expect(run.body.data.source).toBeNull();
  });
});
