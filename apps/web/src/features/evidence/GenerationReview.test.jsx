import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { mockApi, project, renderRoute } from "../../test/utils.jsx";

const PENDING_URL = "GET /api/projects/p1/generations?review=pending";
const REFINEMENTS_URL = "GET /api/projects/p1/generations/run1/refinements";
const REFINE_URL = "POST /api/projects/p1/generations/run1/refine";

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
    [REFINEMENTS_URL]: { items: [], total: 0 },
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

describe("Refine with AI", () => {
  const lockedAccount = {
    index: 2,
    title: "Login with a locked account",
    description: null,
    precondition: null,
    steps: "1. Sign in as a locked user",
    data: null,
    expectedResult: "An account locked message is shown",
    stepExpectedResults: null,
  };

  // A chat whose request runs until finish() is called, then applies a change.
  function mockChat({ result = "SUCCEEDED" } = {}) {
    let items = [];
    let currentDrafts = drafts;
    let pending = {
      items: [{ id: "run1", completedAt: "2026-01-01T00:00:00.000Z", draftCount: 2 }],
      total: 1,
    };

    const mock = mockReview({
      [PENDING_URL]: () => pending,
      "GET /api/projects/p1/generations/run1": () => ({
        data: { id: "run1", status: "SUCCEEDED", reviewStatus: "PENDING_REVIEW", drafts: currentDrafts },
      }),
      [REFINEMENTS_URL]: () => ({ items, total: items.length }),
      [REFINE_URL]: (call) => {
        items = [
          {
            id: "chat1",
            status: "PENDING",
            error: null,
            instruction: call.body.instruction,
            replySummary: null,
          },
        ];
        return { data: { id: "chat1", status: "PENDING" } };
      },
    });

    function finish() {
      if (result === "SUCCEEDED") {
        currentDrafts = [...drafts, lockedAccount];
        pending = { ...pending, items: [{ ...pending.items[0], draftCount: 3 }] };
        items = [{ ...items[0], status: "SUCCEEDED", replySummary: "Added 1 test case. Added a locked account test." }];
      } else {
        items = [{ ...items[0], status: "FAILED", error: "Couldn't make this change: Could not work out what to change" }];
      }
    }

    return { mock, finish };
  }

  it("offers suggestions that fill in the request", async () => {
    const user = userEvent.setup();
    mockChat();
    const review = await openReview();

    await within(review).findByText("Login with valid credentials");
    await user.click(within(review).getByRole("button", { name: "Add negative test cases" }));

    expect(within(review).getByRole("textbox", { name: "Ask for a change" })).toHaveValue(
      "Add negative test cases",
    );
  });

  it("sends a request, pauses adding while it runs, and shows the updated cases", async () => {
    const user = userEvent.setup();
    const { mock, finish } = mockChat();
    const review = await openReview();

    await within(review).findByText("Login with valid credentials");
    const send = within(review).getByRole("button", { name: "Send" });
    expect(send).toBeDisabled();

    await user.type(
      within(review).getByRole("textbox", { name: "Ask for a change" }),
      "Add a test for a locked account",
    );
    await user.click(send);

    expect(mock.find("POST", "/api/projects/p1/generations/run1/refine")[0].body).toEqual({
      instruction: "Add a test for a locked account",
    });

    const conversation = await within(review).findByRole("list", { name: "Refine conversation" });
    expect(within(conversation).getByText("Add a test for a locked account")).toBeInTheDocument();
    expect(
      await within(conversation).findByText("Working on it. This can take a minute or two."),
    ).toBeInTheDocument();
    expect(within(review).getByRole("textbox", { name: "Ask for a change" })).toHaveValue("");
    expect(within(review).getByRole("button", { name: "Add 2 to library" })).toBeDisabled();
    expect(within(review).getByRole("button", { name: "Discard all" })).toBeDisabled();

    finish();

    expect(
      await within(conversation).findByText(
        "Added 1 test case. Added a locked account test.",
        {},
        { timeout: 5000 },
      ),
    ).toBeInTheDocument();
    expect(await screen.findByText("Generated test cases updated.")).toBeInTheDocument();
    expect(await within(review).findByText("Login with a locked account")).toBeInTheDocument();
    expect(await within(review).findByRole("button", { name: "Add 3 to library" })).toBeEnabled();
  });

  it("shows why a change could not be made and keeps the cases", async () => {
    const user = userEvent.setup();
    const { finish } = mockChat({ result: "FAILED" });
    const review = await openReview();

    await within(review).findByText("Login with valid credentials");
    await user.type(within(review).getByRole("textbox", { name: "Ask for a change" }), "Do something");
    await user.keyboard("{Enter}");

    await within(review).findByText("Working on it. This can take a minute or two.");
    finish();

    expect(
      await within(review).findByText(
        "Couldn't make this change: Could not work out what to change",
        {},
        { timeout: 5000 },
      ),
    ).toBeInTheDocument();
    expect(within(review).getByRole("button", { name: "Add 2 to library" })).toBeEnabled();
    expect(within(review).queryByText("Login with a locked account")).not.toBeInTheDocument();
  });

  it("shows the server's message when a request is refused", async () => {
    const user = userEvent.setup();
    mockReview({
      [REFINE_URL]: () =>
        new Response(
          JSON.stringify({
            error: {
              code: "REFINEMENT_IN_PROGRESS",
              message: "Wait for the current change to finish before asking for another",
            },
          }),
          { status: 409, headers: { "Content-Type": "application/json" } },
        ),
    });
    const review = await openReview();

    await within(review).findByText("Login with valid credentials");
    await user.type(within(review).getByRole("textbox", { name: "Ask for a change" }), "Another change");
    await user.click(within(review).getByRole("button", { name: "Send" }));

    expect(await within(review).findByRole("alert")).toHaveTextContent(
      "Wait for the current change to finish before asking for another",
    );
    expect(within(review).getByRole("textbox", { name: "Ask for a change" })).toHaveValue(
      "Another change",
    );
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
