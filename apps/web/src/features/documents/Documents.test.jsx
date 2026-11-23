import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { apiError, mockApi, project, renderRoute } from "../../test/utils.jsx";

const doc = (overrides = {}) => ({
  id: "d1",
  projectId: "p1",
  title: "Add-ons PRD",
  sourceType: "PASTE",
  filename: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  charCount: 1200,
  sectionCount: 3,
  ...overrides,
});

const sections = [
  { id: "s1", title: "Add-ons PRD", text: "# Add-ons PRD\nIntro", charCount: 20, truncatedForGeneration: false },
  { id: "s2", title: "3.1 Catalog", text: "## 3.1 Catalog\nList", charCount: 300, truncatedForGeneration: false },
  { id: "s3", title: "3.2 Purchase flow", text: "## 3.2 Purchase flow\nBuy", charCount: 20000, truncatedForGeneration: true },
];

const workspace = { "GET /api/projects/p1": project({ urls: [], urlCount: 0 }) };

describe("Documents tab", () => {
  it("lists documents and shows their sections", async () => {
    const user = userEvent.setup();
    mockApi({
      ...workspace,
      "GET /api/projects/p1/documents": {
        items: [doc(), doc({ id: "d2", title: "Notes", sourceType: "UPLOAD", filename: "notes.md", sectionCount: 1 })],
        total: 2,
      },
      "GET /api/projects/p1/documents/d1": { ...doc(), sections },
    });

    renderRoute("/projects/p1/documents");

    expect(await screen.findByText("Add-ons PRD")).toBeInTheDocument();
    expect(screen.getByText(/3 sections · 1,200 characters · Pasted text/)).toBeInTheDocument();
    expect(screen.getByText(/1 section · .* · notes\.md/)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Generate test cases from Add-ons PRD" }),
    ).toHaveAttribute("href", "/projects/p1/tools/prd-to-test-cases?document=d1");

    await user.click(screen.getAllByText("View sections")[0]);
    expect(await screen.findByText("3.2 Purchase flow")).toBeInTheDocument();
    expect(screen.getByText("20,000 characters")).toBeInTheDocument();
  });

  it("adds a pasted document", async () => {
    const user = userEvent.setup();
    let items = [];
    const mock = mockApi({
      ...workspace,
      "GET /api/projects/p1/documents": () => ({ items, total: items.length }),
      "POST /api/projects/p1/documents": (call) => {
        items = [doc({ title: call.body.title })];
        return { ...items[0], sections };
      },
    });

    renderRoute("/projects/p1/documents");
    await screen.findByText("No documents yet");
    await user.click(screen.getAllByRole("button", { name: "Add document" })[0]);

    const dialog = screen.getByRole("dialog", { name: "Add document" });
    await user.click(within(dialog).getByRole("button", { name: "Add document" }));
    expect(within(dialog).getByText("Title is required")).toBeInTheDocument();
    expect(within(dialog).getByText("Document text is required")).toBeInTheDocument();
    expect(mock.find("POST", "/api/projects/p1/documents")).toHaveLength(0);

    await user.type(within(dialog).getByLabelText("Title"), "Add-ons PRD");
    await user.type(within(dialog).getByLabelText("Document text"), "## 3.1 Catalog\nShows add-ons");
    await user.click(within(dialog).getByRole("button", { name: "Add document" }));

    expect(await screen.findByText("“Add-ons PRD” added with 3 sections.")).toBeInTheDocument();
    expect(mock.find("POST", "/api/projects/p1/documents")[0].body).toEqual({
      title: "Add-ons PRD",
      content: "## 3.1 Catalog\nShows add-ons",
    });
  });

  async function openUpload(user) {
    renderRoute("/projects/p1/documents");
    await screen.findByText("No documents yet");
    await user.click(screen.getAllByRole("button", { name: "Add document" })[0]);
    const dialog = screen.getByRole("dialog", { name: "Add document" });
    await user.click(within(dialog).getByRole("button", { name: "Upload file" }));
    return { dialog, input: within(dialog).getByLabelText("Document file") };
  }

  it("uploads .md and .pdf files and rejects other types", async () => {
    const user = userEvent.setup({ applyAccept: false });
    const mock = mockApi({
      ...workspace,
      "GET /api/projects/p1/documents": { items: [], total: 0 },
      "POST /api/projects/p1/documents/upload": (call) => ({
        ...doc({ title: call.body.get("file").name.replace(/\.\w+$/, ""), sectionCount: 2 }),
        sections,
      }),
    });

    const { dialog, input } = await openUpload(user);
    const submit = () => user.click(within(dialog).getByRole("button", { name: "Add document" }));

    await user.upload(input, new File(["PK"], "spec.docx"));
    await submit();
    expect(within(dialog).getByText("Only .txt, .md and .pdf files are supported")).toBeInTheDocument();
    expect(mock.find("POST", "/api/projects/p1/documents/upload")).toHaveLength(0);

    await user.upload(input, new File(["%PDF-1.4"], "Add-ons PRD.pdf", { type: "application/pdf" }));
    await submit();

    expect(await screen.findByText("“Add-ons PRD” added with 2 sections.")).toBeInTheDocument();
    const body = mock.find("POST", "/api/projects/p1/documents/upload")[0].body;
    expect(body).toBeInstanceOf(FormData);
    expect(body.get("file").name).toBe("Add-ons PRD.pdf");
    expect(body.get("title")).toBeNull();
  });

  it("rejects files over 10 MB before uploading", async () => {
    const user = userEvent.setup();
    const mock = mockApi({ ...workspace, "GET /api/projects/p1/documents": { items: [], total: 0 } });

    const { dialog, input } = await openUpload(user);
    const big = new File(["x"], "huge.pdf", { type: "application/pdf" });
    Object.defineProperty(big, "size", { value: 11 * 1024 * 1024 });
    await user.upload(input, big);
    await user.click(within(dialog).getByRole("button", { name: "Add document" }));

    expect(within(dialog).getByText("The file is larger than 10 MB")).toBeInTheDocument();
    expect(mock.find("POST", "/api/projects/p1/documents/upload")).toHaveLength(0);
  });

  it("shows why the server could not read a PDF", async () => {
    const user = userEvent.setup();
    mockApi({
      ...workspace,
      "GET /api/projects/p1/documents": { items: [], total: 0 },
      "POST /api/projects/p1/documents/upload": apiError(
        400,
        "PDF_HAS_NO_TEXT",
        "This PDF has no selectable text (it may be a scanned image). Scanned PDFs are not supported.",
      ),
    });

    const { dialog, input } = await openUpload(user);
    await user.upload(input, new File(["%PDF-1.4"], "scan.pdf", { type: "application/pdf" }));
    await user.click(within(dialog).getByRole("button", { name: "Add document" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(/no selectable text/);
  });

  it("deletes a document after confirmation", async () => {
    const user = userEvent.setup();
    let items = [doc()];
    const mock = mockApi({
      ...workspace,
      "GET /api/projects/p1/documents": () => ({ items, total: items.length }),
      "DELETE /api/projects/p1/documents/d1": () => {
        items = [];
        return new Response(null, { status: 204 });
      },
    });

    renderRoute("/projects/p1/documents");
    await user.click(await screen.findByRole("button", { name: "Delete Add-ons PRD" }));
    const dialog = screen.getByRole("dialog", { name: "Delete document?" });
    expect(within(dialog).getByText(/Test cases already generated from it are kept/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Delete document" }));

    expect(await screen.findByText("Document deleted.")).toBeInTheDocument();
    expect(mock.find("DELETE", "/api/projects/p1/documents/d1")).toHaveLength(1);
    expect(await screen.findByText("No documents yet")).toBeInTheDocument();
  });
});

describe("PRD → Test cases tool", () => {
  function mockTool(overrides = {}) {
    let pending = { items: [], total: 0 };
    return mockApi({
      "GET /api/projects/p1": project({ id: "p1", name: "Alpha", urls: [], urlCount: 0 }),
      "GET /api/projects/p1/documents": {
        items: [doc(), doc({ id: "d2", title: "Older notes", sectionCount: 1 })],
        total: 2,
      },
      "GET /api/projects/p1/documents/d1": { ...doc(), sections },
      "GET /api/projects/p1/generations?review=pending": () => pending,
      "POST /api/projects/p1/documents/d1/generations": (call) => {
        pending = {
          items: [
            {
              id: "run1",
              completedAt: "2026-01-01T00:00:00.000Z",
              draftCount: 1,
              source: { documentId: "d1", documentTitle: "Add-ons PRD", sectionTitle: "3.2 Purchase flow" },
            },
          ],
          total: 1,
        };
        return {
          data: {
            runs: call.body.sectionIds.map((id, i) => ({ id: `run${i + 1}`, status: "PENDING", sectionId: id })),
          },
        };
      },
      "GET /api/projects/p1/generations/run1": {
        data: {
          id: "run1",
          status: "SUCCEEDED",
          reviewStatus: "PENDING_REVIEW",
          source: { documentId: "d1", documentTitle: "Add-ons PRD", sectionTitle: "3.2 Purchase flow" },
          drafts: [{ index: 0, title: "Declined card", steps: "1. Pay", expectedResult: "Error shown", stepExpectedResults: null }],
        },
      },
      ...overrides,
    });
  }

  it("generates from the selected sections and shows the results for review", async () => {
    const user = userEvent.setup();
    const mock = mockTool();

    renderRoute("/projects/p1/tools/prd-to-test-cases");

    expect(await screen.findByRole("combobox", { name: "Document" })).toHaveValue("d1");
    const main = screen.getByRole("main");
    const generate = await within(main).findByRole("button", { name: "Generate test cases" });
    expect(generate).toBeDisabled();
    // Sections load in a separate request, so wait for them.
    expect(await screen.findByText("Long: first 12,000 characters used")).toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: /3\.2 Purchase flow/ }));
    await user.click(screen.getByRole("radio", { name: /Expected result per step/ }));
    await user.click(generate);

    expect(await screen.findByText("Test case generation started.")).toBeInTheDocument();
    expect(mock.find("POST", "/api/projects/p1/documents/d1/generations")[0].body).toEqual({
      sectionIds: ["s3"],
      generationFormat: "PER_STEP",
      focus: ["Functional", "Negative", "Validation"],
    });

    expect(await screen.findByText("Test cases are ready to review.")).toBeInTheDocument();
    const review = await screen.findByRole("region", { name: "Review generated test cases" });
    expect(await within(review).findByText("Declined card")).toBeInTheDocument();
    expect(within(review).getByText(/From Add-ons PRD › 3\.2 Purchase flow/)).toBeInTheDocument();
  });

  it("uses the document from the URL and limits the selection to 10 sections", async () => {
    const user = userEvent.setup();
    const many = Array.from({ length: 12 }, (_, i) => ({
      id: `s${i + 1}`,
      title: `Section ${i + 1}`,
      text: "x",
      charCount: 1,
      truncatedForGeneration: false,
    }));
    mockTool({
      "GET /api/projects/p1/documents/d2": { ...doc({ id: "d2", title: "Older notes" }), sections: many },
    });

    renderRoute("/projects/p1/tools/prd-to-test-cases?document=d2");

    expect(await screen.findByRole("combobox", { name: "Document" })).toHaveValue("d2");
    await user.click(await screen.findByRole("button", { name: "Select first 10" }));

    expect(screen.getByText(/10 of 12 selected/)).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /^Section 11\b/ })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: /^Section 1\b/ })).toBeChecked();
  });

  it("offers to add a document when the project has none", async () => {
    mockTool({ "GET /api/projects/p1/documents": { items: [], total: 0 } });

    renderRoute("/projects/p1/tools/prd-to-test-cases");

    expect(await screen.findByText("No documents yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add document" })).toBeInTheDocument();
  });
});

describe("Test case source", () => {
  it("shows which document section a test case came from", async () => {
    mockApi({
      ...workspace,
      "GET /api/projects/p1/test-cases": {
        items: [
          {
            id: "tc1",
            caseId: "TC-0001",
            title: "Declined card",
            steps: "1. Pay",
            expectedResult: "Error shown",
            runStatus: "Not Run",
            sourceSection: "3.2 Purchase flow",
            sourceDocument: { id: "d1", title: "Add-ons PRD" },
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
          {
            id: "tc2",
            caseId: "TC-0002",
            title: "Orphaned",
            steps: "1. Pay",
            expectedResult: "Error shown",
            runStatus: "Not Run",
            sourceSection: "3.3 Errors",
            sourceDocument: null,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        total: 2,
      },
    });

    renderRoute("/projects/p1/test-cases");

    expect(await screen.findByText("From Add-ons PRD › 3.2 Purchase flow")).toBeInTheDocument();
    expect(screen.getByText("From 3.3 Errors")).toBeInTheDocument();
  });
});
