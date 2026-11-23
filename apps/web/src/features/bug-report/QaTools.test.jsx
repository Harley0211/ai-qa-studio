import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockApi, renderRoute } from "../../test/utils.jsx";
import { sampleHarText } from "../har/harFixture.js";

vi.mock("./videoFrames.js", async (importOriginal) => ({
  ...(await importOriginal()),
  extractFrames: vi.fn(async () => [
    { blob: new Blob(["frame1"], { type: "image/jpeg" }), time: 2 },
    { blob: new Blob(["frame2"], { type: "image/jpeg" }), time: 4 },
  ]),
}));

const harFile = () => new File([sampleHarText()], "session.har", { type: "application/json" });
const pngFile = () => new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "cart.png", { type: "image/png" });
const videoFile = () => new File(["video"], "checkout.mp4", { type: "video/mp4" });

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

beforeEach(() => {
  // jsdom has no object URLs (used for image previews and downloads).
  URL.createObjectURL = vi.fn(() => "blob:preview");
  URL.revokeObjectURL = vi.fn();
});

describe("HAR reader", () => {
  it("summarises a HAR file and shows each request", async () => {
    const user = userEvent.setup();
    mockApi();
    renderRoute("/tools/har-reader");

    await user.upload(await screen.findByLabelText("Choose HAR file"), harFile());

    const summary = await screen.findByRole("region", { name: "HAR summary" });
    expect(within(summary).getByText("5")).toBeInTheDocument();
    expect(within(summary).getByText("5xx: 1")).toBeInTheDocument();

    const failed = screen.getByRole("region", { name: "Failed requests" });
    expect(within(failed).getByText("3 failed requests")).toBeInTheDocument();
    expect(within(failed).getByText("“Payment gateway timeout”")).toBeInTheDocument();

    // The most serious error opens first, with secrets hidden.
    const detail = screen.getByRole("region", { name: "Request details" });
    expect(within(detail).getByText(/POST https:\/\/shop.example\/api\/orders/)).toBeInTheDocument();
    expect(within(detail).getAllByText("[REDACTED]").length).toBeGreaterThan(0);
    await user.click(within(detail).getByLabelText("Hide secrets"));
    expect(within(detail).getByText(/^Bearer eyJ/)).toBeInTheDocument();

    await user.click(within(detail).getByRole("tab", { name: "Response" }));
    expect(within(detail).getByText(/"message": "Payment gateway timeout"/)).toBeInTheDocument();

    const table = screen.getByRole("region", { name: "Requests" });
    expect(within(table).getByText("5 of 5")).toBeInTheDocument();
    await user.click(within(table).getByRole("button", { name: "4xx" }));
    expect(within(table).getByText("1 of 5")).toBeInTheDocument();
    await user.type(within(table).getByLabelText("Search URL"), "nothing-matches");
    expect(within(table).getByText("No matching requests.")).toBeInTheDocument();
  });

  it("explains a file that is not a HAR", async () => {
    const user = userEvent.setup();
    mockApi();
    renderRoute("/tools/har-reader");

    await user.upload(await screen.findByLabelText("Choose HAR file"), new File(["nope"], "x.har"));
    expect(await screen.findByRole("alert")).toHaveTextContent("not a valid HAR file");
  });

  it("is in the sidebar", async () => {
    mockApi({ "GET /api/projects": { items: [], total: 0 } });
    renderRoute("/projects");
    const sidebar = await screen.findByRole("complementary", { name: "Primary" });
    expect(within(sidebar).getByRole("link", { name: "HAR reader" })).toHaveAttribute("href", "/tools/har-reader");
    expect(within(sidebar).getByRole("link", { name: "Bug report" })).toHaveAttribute("href", "/tools/bug-report");
  });
});

describe("Bug report generator", () => {
  function mockReportApi(job = { id: "j1", status: "SUCCEEDED", report }) {
    return mockApi({
      "POST /api/bug-reports": { data: { id: "j1", status: "PENDING" } },
      "GET /api/bug-reports/j1": { data: job },
    });
  }

  it("sends the description, images, video frames and HAR errors, and shows Jira and Slack texts", async () => {
    const user = userEvent.setup();
    const mock = mockReportApi();
    renderRoute("/tools/bug-report");

    await user.type(
      await screen.findByLabelText("Describe the bug"),
      "Place order shows an error toast and no order is created.",
    );
    await user.type(screen.getByLabelText("Page / URL"), "https://shop.example/cart");
    await user.upload(screen.getByLabelText("Add evidence files"), [pngFile(), videoFile(), harFile()]);

    // The HAR's errors show up right away.
    expect(await screen.findByText(/5 requests, 3 failed/)).toBeInTheDocument();
    expect(screen.getByText(/2 frames|4 frames from each video/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Generate bug report" }));
    const result = await screen.findByRole("region", { name: "Generated bug report" });

    const body = mock.find("POST", "/api/bug-reports")[0].body;
    const details = JSON.parse(body.get("details"));
    expect(details.description).toContain("Place order");
    expect(details.environment.url).toBe("https://shop.example/cart");
    expect(details.harFacts).toContain('"Payment gateway timeout"');
    expect(details.imageNotes).toEqual([
      "Screenshot cart.png",
      "Frame 1 of video checkout.mp4 at 0:02",
      "Frame 2 of video checkout.mp4 at 0:04",
    ]);
    expect(body.getAll("images")).toHaveLength(3);
    expect(details.attachments.map((a) => a.kind)).toEqual(["image", "video", "har"]);

    expect(within(result).getByLabelText("Jira summary (title)")).toHaveValue(report.title);
    const jira = within(result).getByLabelText("Jira description");
    expect(jira.value).toContain("## Root cause analysis");
    expect(jira.value).toContain("| POST |");

    await user.click(within(result).getByRole("button", { name: "Jira Server / Data Center (wiki)" }));
    expect(within(result).getByLabelText("Jira description").value).toContain("h2. Summary");

    await user.click(within(result).getByRole("tab", { name: "Slack" }));
    const slack = within(result).getByLabelText("Slack message");
    expect(slack.value.startsWith("Hi team,")).toBe(true);
    expect(slack.value).toContain("*Severity:* Critical");

    await user.selectOptions(within(result).getByLabelText("Severity"), "Minor");
    expect(within(result).getByLabelText("Slack message").value).toContain("*Severity:* Minor");

    await user.click(within(result).getByRole("button", { name: "Copy message" }));
    expect(await navigator.clipboard.readText()).toContain("Hi team,");
  });

  it("downloads a ZIP", async () => {
    const user = userEvent.setup();
    mockReportApi();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    renderRoute("/tools/bug-report");

    await user.type(await screen.findByLabelText("Describe the bug"), "The Save button does nothing.");
    await user.upload(screen.getByLabelText("Add evidence files"), [harFile()]);
    await screen.findByText(/5 requests, 3 failed/);
    await user.click(screen.getByRole("button", { name: "Generate bug report" }));
    const result = await screen.findByRole("region", { name: "Generated bug report" });

    await user.click(within(result).getByRole("button", { name: "Download ZIP" }));
    await waitFor(() => expect(click).toHaveBeenCalled());
    const zip = URL.createObjectURL.mock.calls.at(-1)[0];
    expect(zip.type).toBe("application/zip");
    click.mockRestore();
  });

  it("asks for a description and reports a failed generation", async () => {
    const user = userEvent.setup();
    const mock = mockReportApi({ id: "j1", status: "FAILED", error: "Cannot reach the AI model (Ollama). Make sure Ollama is running" });
    renderRoute("/tools/bug-report");

    await user.click(await screen.findByRole("button", { name: "Generate bug report" }));
    expect(screen.getByText("Describe what happened (at least 10 characters).")).toBeInTheDocument();
    expect(mock.find("POST", "/api/bug-reports")).toHaveLength(0);

    await user.type(screen.getByLabelText("Describe the bug"), "Login button does nothing at all.");
    await user.click(screen.getByRole("button", { name: "Generate bug report" }));
    expect(await screen.findByText(/Cannot reach the AI model/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate bug report" })).toBeEnabled();
  });

  it("rejects files it can't use", async () => {
    const user = userEvent.setup({ applyAccept: false });
    mockReportApi();
    renderRoute("/tools/bug-report");

    await user.upload(await screen.findByLabelText("Add evidence files"), new File(["x"], "notes.pdf", { type: "application/pdf" }));
    expect(await screen.findByText(/only images \(PNG, JPG, WEBP\), videos and \.har files/)).toBeInTheDocument();
  });
});
