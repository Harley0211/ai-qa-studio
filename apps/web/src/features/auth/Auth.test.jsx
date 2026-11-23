import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { apiError, mockApi, project, renderRoute, signedInUser } from "../../test/utils.jsx";

const STATUS = "GET /api/auth/status";
const signedOut = { setupRequired: false, user: null };

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
    });
    expect(screen.getByText("Ada Admin")).toBeInTheDocument();
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

    expect(await screen.findByRole("heading", { name: "Choose a project" })).toBeInTheDocument();
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
  it("signs out", async () => {
    const user = userEvent.setup();
    const mock = mockApi({
      "GET /api/projects": projectsList,
      "POST /api/auth/logout": () => new Response(null, { status: 204 }),
    });

    renderRoute("/projects");
    await screen.findByRole("heading", { name: "Alpha" });
    await user.click(screen.getByRole("button", { name: "Sign out" }));

    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(mock.find("POST", "/api/auth/logout")).toHaveLength(1);
  });

  it("changes your password", async () => {
    const user = userEvent.setup();
    const mock = mockApi({
      "GET /api/projects": projectsList,
      "POST /api/auth/password": () => new Response(null, { status: 204 }),
    });

    renderRoute("/projects");
    await screen.findByRole("heading", { name: "Alpha" });
    await user.click(screen.getByRole("button", { name: "Password" }));

    const dialog = screen.getByRole("dialog", { name: "Change password" });
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
    expect(screen.queryByRole("link", { name: "Users" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Users" })).not.toBeInTheDocument();
  });
});

describe("Users page (admin)", () => {
  function mockUsers(overrides = {}) {
    let users = [
      signedInUser(),
      signedInUser({ id: "u2", name: "Max Member", email: "max@example.com", role: "MEMBER" }),
    ];

    const mock = mockApi({
      "GET /api/users": () => ({ items: users, total: users.length }),
      "POST /api/users": (call) => {
        const created = signedInUser({ id: "u3", ...call.body, password: undefined });
        users = [...users, created];
        return { data: created };
      },
      "PATCH /api/users/u2": (call) => {
        users = users.map((u) => (u.id === "u2" ? { ...u, ...call.body, password: undefined } : u));
        return { data: users[1] };
      },
      "DELETE /api/users/u2": () => {
        users = users.filter((u) => u.id !== "u2");
        return new Response(null, { status: 204 });
      },
      ...overrides,
    });

    return mock;
  }

  it("lists users and adds one", async () => {
    const user = userEvent.setup();
    const mock = mockUsers();
    renderRoute("/users");

    const table = await screen.findByRole("table");
    expect(within(table).getByText("max@example.com")).toBeInTheDocument();
    expect(within(table).getByText("(you)")).toBeInTheDocument();
    // You can't remove yourself.
    expect(screen.queryByRole("button", { name: "Remove Ada Admin" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add user" }));
    const dialog = screen.getByRole("dialog", { name: "Add user" });
    await user.type(within(dialog).getByLabelText("Name"), "Nina New");
    await user.type(within(dialog).getByLabelText("Email"), "nina@example.com");
    await user.type(within(dialog).getByLabelText("Password"), "welcome 123");
    await user.selectOptions(within(dialog).getByLabelText("Role"), "ADMIN");
    await user.click(within(dialog).getByRole("button", { name: "Add user" }));

    expect(await within(table).findByText("nina@example.com")).toBeInTheDocument();
    expect(mock.find("POST", "/api/users")[0].body).toEqual({
      name: "Nina New",
      email: "nina@example.com",
      password: "welcome 123",
      role: "ADMIN",
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
    await user.type(within(dialog).getByLabelText("Email"), "max@example.com");
    await user.type(within(dialog).getByLabelText("Password"), "welcome 123");
    await user.click(within(dialog).getByRole("button", { name: "Add user" }));

    expect(await within(dialog).findByText("A user with this email already exists")).toBeInTheDocument();
  });

  it("resets a password and removes a user", async () => {
    const user = userEvent.setup();
    const mock = mockUsers();
    renderRoute("/users");

    await user.click(await screen.findByRole("button", { name: "Reset password for Max Member" }));
    const reset = screen.getByRole("dialog", { name: "Reset password for Max Member" });
    await user.type(within(reset).getByLabelText("New password"), "reset pass 1");
    await user.click(within(reset).getByRole("button", { name: "Set password" }));

    expect(
      await screen.findByText("New password set for Max Member. They were signed out."),
    ).toBeInTheDocument();
    expect(mock.find("PATCH", "/api/users/u2")[0].body).toEqual({ password: "reset pass 1" });

    await user.click(screen.getByRole("button", { name: "Remove Max Member" }));
    const confirm = screen.getByRole("dialog", { name: "Remove Max Member?" });
    await user.click(within(confirm).getByRole("button", { name: "Remove user" }));

    expect(await screen.findByText("Removed Max Member.")).toBeInTheDocument();
    expect(screen.queryByText("max@example.com")).not.toBeInTheDocument();
  });
});
