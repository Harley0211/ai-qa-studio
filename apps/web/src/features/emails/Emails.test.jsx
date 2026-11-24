import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { apiError, mockApi, project, renderRoute, signedInUser } from "../../test/utils.jsx";
import { emailOutcome } from "./emailOutcome.js";

const TOKEN = "a".repeat(64);
const signedOut = { setupRequired: false, signupAllowed: true, user: null };

describe("Accepting an emailed invitation", () => {
  it("chooses a password and signs in, then shows the projects", async () => {
    const user = userEvent.setup();
    let status = signedOut;
    const maria = signedInUser({ id: "u2", name: "Maria Santos", email: "maria@example.com", role: "MEMBER" });
    const mock = mockApi({
      "GET /api/auth/status": () => status,
      [`GET /api/auth/invitations/${TOKEN}`]: { name: "Maria Santos", email: "maria@example.com", role: "MEMBER" },
      [`POST /api/auth/invitations/${TOKEN}/accept`]: () => {
        status = { setupRequired: false, user: maria, remember: false };
        return { user: maria };
      },
      "GET /api/projects": { items: [project({ id: "p1", name: "PNCC", access: "ASSIGNED" })], total: 1 },
    });
    renderRoute(`/invite/${TOKEN}`);

    expect(await screen.findByRole("heading", { name: "Accept your invitation" })).toBeInTheDocument();
    expect(screen.getByText("You're joining AI QA Studio as a Tester.")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveValue("maria@example.com");

    await user.type(screen.getByLabelText("Choose a password"), "short");
    await user.click(screen.getByRole("button", { name: "Set password and sign in" }));
    expect(screen.getByText("Password must be at least 8 characters")).toBeInTheDocument();
    expect(mock.find("POST", `/api/auth/invitations/${TOKEN}/accept`)).toHaveLength(0);

    await user.clear(screen.getByLabelText("Choose a password"));
    await user.type(screen.getByLabelText("Choose a password"), "correct horse 1");
    await user.type(screen.getByLabelText("Confirm password"), "correct horse 1");
    await user.click(screen.getByRole("button", { name: "Set password and sign in" }));

    expect(await screen.findByRole("heading", { name: "PNCC" })).toBeInTheDocument();
    expect(mock.find("POST", `/api/auth/invitations/${TOKEN}/accept`)[0].body).toEqual({ password: "correct horse 1" });
  });

  it("explains an expired or used link", async () => {
    mockApi({
      [`GET /api/auth/invitations/${TOKEN}`]: apiError(
        404,
        "INVITATION_INVALID",
        "This invitation link is invalid, already used or expired. Ask an admin to send a new one.",
      ),
    });
    renderRoute(`/invite/${TOKEN}`);

    expect(await screen.findByRole("heading", { name: "This invitation can't be used" })).toBeInTheDocument();
    expect(screen.getByText(/Ask an admin to send a new one/)).toBeInTheDocument();
  });
});

describe("Admin → Emails", () => {
  const items = [
    { id: "e1", to: "maria@example.com", kind: "INVITATION", subject: "Harley invited you", status: "SENT", attempts: 1, createdAt: "2026-11-24T01:00:00Z", sentAt: "2026-11-24T01:00:02Z" },
    { id: "e2", to: "jun@example.com", kind: "PROJECTS_ADDED", subject: "You now have access to PNCC", status: "FAILED", error: "Invalid login", attempts: 1, createdAt: "2026-11-24T02:00:00Z" },
  ];

  it("lists emails and retries a failed one", async () => {
    const user = userEvent.setup();
    const mock = mockApi({
      "GET /api/emails": { items, configured: true },
      "POST /api/emails/e2/retry": { data: { ...items[1], status: "SENT", error: null, attempts: 2 } },
    });
    renderRoute("/emails");

    const table = await screen.findByRole("table");
    const row = (to) => within(table).getByText(to).closest("tr");
    expect(within(row("maria@example.com")).getByText("Sent")).toBeInTheDocument();
    expect(within(row("maria@example.com")).getByText("Invitation")).toBeInTheDocument();
    expect(within(row("jun@example.com")).getByText("Failed")).toBeInTheDocument();
    expect(within(row("jun@example.com")).getByText("Invalid login")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry email to maria@example.com" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Retry email to jun@example.com" }));
    expect(await screen.findByText("Sent to jun@example.com.")).toBeInTheDocument();
    expect(mock.find("POST", "/api/emails/e2/retry")).toHaveLength(1);
  });

  it("says when email isn't set up yet", async () => {
    mockApi({ "GET /api/emails": { items: [{ ...items[0], status: "SKIPPED", sentAt: null }], configured: false } });
    renderRoute("/emails");
    expect(await screen.findByText(/Email isn't set up yet/)).toBeInTheDocument();
    expect(screen.getByText("Not sent")).toBeInTheDocument();
  });

  it("is in the admin sidebar and hidden from testers", async () => {
    mockApi({
      "GET /api/auth/status": { setupRequired: false, user: signedInUser({ role: "MEMBER" }) },
      "GET /api/projects": { items: [], total: 0 },
    });
    renderRoute("/emails");
    expect(await screen.findByText("Page not found")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Emails" })).not.toBeInTheDocument();
  });
});

describe("Email result messages", () => {
  it("summarises sent, skipped and failed emails", () => {
    expect(emailOutcome([])).toEqual({ note: "", problem: null });
    expect(emailOutcome([{ to: "a@x", status: "SENT" }]).note).toBe("Email sent to a@x.");
    expect(emailOutcome([{ to: "a@x", status: "SENT" }, { to: "b@x", status: "SENT" }]).note).toBe("2 emails sent to a@x, b@x.");
    expect(emailOutcome([{ to: "a@x", status: "SKIPPED" }]).note).toMatch(/isn't set up/);
    expect(emailOutcome([{ to: "a@x", status: "FAILED", error: "boom" }]).problem).toMatch(/a@x couldn't be sent \(boom\)/);
  });
});
