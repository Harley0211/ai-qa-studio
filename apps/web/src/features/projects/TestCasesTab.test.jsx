import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { mockApi, project, renderRoute } from "../../test/utils.jsx";

const testCase = (overrides = {}) => ({
  id: "tc1",
  projectId: "p1",
  caseId: "TC-0001",
  title: "Verify successful login",
  description: "Check that a user can log in.",
  precondition: "User has an existing account.",
  steps: "1. Open login page\n2. Enter credentials\n3. Click Login",
  data: "Username: tester@example.com",
  expectedResult: "User is redirected to the dashboard.",
  runStatus: "Not Run",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
  ...overrides,
});

const projectResponse = project({ urls: [], urlCount: 0 });

const testCasesResponse = (items = []) => ({
  items,
  total: items.length,
});

describe("Test cases", () => {
  it("displays project-wide execution summary counts and progress", async () => {
    mockApi({
      "GET /api/projects/p1": projectResponse,
      "GET /api/projects/p1/test-cases": testCasesResponse([
        testCase({ id: "tc1", caseId: "TC-0001", runStatus: "Passed" }),
        testCase({ id: "tc2", caseId: "TC-0002", runStatus: "Passed" }),
        testCase({ id: "tc3", caseId: "TC-0003", runStatus: "Failed" }),
        testCase({ id: "tc4", caseId: "TC-0004", runStatus: "Blocked" }),
        testCase({ id: "tc5", caseId: "TC-0005", runStatus: "Not Run" }),
      ]),
    });

    renderRoute("/projects/p1/test-cases");

    expect(await screen.findAllByText("Verify successful login")).toHaveLength(
      5,
    );

    expect(screen.getByText("Total")).toBeInTheDocument();
    expect(screen.getAllByText("Passed").length).toBeGreaterThan(1);
    expect(screen.getAllByText("Failed").length).toBeGreaterThan(1);
    expect(screen.getAllByText("Blocked").length).toBeGreaterThan(1);
    expect(screen.getAllByText("Not Run").length).toBeGreaterThan(1);
    expect(screen.getByText("4 of 5 test cases executed")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "80",
    );
  });
  it("lists test cases", async () => {
    mockApi({
      "GET /api/projects/p1": projectResponse,
      "GET /api/projects/p1/test-cases": testCasesResponse([testCase()]),
    });

    renderRoute("/projects/p1/test-cases");

    expect(
      await screen.findByText("Verify successful login"),
    ).toBeInTheDocument();

    expect(screen.getByText("TC-0001")).toBeInTheDocument();
    expect(
      screen.getByText("Not Run", { selector: "span" }),
    ).toBeInTheDocument();
  });

  it("shows an empty state when no test cases exist", async () => {
    mockApi({
      "GET /api/projects/p1": projectResponse,
      "GET /api/projects/p1/test-cases": testCasesResponse(),
    });

    renderRoute("/projects/p1/test-cases");

    expect(await screen.findByText("No test cases found")).toBeInTheDocument();
  });

  it("expands test case details", async () => {
    mockApi({
      "GET /api/projects/p1": projectResponse,
      "GET /api/projects/p1/test-cases": testCasesResponse([testCase()]),
    });

    renderRoute("/projects/p1/test-cases");

    await screen.findByText("Verify successful login");

    await userEvent.click(screen.getByText("View test details"));

    expect(
      screen.getByText("User has an existing account."),
    ).toBeInTheDocument();

    expect(
      screen.getByText("User is redirected to the dashboard."),
    ).toBeInTheDocument();
  });

  it("updates a test case execution status", async () => {
    let current = testCase();

    const mock = mockApi({
      "GET /api/projects/p1": projectResponse,
      "GET /api/projects/p1/test-cases": () => testCasesResponse([current]),
      "PATCH /api/projects/p1/test-cases/tc1/status": (call) => {
        current = { ...current, runStatus: call.body.runStatus };
        return current;
      },
    });

    renderRoute("/projects/p1/test-cases");

    await screen.findByText("Verify successful login");

    await userEvent.selectOptions(
      screen.getByRole("combobox", {
        name: "Execution status for TC-0001",
      }),
      "Passed",
    );

    expect(
      await screen.findByText("TC-0001 status updated."),
    ).toBeInTheDocument();

    expect(
      mock.find("PATCH", "/api/projects/p1/test-cases/tc1/status")[0].body,
    ).toEqual({ runStatus: "Passed" });
  });

  it("deletes a test case after confirmation", async () => {
    let items = [testCase()];

    mockApi({
      "GET /api/projects/p1": projectResponse,
      "GET /api/projects/p1/test-cases": () => testCasesResponse(items),
      "DELETE /api/projects/p1/test-cases/tc1": () => {
        items = [];
        return new Response(null, { status: 204 });
      },
    });

    renderRoute("/projects/p1/test-cases");

    await screen.findByText("Verify successful login");

    await userEvent.click(
      screen.getByRole("button", { name: "Delete TC-0001" }),
    );

    const dialog = screen.getByRole("dialog", {
      name: "Delete test case?",
    });

    await userEvent.click(
      within(dialog).getByRole("button", {
        name: "Delete test case",
      }),
    );

    expect(await screen.findByText("Test case deleted.")).toBeInTheDocument();

    expect(await screen.findByText("No test cases found")).toBeInTheDocument();
  });

  it("searches test cases using the search query", async () => {
    const mock = mockApi({
      "GET /api/projects/p1": projectResponse,
      "GET /api/projects/p1/test-cases": testCasesResponse([testCase()]),
      "GET /api/projects/p1/test-cases?q=login": testCasesResponse([
        testCase(),
      ]),
    });

    renderRoute("/projects/p1/test-cases");

    await screen.findByText("Verify successful login");

    await userEvent.type(
      screen.getByRole("searchbox", {
        name: "Search test cases",
      }),
      "login",
    );

    expect(
      await screen.findByText("Verify successful login"),
    ).toBeInTheDocument();
    expect(
      mock.find("GET", "/api/projects/p1/test-cases?q=login"),
    ).toHaveLength(1);
  });

  it("filters test cases by execution status", async () => {
    const mock = mockApi({
      "GET /api/projects/p1": projectResponse,
      "GET /api/projects/p1/test-cases": testCasesResponse([testCase()]),
      "GET /api/projects/p1/test-cases?runStatus=Failed": testCasesResponse([
        testCase({ runStatus: "Failed" }),
      ]),
    });

    renderRoute("/projects/p1/test-cases");

    await screen.findByText("Verify successful login");

    await userEvent.selectOptions(
      screen.getByRole("combobox", {
        name: "Filter by execution status",
      }),
      "Failed",
    );

    expect(
      await screen.findByText("Verify successful login"),
    ).toBeInTheDocument();

    expect(
      mock.find("GET", "/api/projects/p1/test-cases?runStatus=Failed"),
    ).toHaveLength(1);
  });

  it("edits an existing test case successfully", async () => {
    const user = userEvent.setup();
    let current = testCase();

    const mock = mockApi({
      "GET /api/projects/p1": projectResponse,
      "GET /api/projects/p1/test-cases": () => testCasesResponse([current]),
      "PATCH /api/projects/p1/test-cases/tc1": (call) => {
        current = {
          ...current,
          title: call.body.title,
          description: call.body.description,
          precondition: call.body.precondition,
          steps: call.body.steps.join("\n"),
          data: call.body.data,
          expectedResult: call.body.expectedResult,
        };

        return current;
      },
    });

    renderRoute("/projects/p1/test-cases");

    await screen.findByText("Verify successful login");

    await user.click(screen.getByRole("button", { name: "Edit TC-0001" }));

    const titleInput = screen.getByLabelText("Test case title");

    await user.clear(titleInput);
    await user.type(titleInput, "Verify login with valid credentials");

    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByText("Test case updated.")).toBeInTheDocument();

    expect(
      await screen.findByText("Verify login with valid credentials"),
    ).toBeInTheDocument();

    expect(
      mock.find("PATCH", "/api/projects/p1/test-cases/tc1")[0].body,
    ).toEqual({
      title: "Verify login with valid credentials",
      description: "Check that a user can log in.",
      precondition: "User has an existing account.",
      steps: ["Open login page", "Enter credentials", "Click Login"],
      data: "Username: tester@example.com",
      expectedResult: "User is redirected to the dashboard.",
    });
  });

  it("validates required fields when creating a test case", async () => {
    const user = userEvent.setup();

    const mock = mockApi({
      "GET /api/projects/p1": projectResponse,
      "GET /api/projects/p1/test-cases": testCasesResponse(),
    });

    renderRoute("/projects/p1/test-cases");

    await user.click(
      await screen.findByRole("button", { name: "Add test case" }),
    );

    await user.click(
      screen.getAllByRole("button", { name: "Create test case" })[1],
    );

    expect(await screen.findByText("Title is required")).toBeInTheDocument();

    expect(
      screen.getByText("At least one test step is required"),
    ).toBeInTheDocument();

    expect(screen.getByText("Expected result is required")).toBeInTheDocument();

    expect(mock.find("POST", "/api/projects/p1/test-cases")).toHaveLength(0);
  });

  it("creates a test case successfully", async () => {
    const user = userEvent.setup();

    const mock = mockApi({
      "GET /api/projects/p1": projectResponse,
      "GET /api/projects/p1/test-cases": testCasesResponse(),
      "POST /api/projects/p1/test-cases": (call) => ({
        ...testCase({
          id: "tc2",
          caseId: "TC-0002",
          title: call.body.title,
          description: call.body.description,
          precondition: call.body.precondition,
          steps: call.body.steps.join("\n"),
          data: call.body.data,
          expectedResult: call.body.expectedResult,
        }),
      }),
    });

    renderRoute("/projects/p1/test-cases");

    await user.click(
      await screen.findByRole("button", { name: "Add test case" }),
    );
    await user.type(
      screen.getByLabelText("Test case title"),
      "Verify password reset",
    );

    await user.type(
      screen.getByLabelText("Description"),
      "Check password reset functionality.",
    );

    await user.type(
      screen.getByLabelText("Precondition"),
      "User has an existing account.",
    );

    await user.type(
      screen.getByLabelText("Test steps"),
      "Open forgot password page\nEnter registered email\nSubmit request",
    );

    await user.type(
      screen.getByLabelText("Test data"),
      "Email: tester@example.com",
    );

    await user.type(
      screen.getByLabelText("Expected result"),
      "Password reset email is sent.",
    );

    await user.click(
      screen.getAllByRole("button", { name: "Create test case" })[1],
    );
    expect(await screen.findByText("Test case created.")).toBeInTheDocument();

    expect(mock.find("POST", "/api/projects/p1/test-cases")[0].body).toEqual({
      title: "Verify password reset",
      description: "Check password reset functionality.",
      precondition: "User has an existing account.",
      steps: [
        "Open forgot password page",
        "Enter registered email",
        "Submit request",
      ],
      data: "Email: tester@example.com",
      expectedResult: "Password reset email is sent.",
    });
  });
  it("keeps project-wide summary unchanged when searching test cases", async () => {
    const user = userEvent.setup();

    mockApi({
      "GET /api/projects/p1": projectResponse,
      "GET /api/projects/p1/test-cases": testCasesResponse([
        testCase({
          id: "tc1",
          caseId: "TC-0001",
          title: "Alpha login",
          runStatus: "Passed",
        }),
        testCase({
          id: "tc2",
          caseId: "TC-0002",
          title: "Beta login",
          runStatus: "Not Run",
        }),
      ]),
      "GET /api/projects/p1/test-cases?q=alpha": testCasesResponse([
        testCase({
          id: "tc1",
          caseId: "TC-0001",
          title: "Alpha login",
          runStatus: "Passed",
        }),
      ]),
    });

    renderRoute("/projects/p1/test-cases");

    expect(await screen.findByText("Alpha login")).toBeInTheDocument();
    expect(screen.getByText("Beta login")).toBeInTheDocument();

    await user.type(
      screen.getByRole("searchbox", {
        name: "Search test cases",
      }),
      "alpha",
    );
    expect(await screen.findByText("Alpha login")).toBeInTheDocument();
    expect(screen.queryByText("Beta login")).not.toBeInTheDocument();

    expect(screen.getByText("1 of 2 test cases executed")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "50",
    );
  });
});
