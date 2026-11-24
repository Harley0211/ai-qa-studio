import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { apiError, mockApi, project, renderRoute, signedInUser } from "../../test/utils.jsx";

const STATUS = "GET /api/auth/status";
const signedOut = { setupRequired: false, signupAllowed: true, user: null };

const projectsList = { items: [project({ id: "p1", name: "Alpha" })], total: 1 };

describe("Signing in", () => {
  it("shows the sign-in screen, then the page you opened", async () => {
    const user = userEvent.setup();
    let status = signedOut;
    const mock = mockApi({
      [STATUS]: () => status,
      "GET /api/projects": projectsList,
      "POST /api/auth/login": () => {
        status = { setupRequired: false, user: signedInUser() };
        return { user: signedInUser() };
      },
    });

    renderRoute("/projects");

    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Alpha" })).not.toBeInTheDocument();
    expect(mock.find("GET", "/api/projects")).toHaveLength(0);

    await user.type(screen.getByLabelText("Email"), " ada@example.com ");
    await user.type(screen.getByLabelText("Password"), "correct horse 1");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("heading", { name: "Alpha" })).toBeInTheDocument();
    expect(mock.find("POST", "/api/auth/login")[0].body).toEqual({
      email: "ada@example.com",
      password: "correct horse 1",
      remember: true,
    });
    expect(screen.getByText("Ada Admin")).toBeInTheDocument();
  });

  it("sends Remember me, and explains what to do about a forgotten password", async () => {
    const user = userEvent.setup();
    let status = signedOut;
    const mock = mockApi({
      [STATUS]: () => status,
      "GET /api/projects": projectsList,
      "POST /api/auth/login": () => {
        status = { setupRequired: false, user: signedInUser(), remember: false };
        return { user: signedInUser() };
      },
    });
    renderRoute("/projects");

    await user.click(await screen.findByRole("button", { name: "Forgot password?" }));
    expect(screen.getByRole("heading", { name: "Forgot password" })).toBeInTheDocument();
    expect(screen.getByText(/Ask an admin of AI QA Studio to reset your password/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Back to sign in" }));

    await user.type(screen.getByLabelText("Email"), "ada@example.com");
    await user.type(screen.getByLabelText("Password"), "correct horse 1");
    await user.click(screen.getByRole("checkbox", { name: "Remember me" }));
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await screen.findByRole("heading", { name: "Alpha" });
    expect(mock.find("POST", "/api/auth/login")[0].body.remember).toBe(false);
  });

  it("always starts on the project picker after signing in", async () => {
    const user = userEvent.setup();
    let status = signedOut;
    mockApi({
      [STATUS]: () => status,
      "GET /api/projects": projectsList,
      "POST /api/auth/login": () => {
        status = { setupRequired: false, user: signedInUser({ role: "MEMBER" }) };
        return { user: signedInUser({ role: "MEMBER" }) };
      },
    });

    // Even when signing in from a link deep inside a project's tool.
    renderRoute("/projects/p9/tools/bug-report");

    await user.type(await screen.findByLabelText("Email"), "ada@example.com");
    await user.type(screen.getByLabelText("Password"), "correct horse 1");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("heading", { name: "Projects" })).toBeInTheDocument();
    expect(screen.getByText("Choose a project to use the tools.")).toBeInTheDocument();
  });

  it("shows the server's message for a wrong password", async () => {
    const user = userEvent.setup();
    mockApi({
      [STATUS]: signedOut,
      "POST /api/auth/login": () => apiError(401, "INVALID_CREDENTIALS", "Email or password is incorrect"),
    });

    renderRoute("/projects");
    await user.type(await screen.findByLabelText("Email"), "ada@example.com");
    await user.type(screen.getByLabelText("Password"), "nope");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Email or password is incorrect");
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
  });

  it("returns to the sign-in screen when the session has ended", async () => {
    mockApi({
      "GET /api/projects": () => apiError(401, "UNAUTHENTICATED", "Please sign in to continue"),
    });

    renderRoute("/projects");

    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
  });
});

describe("Creating an account", () => {
  it("checks the form, then creates a tester account and opens the projects", async () => {
    const user = userEvent.setup();
    let status = signedOut;
    const maria = signedInUser({ id: "u5", name: "Maria Santos", email: "maria@example.com", role: "MEMBER" });
    const mock = mockApi({
      [STATUS]: () => status,
      "GET /api/projects": { items: [{ id: "p1", name: "Alpha", access: "NONE" }], total: 1 },
      "POST /api/auth/register": () => {
        status = { setupRequired: false, user: maria, remember: false };
        return new Response(JSON.stringify({ user: maria }), { status: 201 });
      },
    });
    renderRoute("/projects");

    await user.click(await screen.findByRole("button", { name: "Create an account" }));
    expect(screen.getByRole("heading", { name: "Create account" })).toBeInTheDocument();

    await user.type(screen.getByLabelText("Full name"), "Maria Santos");
    await user.type(screen.getByLabelText("Email"), "maria@example.com");
    await user.type(screen.getByLabelText("Password"), "correct horse 1");
    await user.type(screen.getByLabelText("Confirm password"), "correct horse");
    expect(screen.getByText("Passwords do not match")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Confirm password"), " 1");
    expect(screen.queryByText("Passwords do not match")).not.toBeInTheDocument();

    // The local-storage box must be ticked.
    await user.click(screen.getByRole("button", { name: "Create account" }));
    expect(screen.getByText("Please tick this box to continue.")).toBeInTheDocument();
    expect(mock.find("POST", "/api/auth/register")).toHaveLength(0);

    await user.click(screen.getByRole("checkbox", { name: "I understand my data is stored locally" }));
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByRole("heading", { name: "Projects" })).toBeInTheDocument();
    expect(mock.find("POST", "/api/auth/register")[0].body).toEqual({
      name: "Maria Santos",
      email: "maria@example.com",
      password: "correct horse 1",
      storedLocally: true,
    });
    expect(await screen.findByText("Not assigned to you. Ask an admin for access.")).toBeInTheDocument();
  });

  it("is hidden when an admin has turned it off", async () => {
    mockApi({ [STATUS]: { ...signedOut, signupAllowed: false } });
    renderRoute("/projects");
    await screen.findByRole("heading", { name: "Sign in" });
    expect(screen.queryByRole("button", { name: "Create an account" })).not.toBeInTheDocument();
  });
});

describe("First run", () => {
  it("creates the admin account and opens the app", async () => {
    const user = userEvent.setup();
    let status = { setupRequired: true, user: null };
    const mock = mockApi({
      [STATUS]: () => status,
      "GET /api/projects": { items: [], total: 0 },
      "POST /api/auth/setup": (call) => {
        const created = signedInUser({ name: call.body.name, email: call.body.email });
        status = { setupRequired: false, user: created };
        return { user: created };
      },
    });

    renderRoute("/projects");
    expect(await screen.findByRole("heading", { name: "Create the admin account" })).toBeInTheDocument();

    await user.type(screen.getByLabelText("Your name"), "Harley");
    await user.type(screen.getByLabelText("Email"), "harley@example.com");
    await user.type(screen.getByLabelText("Password"), "correct horse 1");
    await user.type(screen.getByLabelText("Confirm password"), "different");
    await user.click(screen.getByRole("button", { name: "Create admin and sign in" }));

    expect(screen.getByText("Passwords don't match")).toBeInTheDocument();
    expect(mock.find("POST", "/api/auth/setup")).toHaveLength(0);

    await user.clear(screen.getByLabelText("Confirm password"));
    await user.type(screen.getByLabelText("Confirm password"), "correct horse 1");
    await user.click(screen.getByRole("button", { name: "Create admin and sign in" }));

    expect(await screen.findByText("Harley")).toBeInTheDocument();
    expect(mock.find("POST", "/api/auth/setup")[0].body).toEqual({
      name: "Harley",
      email: "harley@example.com",
      password: "correct horse 1",
    });
  });
});

describe("Account menu", () => {
  it("asks before signing out, then shows that you are signed out", async () => {
    const user = userEvent.setup();
    const mock = mockApi({
      "GET /api/projects": projectsList,
      "POST /api/auth/logout": () => new Response(null, { status: 204 }),
    });

    renderRoute("/projects");
    await screen.findByRole("heading", { name: "Alpha" });
    await user.click(screen.getByRole("button", { name: "Sign out" }));

    const dialog = screen.getByRole("dialog", { name: "Sign out of AI QA Studio?" });
    expect(within(dialog).getByText(/Your projects, evidence and test cases stay saved/)).toBeInTheDocument();
    expect(mock.find("POST", "/api/auth/logout")).toHaveLength(0);
    await user.click(within(dialog).getByRole("button", { name: "Sign out" }));

    expect(await screen.findByRole("heading", { name: "You are signed out" })).toBeInTheDocument();
    expect(mock.find("POST", "/api/auth/logout")).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Sign in again" }));
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
  });

  it("can cancel signing out", async () => {
    const user = userEvent.setup();
    const mock = mockApi({ "GET /api/projects": projectsList });
    renderRoute("/projects");
    await screen.findByRole("heading", { name: "Alpha" });

    await user.click(screen.getByRole("button", { name: "Sign out" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(mock.find("POST", "/api/auth/logout")).toHaveLength(0);
  });

  it("signs out after 30 minutes without activity when Remember me was off", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const mock = mockApi({
        [STATUS]: { setupRequired: false, user: signedInUser(), remember: false },
        "GET /api/projects": projectsList,
        "POST /api/auth/logout": () => new Response(null, { status: 204 }),
      });
      renderRoute("/projects");
      await screen.findByRole("heading", { name: "Alpha" });

      await act(() => vi.advanceTimersByTimeAsync(30 * 60 * 1000 + 1000));

      expect(await screen.findByRole("heading", { name: "You are signed out" })).toBeInTheDocument();
      expect(screen.getByText("You were signed out after 30 minutes without activity.")).toBeInTheDocument();
      expect(mock.find("POST", "/api/auth/logout")).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("changes your password in account settings", async () => {
    const user = userEvent.setup();
    const mock = mockApi({
      "GET /api/projects": projectsList,
      "POST /api/auth/password": () => new Response(null, { status: 204 }),
    });

    renderRoute("/projects");
    await screen.findByRole("heading", { name: "Alpha" });
    expect(screen.getByText("Admin · Account settings")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Account settings for Ada Admin" }));

    const dialog = screen.getByRole("dialog", { name: "Account settings" });
    await user.type(within(dialog).getByLabelText("Current password"), "old password");
    await user.type(within(dialog).getByLabelText("New password"), "new password 1");
    await user.type(within(dialog).getByLabelText("Confirm new password"), "new password 1");
    await user.click(within(dialog).getByRole("button", { name: "Change password" }));

    expect(await screen.findByText("Password changed. Other browsers were signed out.")).toBeInTheDocument();
    expect(mock.find("POST", "/api/auth/password")[0].body).toEqual({
      currentPassword: "old password",
      newPassword: "new password 1",
    });
  });

  it("shows the Users page only to admins", async () => {
    mockApi({
      [STATUS]: { setupRequired: false, user: signedInUser({ role: "MEMBER", name: "Max Member" }) },
      "GET /api/projects": projectsList,
    });

    renderRoute("/users");

    expect(await screen.findByText("Max Member")).toBeInTheDocument();
    expect(screen.getByText("Tester · Account settings")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Users" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Users" })).not.toBeInTheDocument();
  });
});

describe("Users page (admin)", () => {
  const person = (overrides) =>
    signedInUser({ role: "MEMBER", active: true, status: "ACTIVE", projectIds: [], ...overrides });

  function mockUsers(overrides = {}) {
    let users = [
      signedInUser({ active: true, status: "ACTIVE", projectIds: [] }),
      person({ id: "u2", name: "Maria Santos", email: "maria@example.com", projectIds: ["p1", "p2"] }),
      person({ id: "u3", name: "Jun Reyes", email: "jun@example.com", status: "INVITED", projectIds: ["p1"] }),
      person({ id: "u4", name: "Ana Lim", email: "ana@example.com", active: false, status: "DISABLED" }),
    ];

    const mock = mockApi({
      "GET /api/users": () => ({ items: users, total: users.length, projectTotal: 4 }),
      "POST /api/users": (call) => {
        const created = person({ id: "u9", ...call.body, password: undefined, status: "INVITED" });
        users = [...users, created];
        return { data: created };
      },
      "PATCH /api/users/u2": (call) => {
        users = users.map((u) => (u.id === "u2" ? { ...u, ...call.body, password: undefined } : u));
        return { data: users[1] };
      },
      "PATCH /api/users/u4": (call) => {
        users = users.map((u) => (u.id === "u4" ? { ...u, ...call.body, status: "ACTIVE" } : u));
        return { data: users[3] };
      },
      "DELETE /api/users/u2": () => {
        users = users.filter((u) => u.id !== "u2");
        return new Response(null, { status: 204 });
      },
      ...overrides,
    });

    return mock;
  }

  it("lists users with role, projects and status, and filters them", async () => {
    const user = userEvent.setup();
    mockUsers();
    renderRoute("/users");

    const table = await screen.findByRole("table");
    const row = (name) => within(table).getByText(name).closest("tr");
    expect(within(row("Ada Admin")).getByText("All projects")).toBeInTheDocument();
    expect(within(row("Ada Admin")).getByText("You")).toBeInTheDocument();
    expect(within(row("Maria Santos")).getByText("2 of 4")).toBeInTheDocument();
    expect(within(row("Maria Santos")).getByText("Tester")).toBeInTheDocument();
    expect(within(row("Jun Reyes")).getByText("Invited")).toBeInTheDocument();
    expect(within(row("Ana Lim")).getByText("Disabled")).toBeInTheDocument();
    expect(within(row("Ana Lim")).getByRole("button", { name: "Enable Ana Lim" })).toBeInTheDocument();
    // You can't change your own account from the list.
    expect(screen.queryByRole("button", { name: "More actions for Ada Admin" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Admins (1)" }));
    expect(within(table).queryByText("Maria Santos")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Disabled (1)" }));
    expect(within(table).getByText("Ana Lim")).toBeInTheDocument();
    expect(within(table).queryByText("Ada Admin")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "All (4)" }));
    await user.type(screen.getByLabelText("Search users"), "jun@");
    expect(within(table).getByText("Jun Reyes")).toBeInTheDocument();
    expect(within(table).queryByText("Maria Santos")).not.toBeInTheDocument();
  });

  it("adds a tester, then opens their project access", async () => {
    const user = userEvent.setup();
    const mock = mockUsers({
      "GET /api/users/u9": () => ({ data: person({ id: "u9", name: "Nina New", email: "nina@example.com" }) }),
      "GET /api/projects": { items: [project({ id: "p1", name: "PNCC", access: "ADMIN" })], total: 1 },
    });
    renderRoute("/users");

    await user.click(await screen.findByRole("button", { name: "Add user" }));
    const dialog = screen.getByRole("dialog", { name: "Add user" });
    await user.type(within(dialog).getByLabelText("Name"), "Nina New");
    await user.type(within(dialog).getByLabelText("Email"), "nina@example.com");
    await user.type(within(dialog).getByLabelText("Password"), "welcome 123");
    expect(within(dialog).getByRole("radio", { name: "Tester" })).toHaveAttribute("aria-checked", "true");
    await user.click(within(dialog).getByRole("button", { name: "Add user" }));

    expect(await screen.findByRole("heading", { name: "Assign projects to Nina New" })).toBeInTheDocument();
    expect(mock.find("POST", "/api/users")[0].body).toEqual({
      name: "Nina New",
      email: "nina@example.com",
      password: "welcome 123",
      role: "MEMBER",
    });
  });

  it("shows field errors from the server", async () => {
    const user = userEvent.setup();
    mockUsers({
      "POST /api/users": () =>
        apiError(409, "EMAIL_TAKEN", "A user with this email already exists", {
          email: "A user with this email already exists",
        }),
    });
    renderRoute("/users");

    await user.click(await screen.findByRole("button", { name: "Add user" }));
    const dialog = screen.getByRole("dialog", { name: "Add user" });
    await user.type(within(dialog).getByLabelText("Name"), "Max Again");
    await user.type(within(dialog).getByLabelText("Email"), "maria@example.com");
    await user.type(within(dialog).getByLabelText("Password"), "welcome 123");
    await user.click(within(dialog).getByRole("button", { name: "Add user" }));

    expect(await within(dialog).findByText("A user with this email already exists")).toBeInTheDocument();
  });

  it("opens the row menu floating above the page, not inside the table", async () => {
    const user = userEvent.setup();
    mockUsers();
    renderRoute("/users");

    const table = await screen.findByRole("table");
    const dots = screen.getByRole("button", { name: "More actions for Maria Santos" });
    await user.click(dots);

    const menu = screen.getByRole("menu", { name: "Actions for Maria Santos" });
    expect(table.contains(menu)).toBe(false);
    expect(menu).toHaveClass("fixed");
    expect(dots).toHaveAttribute("aria-expanded", "true");
    // Focus moves into the menu; Escape closes it and returns focus.
    expect(within(menu).getByRole("menuitem", { name: "Assign projects" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(dots).toHaveFocus();

    // A click elsewhere closes it too.
    await user.click(dots);
    await user.click(screen.getByRole("heading", { name: "Users" }));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("resets a password, disables, enables and removes users from the row menu", async () => {
    const user = userEvent.setup();
    const mock = mockUsers();
    renderRoute("/users");

    await user.click(await screen.findByRole("button", { name: "More actions for Maria Santos" }));
    await user.click(screen.getByRole("menuitem", { name: "Reset password" }));
    const reset = screen.getByRole("dialog", { name: "Reset password for Maria Santos" });
    await user.type(within(reset).getByLabelText("New password"), "reset pass 1");
    await user.click(within(reset).getByRole("button", { name: "Set password" }));
    expect(await screen.findByText("New password set for Maria Santos. They were signed out.")).toBeInTheDocument();
    expect(mock.find("PATCH", "/api/users/u2")[0].body).toEqual({ password: "reset pass 1" });

    await user.click(screen.getByRole("button", { name: "More actions for Maria Santos" }));
    await user.click(screen.getByRole("menuitem", { name: "Disable" }));
    await user.click(within(screen.getByRole("dialog", { name: "Disable Maria Santos?" })).getByRole("button", { name: "Disable" }));
    expect(await screen.findByText("Maria Santos was disabled and signed out.")).toBeInTheDocument();
    expect(mock.find("PATCH", "/api/users/u2")[1].body).toEqual({ active: false });

    await user.click(screen.getByRole("button", { name: "Enable Ana Lim" }));
    expect(await screen.findByText("Ana Lim can sign in again.")).toBeInTheDocument();
    expect(mock.find("PATCH", "/api/users/u4")[0].body).toEqual({ active: true });

    await user.click(screen.getByRole("button", { name: "More actions for Maria Santos" }));
    await user.click(screen.getByRole("menuitem", { name: "Remove user" }));
    await user.click(within(screen.getByRole("dialog", { name: "Remove Maria Santos?" })).getByRole("button", { name: "Remove user" }));
    expect(await screen.findByText("Removed Maria Santos.")).toBeInTheDocument();
    expect(screen.queryByText("maria@example.com")).not.toBeInTheDocument();
  });
});

describe("Assigning projects to a person (admin)", () => {
  const maria = {
    ...signedInUser({ id: "u2", name: "Maria Santos", email: "maria@example.com", role: "MEMBER" }),
    active: true,
    status: "ACTIVE",
    projectIds: ["p1"],
  };
  const projects = {
    items: [
      project({ id: "p1", name: "PNCC Lotusflare", testCaseCount: 11, urlCount: 1, access: "ADMIN" }),
      project({ id: "p2", name: "Billing Portal", testCaseCount: 0, urlCount: 1, access: "ADMIN" }),
    ],
    total: 2,
  };

  it("edits the profile and project access, and saves them together", async () => {
    const user = userEvent.setup();
    const mock = mockApi({
      "GET /api/users/u2": { data: maria },
      "GET /api/projects": projects,
      "GET /api/users": { items: [], total: 0, projectTotal: 2 },
      "PATCH /api/users/u2": (call) => ({ data: { ...maria, ...call.body } }),
    });
    renderRoute("/users/u2");

    expect(await screen.findByRole("heading", { name: "Assign projects to Maria Santos" })).toBeInTheDocument();
    expect(screen.getByText("1 of 2 projects assigned")).toBeInTheDocument();
    const billing = screen.getByRole("switch", { name: "Access to Billing Portal" });
    expect(billing).toHaveAttribute("aria-checked", "false");
    expect(screen.getByText(/Removing access applies on their next request/)).toBeInTheDocument();

    await user.click(billing);
    expect(screen.getByText("2 of 2 projects assigned")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.getByText("0 of 2 projects assigned")).toBeInTheDocument();
    await user.click(screen.getByRole("switch", { name: "Access to PNCC Lotusflare" }));

    await user.clear(screen.getByLabelText("Full name"));
    await user.type(screen.getByLabelText("Full name"), "Maria Reyes");
    await user.click(screen.getByRole("switch", { name: "Account active" }));
    await user.click(screen.getByRole("button", { name: "Save access" }));

    expect(await screen.findByText("Saved access for Maria Reyes.")).toBeInTheDocument();
    expect(mock.find("PATCH", "/api/users/u2")[0].body).toEqual({
      name: "Maria Reyes",
      email: "maria@example.com",
      role: "MEMBER",
      active: false,
      projectIds: ["p1"],
    });
    // Back on the list.
    expect(await screen.findByRole("heading", { name: "Users" })).toBeInTheDocument();
  });

  it("has nothing to assign for an admin, and doesn't let you change your own role", async () => {
    mockApi({
      "GET /api/users/u1": { data: { ...signedInUser(), active: true, status: "ACTIVE", projectIds: [] } },
      "GET /api/projects": projects,
    });
    renderRoute("/users/u1");

    expect(await screen.findByText("All projects (admin)")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Access to PNCC Lotusflare" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "Tester" })).toBeDisabled();
    expect(screen.getByRole("switch", { name: "Account active" })).toBeDisabled();
  });
});
