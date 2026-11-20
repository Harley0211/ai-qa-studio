import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { mockApi, project, renderRoute } from "../../test/utils.jsx";

const testCase = (id, runStatus) => ({
  id,
  caseId: id.toUpperCase(),
  title: `Case ${id}`,
  steps: "1. Open page",
  expectedResult: "Page opens",
  runStatus,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

function mockProject(items = []) {
  return mockApi({
    "GET /api/projects/p1": project({ urls: [], urlCount: 0, evidenceCount: 3 }),
    "GET /api/projects/p1/test-cases": { items, total: items.length },
  });
}

describe("Project overview", () => {
  it("shows the start generating options", async () => {
    mockProject();
    renderRoute("/projects/p1");

    const section = await screen.findByRole("region", { name: "Start generating" });

    expect(within(section).getByText("3 images uploaded")).toBeInTheDocument();
    expect(within(section).getByRole("link", { name: "Open tool" })).toHaveAttribute(
      "href",
      "/tools/image-to-test-cases?project=p1",
    );
    expect(within(section).getByRole("button", { name: "Not available yet" })).toBeDisabled();
  });

  it("shows an execution summary of the project's test cases", async () => {
    mockProject([
      testCase("tc1", "Passed"),
      testCase("tc2", "Failed"),
      testCase("tc3", "Not Run"),
    ]);
    renderRoute("/projects/p1");

    const heading = await screen.findByRole("heading", { name: "Execution summary" });
    const summary = heading.closest("section");
    const value = (label) => within(summary).getByText(label).nextElementSibling;

    await within(summary).findByText("3");
    expect(value("Total")).toHaveTextContent("3");
    expect(value("Passed")).toHaveTextContent("1");
    expect(value("Failed")).toHaveTextContent("1");
    expect(value("Blocked")).toHaveTextContent("0");
    expect(value("Not Run")).toHaveTextContent("1");
  });

  it("opens the create form from Write manually", async () => {
    const user = userEvent.setup();
    mockProject();
    renderRoute("/projects/p1");

    await user.click(await screen.findByRole("link", { name: "Add test case" }));

    expect(
      await screen.findByRole("dialog", { name: "Create test case" }),
    ).toBeInTheDocument();
  });
});
