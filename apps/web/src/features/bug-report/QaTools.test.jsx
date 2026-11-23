import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockApi, project, renderRoute, signedInUser } from "../../test/utils.jsx";
import { sampleHarText } from "../har/harFixture.js";
import { openedHars } from "../har/HarReaderPage.jsx";
import { resetTasks } from "./backgroundTasks.js";

vi.mock("./videoFrames.js", async (importOriginal) => ({
  ...(await importOriginal()),
  extractFrames: vi.fn(async () => [
    { blob: new Blob(["frame1"], { type: "image/jpeg" }), time: 2 },
    { blob: new Blob(["frame2"], { type: "image/jpeg" }), time: 4 },
  ]),
}));

const pncc = project({ id: "p1", name: "PNCC", urls: [], urlCount: 0 });
const harFile = () => new File([sampleHarText()], "session.har", { type: "application/json" });
const pngFile = () => new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "cart.png", { type: "image/png" });
const videoFile = () => new File(["video"], "checkout.mp4", { type: "video/mp4" });

const readBlob = (blob) =>
  new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsText(blob);
  });

const report = {
  title: "[Checkout] Order fails with 500 when placing an order",
  summary: "Placing an order fails because the orders API returns 500.",
  stepsToReproduce: ["Open the cart", "Click Place order"],
  expectedResult: "The order is placed.",
  actualResult: "An error toast appears.",
  rootCause: "POST /api/orders returns 500 (Payment gateway timeout).",
  severity: "Critical",
  affectedArea: "Checkout",
};

const savedReport = (overrides = {}) => ({
  id: "r1",
  status: "SUCCEEDED",
  error: null,
  title: report.title,
  severity: report.severity,
  affectedArea: report.affectedArea,
  input: {
    description: "Place order shows an error toast.",
    environment: { url: "https://shop.example/cart", browser: "Chrome 131" },
    attachments: [{ name: "cart.png", kind: "image" }, { name: "session.har", kind: "har" }],
    harErrors: [
      {
        file: "session.har",
        entry: { method: "POST", url: "https://shop.example/api/orders", status: 500, statusText: "Internal Server Error", time: 812, errorMessage: "Payment gateway timeout" },
      },
    ],
  },
  report,
  texts: null,
  createdAt: "2026-11-23T05:00:00.000Z",
  completedAt: "2026-11-23T05:01:00.000Z",
  createdBy: { id: "u1", name: "Ada Admin" },
  files: [
    { id: "f1", name: "cart.png", kind: "image", mimeType: "image/png", size: 4, usedByAi: true },
    { id: "f2", name: "session-redacted.har", kind: "har", mimeType: "application/json", size: 20, usedByAi: false },
  ],
  ...overrides,
});

const listItem = (overrides = {}) => ({
  id: "r1",
  status: "SUCCEEDED",
  title: report.title,
  severity: "Critical",
  description: "Place order shows an error toast.",
  createdAt: "2026-11-23T05:00:00.000Z",
  createdBy: { id: "u1", name: "Ada Admin" },
  fileCount: 2,
  totalSize: 24,
  ...overrides,
});

beforeEach(() => {
  resetTasks();
  openedHars.clear();
  // jsdom has no object URLs (used for image previews and downloads).
  URL.createObjectURL = vi.fn(() => "blob:preview");
  URL.revokeObjectURL = vi.fn();
});

describe("Bug report generator", () => {
  it("keeps generating in the background when you go to another page", async () => {
    const user = userEvent.setup();
    let status = "PENDING";
    const mock = mockApi({
      "GET /api/projects/p1": pncc,
      "GET /api/projects/p1/bug-reports": { items: [], total: 0 },
      "POST /api/projects/p1/bug-reports": { data: { id: "r1", status: "PENDING" } },
      "POST /api/projects/p1/bug-reports/r1/files": (call) => ({ data: { id: `f-${call.body.get("kind")}` } }),
      "GET /api/projects/p1/bug-reports/r1": () => ({ data: savedReport({ status }) }),
      "GET /api/projects": { items: [], total: 0 },
    });
    renderRoute("/projects/p1/tools/bug-report");

    await user.type(await screen.findByLabelText("Describe the bug"), "Place order shows an error toast and no order is created.");
    await user.type(screen.getByLabelText("Page / URL"), "https://shop.example/cart");
    await user.upload(screen.getByLabelText("Add evidence files"), [pngFile(), videoFile(), harFile()]);
    expect(await screen.findByText(/5 requests, 3 failed/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Generate bug report" }));
    expect(await screen.findByText(/Generating in the background/)).toBeInTheDocument();
    // The form is ready for the next report.
    expect(screen.getByLabelText("Describe the bug")).toHaveValue("");

    // Leave the page: the work goes on and shows in the activity tray.
    await user.click(within(screen.getByRole("complementary", { name: "Primary" })).getByRole("link", { name: "Switch project" }));
    const tray = await screen.findByRole("complementary", { name: "Background activity" });
    await within(tray).findByText(/The AI is writing the report/);

    const details = JSON.parse(mock.find("POST", "/api/projects/p1/bug-reports")[0].body.get("details"));
    expect(details.environment.url).toBe("https://shop.example/cart");
    expect(details.harFacts).toContain('"Payment gateway timeout"');
    expect(details.imageKinds).toEqual(["image", "frame", "frame"]);
    expect(details.imageNotes[1]).toBe("Frame 1 of video checkout.mp4 at 0:02");
    expect(details.harErrors[0].entry).toMatchObject({ method: "POST", status: 500, errorMessage: "Payment gateway timeout" });
    expect(details.harErrors.some((e) => e.entry.url.includes("abc123"))).toBe(false);
    expect(mock.find("POST", "/api/projects/p1/bug-reports")[0].body.getAll("images")).toHaveLength(3);

    // The rest of the folder: the video, a redacted HAR and its summary.
    const uploads = mock.find("POST", "/api/projects/p1/bug-reports/r1/files");
    expect(uploads.map((call) => [call.body.get("kind"), call.body.get("file").name])).toEqual([
      ["video", "checkout.mp4"],
      ["har", "session-redacted.har"],
      ["har-summary", "session-summary.md"],
    ]);
    const redacted = await readBlob(uploads[1].body.get("file"));
    expect(redacted).not.toContain("hunter2");
    expect(redacted).toContain("[REDACTED]");

    status = "SUCCEEDED";
    expect(await screen.findByText(`Bug report ready: ${report.title}`, {}, { timeout: 6000 })).toBeInTheDocument();
    expect(within(tray).getByRole("link", { name: "Open report" })).toHaveAttribute("href", "/projects/p1/tools/bug-report/r1");
  }, 15000);

  it("lists saved reports as folders", async () => {
    mockApi({
      "GET /api/projects/p1": pncc,
      "GET /api/projects/p1/bug-reports": {
        items: [listItem(), listItem({ id: "r2", status: "PENDING", title: null, severity: null, description: "Login hangs" })],
        total: 2,
      },
    });
    renderRoute("/projects/p1/tools/bug-report");

    const saved = await screen.findByRole("region", { name: "Saved bug reports" });
    const link = await within(saved).findByRole("link", { name: /Order fails with 500/ });
    expect(link).toHaveAttribute("href", "/projects/p1/tools/bug-report/r1");
    expect(within(link).getByText(/2 files/)).toBeInTheDocument();
    expect(within(saved).getByRole("link", { name: /Login hangs/ })).toHaveTextContent("Generating…");
  });

  it("asks for a description before starting", async () => {
    const user = userEvent.setup();
    const mock = mockApi({ "GET /api/projects/p1": pncc, "GET /api/projects/p1/bug-reports": { items: [], total: 0 } });
    renderRoute("/projects/p1/tools/bug-report");

    await user.click(await screen.findByRole("button", { name: "Generate bug report" }));
    expect(screen.getByText("Describe what happened (at least 10 characters).")).toBeInTheDocument();
    expect(mock.find("POST", "/api/projects/p1/bug-reports")).toHaveLength(0);
  });

  it("rejects files it can't use", async () => {
    const user = userEvent.setup({ applyAccept: false });
    mockApi({ "GET /api/projects/p1": pncc, "GET /api/projects/p1/bug-reports": { items: [], total: 0 } });
    renderRoute("/projects/p1/tools/bug-report");

    await user.upload(await screen.findByLabelText("Add evidence files"), new File(["x"], "notes.pdf", { type: "application/pdf" }));
    expect(await screen.findByText(/only images \(PNG, JPG, WEBP\), videos and \.har files/)).toBeInTheDocument();
  });
});

describe("A saved bug report", () => {
  it("shows the Jira and Slack texts, saves edits and downloads a ZIP", async () => {
    const user = userEvent.setup();
    const mock = mockApi({
      "GET /api/projects/p1": pncc,
      "GET /api/projects/p1/bug-reports/r1": { data: savedReport() },
      "PATCH /api/projects/p1/bug-reports/r1": (call) => ({ data: savedReport({ severity: call.body.severity, texts: call.body.texts }) }),
      "GET /api/projects/p1/bug-reports/r1/files/f1?download=1": () => new Response(new Blob(["png"])),
      "GET /api/projects/p1/bug-reports/r1/files/f2?download=1": () => new Response(new Blob(["{}"])),
    });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    renderRoute("/projects/p1/tools/bug-report/r1");

    const result = await screen.findByRole("region", { name: "Generated bug report" });
    expect(within(result).getByLabelText("Jira summary (title)")).toHaveValue(report.title);
    expect(within(result).getByLabelText("Jira description").value).toContain("| POST | `/api/orders` | 500 Internal Server Error |");

    await user.click(within(result).getByRole("tab", { name: "Slack" }));
    expect(within(result).getByLabelText("Slack message").value.startsWith("Hi team,")).toBe(true);

    await user.selectOptions(within(result).getByLabelText("Severity"), "Minor");
    expect(within(result).getByLabelText("Slack message").value).toContain("*Severity:* Minor");
    await user.click(within(result).getByRole("button", { name: "Save changes" }));
    await screen.findByText("Changes saved.");
    const patch = mock.find("PATCH", "/api/projects/p1/bug-reports/r1")[0].body;
    expect(patch).toMatchObject({ severity: "Minor", title: report.title });
    expect(patch.texts.slack).toContain("*Severity:* Minor");

    await user.click(within(result).getByRole("button", { name: "Copy message" }));
    expect(await navigator.clipboard.readText()).toContain("Hi team,");

    // The folder's files.
    const folder = screen.getByRole("region", { name: "Files in this folder" });
    expect(within(folder).getByText("session-redacted.har")).toBeInTheDocument();
    expect(within(folder).getByText(/Screenshot · 4 B · seen by the AI/)).toBeInTheDocument();

    await user.click(within(result).getByRole("button", { name: "Download ZIP" }));
    await waitFor(() => expect(click).toHaveBeenCalled());
    expect(mock.find("GET", "/api/projects/p1/bug-reports/r1/files/f1?download=1")).toHaveLength(1);
    expect(URL.createObjectURL.mock.calls.at(-1)[0].type).toBe("application/zip");
    click.mockRestore();
  });

  it("deletes the report and its folder after confirming", async () => {
    const user = userEvent.setup();
    const mock = mockApi({
      "GET /api/projects/p1": pncc,
      "GET /api/projects/p1/bug-reports/r1": { data: savedReport() },
      "DELETE /api/projects/p1/bug-reports/r1": () => new Response(null, { status: 204 }),
      "GET /api/projects/p1/bug-reports": { items: [], total: 0 },
    });
    renderRoute("/projects/p1/tools/bug-report/r1");

    await user.click(await screen.findByRole("button", { name: "Delete folder" }));
    expect(screen.getByText(/folder \(2 files\) will be permanently deleted from storage/)).toBeInTheDocument();
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete folder" }));

    expect(await screen.findByText("Bug report and its folder deleted.")).toBeInTheDocument();
    expect(mock.find("DELETE", "/api/projects/p1/bug-reports/r1")).toHaveLength(1);
    expect(await screen.findByRole("heading", { name: "Bug report generator" })).toBeInTheDocument();
    expect(within(screen.getByRole("main")).getByRole("link", { name: "PNCC" })).toHaveAttribute("href", "/projects/p1");
  });

  it("shows progress while generating and Retry after a failure", async () => {
    const user = userEvent.setup();
    let current = savedReport({ status: "FAILED", error: "Generation was interrupted (the server restarted). Click Retry.", report: null, title: null });
    const mock = mockApi({
      "GET /api/projects/p1": pncc,
      "GET /api/projects/p1/bug-reports/r1": () => ({ data: current }),
      "POST /api/projects/p1/bug-reports/r1/retry": () => {
        current = savedReport({ status: "PENDING", report: null, title: null });
        return { data: { id: "r1", status: "PENDING" } };
      },
    });
    renderRoute("/projects/p1/tools/bug-report/r1");

    expect(await screen.findByText(/interrupted \(the server restarted\)/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText(/The AI is writing this report/)).toBeInTheDocument();
    expect(mock.find("POST", "/api/projects/p1/bug-reports/r1/retry")).toHaveLength(1);
  });

  it("is read-only for someone who didn't create it", async () => {
    mockApi({
      "GET /api/projects/p1": pncc,
      "GET /api/auth/status": { setupRequired: false, user: signedInUser({ id: "u2", role: "MEMBER" }) },
      "GET /api/projects/p1/bug-reports/r1": { data: savedReport() },
    });
    renderRoute("/projects/p1/tools/bug-report/r1");

    const result = await screen.findByRole("region", { name: "Generated bug report" });
    expect(screen.queryByRole("button", { name: "Delete folder" })).not.toBeInTheDocument();
    expect(within(result).queryByRole("button", { name: /Save/ })).not.toBeInTheDocument();
    expect(within(result).getByRole("button", { name: "Download ZIP" })).toBeInTheDocument();
  });
});

describe("HAR reader", () => {
  const savedHar = {
    id: "h1",
    name: "session.har",
    size: 100,
    summary: {
      total: 5,
      failedCount: 3,
      durationMs: 5400,
      totalBytes: 10,
      capturedAt: null,
      classCounts: { "2xx": 2, "3xx": 0, "4xx": 1, "5xx": 1, failed: 1 },
      topErrors: [{ method: "POST", path: "/api/orders", status: 500 }],
    },
    createdAt: "2026-11-23T05:00:00.000Z",
    createdBy: { id: "u1", name: "Ada Admin" },
  };

  it("reads a HAR, saves a redacted copy to the library and opens it", async () => {
    const user = userEvent.setup();
    const mock = mockApi({
      "GET /api/projects/p1": pncc,
      "GET /api/projects/p1/har-files": { items: [], total: 0 },
      "POST /api/projects/p1/har-files": { data: savedHar },
      "GET /api/projects/p1/har-files/h1": { data: savedHar },
    });
    renderRoute("/projects/p1/tools/har-reader");

    await user.upload(await screen.findByLabelText("Choose HAR file"), harFile());
    expect(await screen.findByText("Saved to the HAR library.")).toBeInTheDocument();

    const saved = mock.find("POST", "/api/projects/p1/har-files")[0].body;
    const savedSummary = JSON.parse(saved.get("summary"));
    expect(savedSummary).toMatchObject({ total: 5, failedCount: 3 });
    expect(savedSummary.topErrors[0]).toEqual({ method: "POST", path: "/api/orders", status: 500 });
    const text = await readBlob(saved.get("file"));
    expect(text).not.toContain("hunter2");
    expect(text).not.toContain("sid=xyz");

    // Now on the saved file's page, without downloading it again.
    expect(await screen.findByRole("heading", { name: "session.har" })).toBeInTheDocument();
    const summary = await screen.findByRole("region", { name: "HAR summary" });
    expect(within(summary).getByText("5xx: 1")).toBeInTheDocument();

    // The plain-language explanation, with a paragraph for the lead.
    const explained = screen.getByRole("region", { name: "What happened" });
    expect(within(explained).getByText(/The main problem: POST \/api\/orders → 500 Internal Server Error/)).toBeInTheDocument();
    expect(within(explained).getByText("3 problems, most important first")).toBeInTheDocument();
    expect(within(explained).getAllByText("Backend / API team").length).toBeGreaterThan(0);
    await user.click(within(explained).getByRole("button", { name: "Copy" }));
    expect(await navigator.clipboard.readText()).toContain("I recorded the network traffic (HAR)");

    const failed = screen.getByRole("region", { name: "Failed requests" });
    expect(within(failed).getByText("“Payment gateway timeout”")).toBeInTheDocument();

    const detail = screen.getByRole("region", { name: "Request details" });
    expect(within(detail).getAllByText("[REDACTED]").length).toBeGreaterThan(0);
    await user.click(within(detail).getByRole("tab", { name: "Response" }));
    expect(within(detail).getByText(/"message": "Payment gateway timeout"/)).toBeInTheDocument();

    const table = screen.getByRole("region", { name: "Requests" });
    await user.click(within(table).getByRole("button", { name: "4xx" }));
    expect(within(table).getByText("1 of 5")).toBeInTheDocument();
  });

  it("opens a saved HAR from the library and deletes it with its folder", async () => {
    const user = userEvent.setup();
    const mock = mockApi({
      "GET /api/projects/p1": pncc,
      "GET /api/projects/p1/har-files": { items: [savedHar], total: 1 },
      "GET /api/projects/p1/har-files/h1": { data: savedHar },
      "GET /api/projects/p1/har-files/h1/file": () => new Response(sampleHarText()),
      "DELETE /api/projects/p1/har-files/h1": () => new Response(null, { status: 204 }),
    });
    renderRoute("/projects/p1/tools/har-reader");

    const library = await screen.findByRole("region", { name: "HAR library" });
    expect(await within(library).findByText(/3 failed/)).toBeInTheDocument();
    expect(within(library).getByText("500 POST /api/orders")).toBeInTheDocument();
    await user.click(within(library).getByRole("link", { name: "session.har" }));

    expect(await screen.findByRole("region", { name: "HAR summary" })).toBeInTheDocument();
    expect(mock.find("GET", "/api/projects/p1/har-files/h1/file")).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Delete folder" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete folder" }));
    expect(await screen.findByText("HAR file and its folder deleted.")).toBeInTheDocument();
    expect(mock.find("DELETE", "/api/projects/p1/har-files/h1")).toHaveLength(1);
  });

  it("still shows a file it couldn't save, and explains a file that is not a HAR", async () => {
    const user = userEvent.setup();
    mockApi({
      "GET /api/projects/p1": pncc,
      "GET /api/projects/p1/har-files": { items: [], total: 0 },
      "POST /api/projects/p1/har-files": () => new Response(JSON.stringify({ error: { code: "X", message: "Disk full" } }), { status: 500 }),
    });
    renderRoute("/projects/p1/tools/har-reader");

    await user.upload(await screen.findByLabelText("Choose HAR file"), harFile());
    expect(await screen.findByText(/couldn't be saved: Disk full/)).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "HAR summary" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Open another file" }));
    await user.upload(screen.getByLabelText("Choose HAR file"), new File(["nope"], "x.har"));
    expect(await screen.findByRole("alert")).toHaveTextContent("not a valid HAR file");
  });

  it("both tools are in the sidebar, for the project you're in", async () => {
    mockApi({ "GET /api/projects/p1": pncc, "GET /api/projects/p1/test-cases": { items: [], total: 0 } });
    renderRoute("/projects/p1");
    const sidebar = await screen.findByRole("complementary", { name: "Primary" });
    expect(await within(sidebar).findByRole("link", { name: "HAR reader" })).toHaveAttribute("href", "/projects/p1/tools/har-reader");
    expect(within(sidebar).getByRole("link", { name: "Bug report" })).toHaveAttribute("href", "/projects/p1/tools/bug-report");
  });
});

describe("Keeping projects apart", () => {
  const fiber = project({ id: "p2", name: "Fiber", urls: [], urlCount: 0 });

  it("on Fiber, PNCC's bug reports and HAR files are not shown", async () => {
    const mock = mockApi({
      "GET /api/projects/p2": fiber,
      "GET /api/projects/p2/bug-reports": { items: [], total: 0 },
      "GET /api/projects/p1/bug-reports": { items: [listItem()], total: 1 },
    });
    renderRoute("/projects/p2/tools/bug-report");

    const saved = await screen.findByRole("region", { name: "Saved bug reports" });
    expect(await within(saved).findByText("No bug reports yet")).toBeInTheDocument();
    expect(screen.queryByText(/Order fails with 500/)).not.toBeInTheDocument();
    expect(mock.calls.some((call) => call.url.startsWith("/api/projects/p1/"))).toBe(false);
  });

  it("a bug report link from another project shows not found", async () => {
    mockApi({
      "GET /api/projects/p2": fiber,
      // The server answers 404: the report belongs to PNCC.
      "GET /api/projects/p2/bug-reports/r1": () =>
        new Response(JSON.stringify({ error: { code: "NOT_FOUND", message: "Bug report not found" } }), { status: 404 }),
    });
    renderRoute("/projects/p2/tools/bug-report/r1");

    expect(await screen.findByText("Bug report not found")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Generated bug report" })).not.toBeInTheDocument();
  });

  it("saves a new bug report to the project it was made in", async () => {
    const user = userEvent.setup();
    const mock = mockApi({
      "GET /api/projects/p2": fiber,
      "GET /api/projects/p2/bug-reports": { items: [], total: 0 },
      "POST /api/projects/p2/bug-reports": { data: { id: "r9", status: "PENDING" } },
      "GET /api/projects/p2/bug-reports/r9": { data: savedReport({ id: "r9" }) },
    });
    renderRoute("/projects/p2/tools/bug-report");

    await user.type(await screen.findByLabelText("Describe the bug"), "Fiber activation page shows a blank screen.");
    await user.click(screen.getByRole("button", { name: "Generate bug report" }));

    const tray = await screen.findByRole("complementary", { name: "Background activity" });
    expect(await within(tray).findByRole("link", { name: "Open report" })).toHaveAttribute(
      "href",
      "/projects/p2/tools/bug-report/r9",
    );
    expect(within(tray).getByText(/Bug report · Fiber/)).toBeInTheDocument();
    expect(mock.find("POST", "/api/projects/p2/bug-reports")).toHaveLength(1);
  });
});
