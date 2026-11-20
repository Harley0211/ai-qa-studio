import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { mockApi, project, renderRoute } from "../../test/utils.jsx";

const PENDING_URL = "GET /api/projects/p1/generations?review=pending";

const drafts = [
  {
    index: 0,
    title: "Login with valid credentials",
    description: "Happy path",
    precondition: null,
    steps: "1. Open login page\n2. Submit",
    data: null,
    expectedResult: "Dashboard is shown",
    stepExpectedResults: null,
  },
  {
    index: 1,
    title: "Login with wrong password",
    description: null,
    precondition: null,
    steps: "1. Open login page\n2. Submit wrong password",
    data: null,
    expectedResult: "",
    stepExpectedResults: ["Login page opens", "Error is shown"],
  },
];

function mockReview(overrides = {}) {
  let pending = {
    items: [{ id: "run1", completedAt: "2026-01-01T00:00:00.000Z", draftCount: 2 }],
    total: 1,
  };

  const mock = mockApi({
    "GET /api/projects": { items: [project({ id: "p1", name: "Alpha" })], total: 1 },
    "GET /api/projects/p1/evidence": { items: [], total: 0 },
    [PENDING_URL]: () => pending,
    "GET /api/projects/p1/generations/run1": {
      data: { id: "run1", status: "SUCCEEDED", reviewStatus: "PENDING_REVIEW", drafts },
    },
    "POST /api/projects/p1/generations/run1/accept": (call) => {
      pending = { items: [], total: 0 };
      return {
        data: {
          createdCount: call.body.indexes.length,
          discardedCount: 2 - call.body.indexes.length,
          caseIds: call.body.indexes.map((_, i) => `TC-000${i + 1}`),
        },
      };
    },
    "POST /api/projects/p1/generations/run1/discard": () => {
      pending = { items: [], total: 0 };
      return { data: { discardedCount: 2 } };
    },
    ...overrides,
  });

  return mock;
}

async function openReview() {
  renderRoute("/tools/image-to-test-cases?project=p1");
  return screen.findByRole("region", { name: "Review generated test cases" });
}

describe("Reviewing generated test cases", () => {
  it("lists the drafts with every case selected by default", async () => {
    mockReview();
    const review = await openReview();

    expect(await within(review).findByText("Login with valid credentials")).toBeInTheDocument();
    expect(within(review).getByText("2 test cases ready to review")).toBeInTheDocument();
    expect(within(review).getByRole("checkbox", { name: "Select Login with valid credentials" })).toBeChecked();
    expect(within(review).getByRole("checkbox", { name: "Select Login with wrong password" })).toBeChecked();
    expect(within(review).getByRole("button", { name: "Add 2 to library" })).toBeEnabled();

    // Format chips and details reuse the library's rendering.
    expect(within(review).getByText("Overall")).toBeInTheDocument();
    expect(within(review).getByText("Per step")).toBeInTheDocument();
  });

  it("shows per-step drafts as a step table", async () => {
    const user = userEvent.setup();
    mockReview();
    const review = await openReview();

    await within(review).findByText("Login with wrong password");
    const [, perStepDetails] = within(review).getAllByText("View details");
    await user.click(perStepDetails);

    const table = within(review).getByRole("table");
    expect(within(table).getByText("Error is shown")).toBeInTheDocument();
  });

  it("adds only the selected cases to the library", async () => {
    const user = userEvent.setup();
    const mock = mockReview();
    const review = await openReview();

    await user.click(
      await within(review).findByRole("checkbox", { name: "Select Login with valid credentials" }),
    );
    await user.click(within(review).getByRole("button", { name: "Add 1 to library" }));

    expect(await screen.findByText("1 test case added to the library.")).toBeInTheDocument();
    expect(mock.find("POST", "/api/projects/p1/generations/run1/accept")[0].body).toEqual({
      indexes: [1],
    });

    expect(await screen.findByText("Added TC-0001 to the library.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View test cases" })).toHaveAttribute(
      "href",
      "/projects/p1/test-cases",
    );
    expect(screen.queryByText("2 test cases ready to review")).not.toBeInTheDocument();
  });

  it("disables adding when nothing is selected", async () => {
    const user = userEvent.setup();
    mockReview();
    const review = await openReview();

    const selectAll = await within(review).findByRole("checkbox", { name: "Select all" });
    await within(review).findByText("Login with valid credentials");
    await user.click(selectAll);

    expect(within(review).getByRole("button", { name: "Add 0 to library" })).toBeDisabled();

    await user.click(selectAll);
    expect(within(review).getByRole("button", { name: "Add 2 to library" })).toBeEnabled();
  });

  it("discards all drafts after confirmation", async () => {
    const user = userEvent.setup();
    const mock = mockReview();
    const review = await openReview();

    await within(review).findByText("Login with valid credentials");
    await user.click(within(review).getByRole("button", { name: "Discard all" }));

    const dialog = screen.getByRole("dialog", { name: "Discard generated test cases?" });
    await user.click(within(dialog).getByRole("button", { name: "Discard all" }));

    expect(await screen.findByText("Generated test cases discarded.")).toBeInTheDocument();
    expect(mock.find("POST", "/api/projects/p1/generations/run1/discard")).toHaveLength(1);
    expect(mock.find("POST", "/api/projects/p1/generations/run1/accept")).toHaveLength(0);
    expect(
      screen.queryByRole("region", { name: "Review generated test cases" }),
    ).not.toBeInTheDocument();
  });

  it("shows nothing when no cases are waiting", async () => {
    mockReview({ [PENDING_URL]: { items: [], total: 0 } });
    renderRoute("/tools/image-to-test-cases?project=p1");

    await screen.findByText("No images uploaded for this project yet.");
    expect(
      screen.queryByRole("region", { name: "Review generated test cases" }),
    ).not.toBeInTheDocument();
  });
});

describe("Pending review banner", () => {
  it("points to the review from the Test cases tab", async () => {
    mockApi({
      "GET /api/projects/p1": project({ urls: [], urlCount: 0 }),
      "GET /api/projects/p1/test-cases": { items: [], total: 0 },
      [PENDING_URL]: {
        items: [
          { id: "run1", completedAt: "2026-01-01T00:00:00.000Z", draftCount: 2 },
          { id: "run2", completedAt: "2026-01-02T00:00:00.000Z", draftCount: 3 },
        ],
        total: 2,
      },
    });

    renderRoute("/projects/p1/test-cases");

    expect(
      await screen.findByText("5 generated test cases are waiting for review."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Review now" })).toHaveAttribute(
      "href",
      "/tools/image-to-test-cases?project=p1",
    );
  });
});
