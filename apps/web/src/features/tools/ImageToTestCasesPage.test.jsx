import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { mockApi, project, renderRoute } from "../../test/utils.jsx";

const evidence = (items) => ({ items, total: items.length });
const image = (id, filename) => ({
  id,
  filename,
  fileSize: 1024,
  createdAt: "2026-01-01T00:00:00.000Z",
});

const alpha = project({ id: "p1", name: "Alpha" });
const beta = project({ id: "p2", name: "Beta" });

describe("Image → Test cases tool", () => {
  it("works in the project you're in, with the chosen format and focus", async () => {
    const user = userEvent.setup();
    let pending = { items: [], total: 0 };
    const mock = mockApi({
      "GET /api/projects/p1": alpha,
      "GET /api/projects/p1/evidence": evidence([image("e1", "login.png")]),
      "GET /api/projects/p1/generations?review=pending": () => pending,
      "POST /api/projects/p1/generations": () => {
        pending = {
          items: [{ id: "run1", completedAt: "2026-01-01T00:00:00.000Z", draftCount: 1 }],
          total: 1,
        };
        return { data: { id: "run1", status: "PENDING" } };
      },
      "GET /api/projects/p1/generations/run1": {
        data: {
          id: "run1",
          status: "SUCCEEDED",
          reviewStatus: "PENDING_REVIEW",
          drafts: [
            {
              index: 0,
              title: "Generated login case",
              steps: "1. Open page",
              expectedResult: "Page opens",
              stepExpectedResults: null,
            },
          ],
        },
      },
    });

    renderRoute("/projects/p1/tools/image-to-test-cases");

    expect(await screen.findByAltText("login.png")).toBeInTheDocument();
    const main = screen.getByRole("main");
    expect(within(main).getByRole("link", { name: "Alpha" })).toHaveAttribute("href", "/projects/p1");
    // No project switcher inside the tool: you switch from the project picker.
    expect(within(main).queryByRole("combobox", { name: "Project" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: /Expected result per step/ }));
    await user.click(screen.getByRole("button", { name: "Negative" }));
    await user.click(within(main).getByRole("button", { name: "Generate from 1 image" }));

    expect(await screen.findByText("Test case generation started.")).toBeInTheDocument();

    const body = mock.find("POST", "/api/projects/p1/generations")[0].body;
    expect(body.evidenceIds).toEqual(["e1"]);
    expect(body.generationFormat).toBe("PER_STEP");
    expect(body.message).toContain("Focus especially on these test types: Functional, Negative.");

    // Finished runs go to review instead of straight into the library.
    expect(await screen.findByText("Test cases are ready to review.")).toBeInTheDocument();
    expect(await screen.findByText("Generated login case")).toBeInTheDocument();
    expect(mock.find("POST", "/api/projects/p1/generations/run1/accept")).toHaveLength(0);
  });

  it("only shows the evidence of the project in the URL", async () => {
    const mock = mockApi({
      "GET /api/projects/p2": beta,
      "GET /api/projects/p2/evidence": evidence([image("e2", "beta.png")]),
      "GET /api/projects/p2/generations?review=pending": { items: [], total: 0 },
    });

    renderRoute("/projects/p2/tools/image-to-test-cases");

    expect(await screen.findByAltText("beta.png")).toBeInTheDocument();
    expect(screen.getByText(/Turn screenshots into test cases for Beta/)).toBeInTheDocument();
    expect(mock.calls.some((call) => call.url.includes("/projects/p1/"))).toBe(false);
  });

  it("disables generation until an image is uploaded", async () => {
    mockApi({
      "GET /api/projects/p1": alpha,
      "GET /api/projects/p1/evidence": evidence([]),
    });

    renderRoute("/projects/p1/tools/image-to-test-cases");

    expect(await screen.findByText("No images uploaded for this project yet.")).toBeInTheDocument();
    expect(within(screen.getByRole("main")).getByRole("button", { name: "Generate from 0 images" })).toBeDisabled();
    expect(screen.getByText("Upload at least one image to start.")).toBeInTheDocument();
  });

  it("pre-selects only new images and sends just those", async () => {
    const user = userEvent.setup();
    const mock = mockApi({
      "GET /api/projects/p1": alpha,
      "GET /api/projects/p1/evidence": evidence([
        { ...image("e2", "new.png"), lastUsedAt: null },
        { ...image("e1", "old.png"), lastUsedAt: "2026-01-01T10:00:00.000Z" },
      ]),
      "GET /api/projects/p1/generations?review=pending": { items: [], total: 0 },
      "POST /api/projects/p1/generations": { data: { id: "run1", status: "PENDING" } },
      "GET /api/projects/p1/generations/run1": { data: { id: "run1", status: "PENDING" } },
    });

    renderRoute("/projects/p1/tools/image-to-test-cases");

    expect(await screen.findByRole("checkbox", { name: "Use new.png" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Use old.png" })).not.toBeChecked();

    await user.click(within(screen.getByRole("main")).getByRole("button", { name: "Generate from 1 image" }));
    await screen.findByText("Test case generation started.");
    expect(mock.find("POST", "/api/projects/p1/generations")[0].body.evidenceIds).toEqual(["e2"]);
  });

  it("limits a generation to 20 images", async () => {
    const user = userEvent.setup();
    const many = Array.from({ length: 21 }, (_, i) => image(`e${i}`, `screen-${i}.png`));
    mockApi({
      "GET /api/projects/p1": alpha,
      "GET /api/projects/p1/evidence": evidence(many),
      "GET /api/projects/p1/generations?review=pending": { items: [], total: 0 },
    });

    renderRoute("/projects/p1/tools/image-to-test-cases");

    const generate = await within(await screen.findByRole("main")).findByRole("button", {
      name: "Generate from 21 images",
    });
    expect(generate).toBeDisabled();
    expect(screen.getByText("Select at most 20 images (21 selected).")).toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: "Use screen-0.png" }));
    expect(within(screen.getByRole("main")).getByRole("button", { name: "Generate from 20 images" })).toBeEnabled();
  });

  it("says so when the project doesn't exist", async () => {
    mockApi();
    renderRoute("/projects/gone/tools/image-to-test-cases");

    expect(await screen.findByText("Project not found")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Choose a project" })).toHaveAttribute("href", "/projects");
  });

  it("sends old tool links to the project picker", async () => {
    mockApi({ "GET /api/projects": { items: [alpha], total: 1 } });
    renderRoute("/tools/image-to-test-cases?project=p1");

    expect(await screen.findByRole("heading", { name: "Choose a project" })).toBeInTheDocument();
  });
});

describe("Sidebar tools", () => {
  it("inside a project, shows the project and links every tool to it", async () => {
    mockApi({
      "GET /api/projects/p1": project({ urls: [], urlCount: 0 }),
      "GET /api/projects/p1/test-cases": { items: [], total: 0 },
    });

    renderRoute("/projects/p1");

    const sidebar = await screen.findByRole("complementary", { name: "Primary" });
    expect(await within(sidebar).findByRole("link", { name: "Alpha" })).toHaveAttribute("href", "/projects/p1");
    expect(within(sidebar).getByRole("link", { name: "Switch project" })).toHaveAttribute("href", "/projects");
    expect(within(sidebar).getByRole("link", { name: "From image evidence" })).toHaveAttribute(
      "href",
      "/projects/p1/tools/image-to-test-cases",
    );
    expect(within(sidebar).getByRole("link", { name: "From PRD / document" })).toHaveAttribute(
      "href",
      "/projects/p1/tools/prd-to-test-cases",
    );
    expect(within(sidebar).getByRole("link", { name: "Bug report" })).toHaveAttribute("href", "/projects/p1/tools/bug-report");
    expect(within(sidebar).getByRole("link", { name: "HAR reader" })).toHaveAttribute("href", "/projects/p1/tools/har-reader");
  });

  it("locks the tools until a project is chosen", async () => {
    mockApi({ "GET /api/projects": { items: [alpha], total: 1 } });

    renderRoute("/projects");

    const sidebar = await screen.findByRole("complementary", { name: "Primary" });
    const locked = within(sidebar).getByRole("group", { name: "Tools (choose a project first)" });
    expect(within(locked).getByText("Choose a project to use the tools.")).toBeInTheDocument();
    for (const name of ["From image evidence", "From PRD / document", "Bug report", "HAR reader"]) {
      expect(within(sidebar).queryByRole("link", { name })).not.toBeInTheDocument();
      expect(within(locked).getByText(name)).toHaveAttribute("aria-disabled", "true");
    }
  });

  it("collapses and expands the tools group", async () => {
    const user = userEvent.setup();
    mockApi({
      "GET /api/projects/p1": project({ urls: [], urlCount: 0 }),
      "GET /api/projects/p1/test-cases": { items: [], total: 0 },
    });

    renderRoute("/projects/p1");

    const sidebar = await screen.findByRole("complementary", { name: "Primary" });
    const toggle = await within(sidebar).findByRole("button", { name: "Generate test cases" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    await user.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(within(sidebar).queryByRole("link", { name: "From image evidence" })).not.toBeInTheDocument();
  });
});
