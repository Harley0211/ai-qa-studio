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

const projects = {
  items: [
    project({ id: "p1", name: "Alpha" }),
    project({ id: "p2", name: "Beta" }),
  ],
  total: 2,
};

describe("Image → Test cases tool", () => {
  it("defaults to the first project and generates with the chosen format and focus", async () => {
    const user = userEvent.setup();
    const mock = mockApi({
      "GET /api/projects": projects,
      "GET /api/projects/p1/evidence": evidence([image("e1", "login.png")]),
      "POST /api/projects/p1/generations": { data: { id: "run1", status: "PENDING" } },
      "GET /api/projects/p1/generations/run1": { data: { id: "run1", status: "SUCCEEDED" } },
    });

    renderRoute("/tools/image-to-test-cases");

    expect(await screen.findByAltText("login.png")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Project" })).toHaveValue("p1");

    await user.click(screen.getByRole("radio", { name: /Expected result per step/ }));
    await user.click(screen.getByRole("button", { name: "Negative" }));
    // The sidebar group toggle shares this label, so look inside the main area.
    await user.click(
      within(screen.getByRole("main")).getByRole("button", { name: "Generate test cases" }),
    );

    expect(await screen.findByText("Test case generation started.")).toBeInTheDocument();

    const body = mock.find("POST", "/api/projects/p1/generations")[0].body;
    expect(body.evidenceIds).toEqual(["e1"]);
    expect(body.generationFormat).toBe("PER_STEP");
    expect(body.message).toContain(
      "Focus especially on these test types: Functional, Negative.",
    );

    expect(await screen.findByRole("link", { name: "View test cases" })).toHaveAttribute(
      "href",
      "/projects/p1/test-cases",
    );
  });

  it("uses the project from the URL and lets you switch projects", async () => {
    const user = userEvent.setup();
    mockApi({
      "GET /api/projects": projects,
      "GET /api/projects/p1/evidence": evidence([image("e1", "alpha.png")]),
      "GET /api/projects/p2/evidence": evidence([image("e2", "beta.png")]),
    });

    renderRoute("/tools/image-to-test-cases?project=p2");

    expect(await screen.findByAltText("beta.png")).toBeInTheDocument();

    await user.selectOptions(screen.getByRole("combobox", { name: "Project" }), "p1");

    expect(await screen.findByAltText("alpha.png")).toBeInTheDocument();
    expect(screen.queryByAltText("beta.png")).not.toBeInTheDocument();
  });

  it("disables generation until an image is uploaded", async () => {
    mockApi({
      "GET /api/projects": projects,
      "GET /api/projects/p1/evidence": evidence([]),
    });

    renderRoute("/tools/image-to-test-cases?project=p1");

    expect(
      await screen.findByText("No images uploaded for this project yet."),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("main")).getByRole("button", { name: "Generate test cases" }),
    ).toBeDisabled();
    expect(screen.getByText("Upload at least one image to start.")).toBeInTheDocument();
  });

  it("asks you to create a project when there are none", async () => {
    mockApi({ "GET /api/projects": { items: [], total: 0 } });

    renderRoute("/tools/image-to-test-cases");

    expect(await screen.findByText("No projects yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to projects" })).toHaveAttribute(
      "href",
      "/projects",
    );
  });
});

describe("Sidebar tools", () => {
  it("links to the image tool for the current project and marks PRD as coming soon", async () => {
    mockApi({
      "GET /api/projects/p1": project({ urls: [], urlCount: 0 }),
      "GET /api/projects/p1/test-cases": { items: [], total: 0 },
    });

    renderRoute("/projects/p1");

    const sidebar = await screen.findByRole("complementary", { name: "Primary" });
    expect(
      within(sidebar).getByRole("link", { name: "From image evidence" }),
    ).toHaveAttribute("href", "/tools/image-to-test-cases?project=p1");

    const prd = within(sidebar).getByText("From PRD / document");
    expect(prd.closest("[aria-disabled]")).toHaveAttribute("aria-disabled", "true");
    expect(within(sidebar).queryByRole("link", { name: /PRD/ })).not.toBeInTheDocument();
  });

  it("collapses and expands the tools group", async () => {
    const user = userEvent.setup();
    mockApi({ "GET /api/projects": { items: [], total: 0 } });

    renderRoute("/projects");

    const toggle = await screen.findByRole("button", { name: "Generate test cases" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    await user.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("link", { name: "From image evidence" })).not.toBeInTheDocument();
  });
});
