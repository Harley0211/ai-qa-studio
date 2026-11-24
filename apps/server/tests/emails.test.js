import request from "supertest";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { env } from "../src/config/env.js";
import { createN8nEmailSender } from "../src/modules/email/email.service.js";
import { escapeHtml, renderEmail } from "../src/modules/email/email.templates.js";
import {
  anonymousApi,
  api,
  app,
  createProject,
  createSignedInUser,
  emailSender,
  n8nClient,
  prisma,
  resetDb,
  sentEmails,
  TEST_ADMIN,
} from "./helpers.js";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

const PASSWORD = "correct horse 1";
const inviteToken = (message) => message.text.match(/\/invite\/([a-f0-9]{64})/)?.[1];
const as = (cookie) => (method, url) => request(app)[method](url).set("Cookie", cookie);

describe("Inviting people by email", () => {
  it("emails an invitation link; the person chooses a password and is signed in", async () => {
    const pncc = await createProject({ name: "PNCC" });
    const res = await api()
      .post("/api/users")
      .set("Host", "localhost:4100")
      .set("X-Forwarded-Proto", "https")
      .send({ name: "Maria Santos", email: "maria@test.local", projectIds: [pncc.id] });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ status: "INVITED", invitation: "PENDING" });
    expect(res.body.emails).toEqual([expect.objectContaining({ to: "maria@test.local", kind: "INVITATION", status: "SENT" })]);

    const [message] = sentEmails();
    expect(message.subject).toBe(`${TEST_ADMIN.name} invited you to AI QA Studio`);
    expect(message.html).toContain("Accept invitation");
    expect(message.html).toContain("PNCC");
    const token = inviteToken(message);
    // The link uses the address the admin is using (https behind the tunnel).
    expect(message.text).toContain(`https://localhost:4100/invite/${token}`);
    // Only a hash of the token is stored.
    const stored = await prisma.user.findUnique({ where: { email: "maria@test.local" } });
    expect(stored.inviteTokenHash).not.toBe(token);

    const info = await anonymousApi().get(`/api/auth/invitations/${token}`);
    expect(info.body).toEqual({ name: "Maria Santos", email: "maria@test.local", role: "MEMBER" });

    const accept = await anonymousApi().post(`/api/auth/invitations/${token}/accept`).send({ password: PASSWORD });
    expect(accept.status).toBe(200);
    expect(accept.body.user).toMatchObject({ email: "maria@test.local", status: "ACTIVE" });
    const cookie = accept.headers["set-cookie"].find((c) => c.startsWith("aqs_session=")).split(";")[0];
    expect((await anonymousApi().get(`/api/projects/${pncc.id}`).set("Cookie", cookie)).status).toBe(200);

    // The link works once.
    expect((await anonymousApi().get(`/api/auth/invitations/${token}`)).status).toBe(404);
    const login = await anonymousApi().post("/api/auth/login").send({ email: "maria@test.local", password: PASSWORD });
    expect(login.status).toBe(200);
  });

  it("refuses expired, unknown and malformed links", async () => {
    await api().post("/api/users").send({ name: "Jun", email: "jun@test.local" });
    const token = inviteToken(sentEmails()[0]);
    await prisma.user.update({ where: { email: "jun@test.local" }, data: { inviteExpiresAt: new Date(Date.now() - 1000) } });

    for (const t of [token, "a".repeat(64), "not-a-token"]) {
      const res = await anonymousApi().get(`/api/auth/invitations/${t}`);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("INVITATION_INVALID");
    }
    expect((await anonymousApi().post(`/api/auth/invitations/${token}/accept`).send({ password: PASSWORD })).status).toBe(404);
    expect((await api().get("/api/users")).body.items.find((u) => u.email === "jun@test.local").invitation).toBe("EXPIRED");
  });

  it("resends an invitation with a new link; the old one stops working", async () => {
    const created = (await api().post("/api/users").send({ name: "Jun", email: "jun@test.local" })).body.data;
    const oldToken = inviteToken(sentEmails()[0]);

    const again = await api().post(`/api/users/${created.id}/invitation`);
    expect(again.status).toBe(200);
    expect(again.body.emails[0]).toMatchObject({ kind: "INVITATION", status: "SENT" });
    const newToken = inviteToken(sentEmails()[1]);
    expect(newToken).not.toBe(oldToken);
    expect((await anonymousApi().get(`/api/auth/invitations/${oldToken}`)).status).toBe(404);
    expect((await anonymousApi().get(`/api/auth/invitations/${newToken}`)).status).toBe(200);
  });

  it("doesn't re-invite someone who already signed in, and is admin-only", async () => {
    const tess = await createSignedInUser({ email: "t@test.local", name: "Tess" });
    const res = await api().post(`/api/users/${tess.user.id}/invitation`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("ALREADY_JOINED");
    expect((await as(tess.cookie)("post", `/api/users/${tess.user.id}/invitation`)).status).toBe(403);
  });

  it("doesn't email anything when the admin sets the password themselves", async () => {
    const res = await api().post("/api/users").send({ name: "Pat", email: "pat@test.local", password: PASSWORD });
    expect(res.body.emails).toEqual([]);
    expect(emailSender.send).not.toHaveBeenCalled();
  });
});

describe("Emails about project access and accounts", () => {
  it("tells a tester which projects were added and removed, in one email each", async () => {
    const pncc = await createProject({ name: "PNCC" });
    const fiber = await createProject({ name: "Fiber" });
    const billing = await createProject({ name: "Billing" });
    const tess = await createSignedInUser({ email: "t@test.local", name: "Tess", projectIds: [pncc.id] });

    const res = await api().patch(`/api/users/${tess.user.id}`).send({ projectIds: [fiber.id, billing.id] });
    expect(res.body.emails.map((e) => [e.kind, e.status])).toEqual([
      ["PROJECTS_ADDED", "SENT"],
      ["PROJECTS_REMOVED", "SENT"],
    ]);
    const [added, removed] = sentEmails();
    expect(added.subject).toBe("You now have access to 2 projects");
    expect(added.html).toContain("Billing");
    expect(added.html).toContain("Fiber");
    expect(added.html).toContain(TEST_ADMIN.name);
    expect(removed.subject).toBe("Your access to PNCC was removed");

    // Saving without changes sends nothing.
    emailSender.send.mockClear();
    await api().patch(`/api/users/${tess.user.id}`).send({ projectIds: [billing.id, fiber.id], name: "Tess T" });
    expect(emailSender.send).not.toHaveBeenCalled();
  });

  it("emails testers added to or removed from a project from its card", async () => {
    const pncc = await createProject({ name: "PNCC Lotusflare" });
    const tess = await createSignedInUser({ email: "t@test.local", name: "Tess", projectIds: [pncc.id] });
    const max = await createSignedInUser({ email: "m@test.local", name: "Max" });

    const res = await api().put(`/api/projects/${pncc.id}/members`).send({ userIds: [max.user.id] });
    expect(res.body.emails.map((e) => [e.to, e.kind]).sort()).toEqual([
      ["m@test.local", "PROJECTS_ADDED"],
      ["t@test.local", "PROJECTS_REMOVED"],
    ]);
    expect(sentEmails().find((m) => m.to === "m@test.local").subject).toBe("You now have access to PNCC Lotusflare");
  });

  it("doesn't send project emails to someone still invited (their invitation lists the projects)", async () => {
    const pncc = await createProject({ name: "PNCC" });
    const created = (await api().post("/api/users").send({ name: "Jun", email: "jun@test.local" })).body.data;
    emailSender.send.mockClear();

    const res = await api().patch(`/api/users/${created.id}`).send({ projectIds: [pncc.id] });
    expect(res.body.emails).toEqual([]);
    await api().post(`/api/users/${created.id}/invitation`);
    expect(sentEmails()[0].html).toContain("PNCC");
  });

  it("emails a person when their account is disabled, enabled again or removed", async () => {
    const tess = await createSignedInUser({ email: "t@test.local", name: "Tess" });

    const off = await api().patch(`/api/users/${tess.user.id}`).send({ active: false });
    expect(off.body.emails[0]).toMatchObject({ kind: "ACCOUNT_DISABLED", status: "SENT" });
    const on = await api().patch(`/api/users/${tess.user.id}`).send({ active: true });
    expect(on.body.emails[0]).toMatchObject({ kind: "ACCOUNT_ENABLED" });
    const gone = await api().delete(`/api/users/${tess.user.id}`);
    expect(gone.body.emails[0]).toMatchObject({ to: "t@test.local", kind: "ACCOUNT_REMOVED", status: "SENT" });
    expect(sentEmails().map((m) => m.subject)).toEqual([
      "Your AI QA Studio account was disabled",
      "Your AI QA Studio account is active again",
      "Your AI QA Studio account was removed",
    ]);
  });

  it("welcomes someone who creates their own account", async () => {
    const res = await anonymousApi()
      .post("/api/auth/register")
      .send({ name: "Ana", email: "ana@test.local", password: PASSWORD, storedLocally: true });
    expect(res.body.emails[0]).toMatchObject({ kind: "WELCOME", status: "SENT" });
    expect(sentEmails()[0].subject).toBe("Welcome to AI QA Studio");
  });
});

describe("When sending fails or isn't set up", () => {
  it("still saves the change, records the failure, and can retry it", async () => {
    const pncc = await createProject({ name: "PNCC" });
    const tess = await createSignedInUser({ email: "t@test.local", name: "Tess" });
    emailSender.send.mockRejectedValueOnce(new Error("Gmail said no"));

    const res = await api().patch(`/api/users/${tess.user.id}`).send({ projectIds: [pncc.id] });
    expect(res.status).toBe(200);
    expect(res.body.data.projectIds).toEqual([pncc.id]);
    expect(res.body.emails[0]).toMatchObject({ status: "FAILED", error: "Gmail said no" });

    const log = await api().get("/api/emails");
    expect(log.body.configured).toBe(true);
    expect(log.body.items[0]).toMatchObject({ to: "t@test.local", status: "FAILED", attempts: 1 });
    expect(log.body.items[0]).not.toHaveProperty("html");

    const retry = await api().post(`/api/emails/${log.body.items[0].id}/retry`);
    expect(retry.body.data).toMatchObject({ status: "SENT", attempts: 2, error: null });
    expect(emailSender.send).toHaveBeenCalledTimes(2);
  });

  it("marks emails as not sent when no sender is set up", async () => {
    const offline = createApp({ prisma, env, n8nClient, emailSender: null });
    const admin = await prisma.user.findUnique({ where: { email: TEST_ADMIN.email } });
    const { cookie } = await createSignedInUser({ email: "a2@test.local", name: "Admin 2", role: "ADMIN" });
    const res = await request(offline).post("/api/users").set("Cookie", cookie).send({ name: "Jun", email: "jun@test.local" });
    expect(res.status).toBe(201);
    expect(res.body.emails[0]).toMatchObject({ status: "SKIPPED" });
    expect(res.body.emails[0].error).toMatch(/not set up/);
    expect((await request(offline).get("/api/emails").set("Cookie", cookie)).body.configured).toBe(false);
    expect(admin).toBeTruthy();
  });

  it("keeps the email log admin-only", async () => {
    const tess = await createSignedInUser({ email: "t@test.local", name: "Tess" });
    expect((await as(tess.cookie)("get", "/api/emails")).status).toBe(403);
    expect((await anonymousApi().get("/api/emails")).status).toBe(401);
  });
});

describe("Email templates", () => {
  it("escapes names and project names", () => {
    const { html, subject } = renderEmail("PROJECTS_ADDED", {
      name: '<img src=x onerror="alert(1)">',
      projects: ["<b>Evil</b> & Co"],
      byName: "Ada",
      link: "https://qa.example/projects",
    });
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(html).toContain("&lt;b&gt;Evil&lt;/b&gt; &amp; Co");
    expect(subject).toBe("You now have access to <b>Evil</b> & Co");
    expect(escapeHtml(`"'`)).toBe("&quot;&#39;");
  });

  it("renders every kind with a subject, HTML and text", () => {
    const data = { name: "Ada", projects: ["PNCC"], byName: "Harley", inviterName: "Harley", roleLabel: "Tester", link: "https://x/y", expiresDays: 7 };
    for (const kind of ["INVITATION", "WELCOME", "PROJECTS_ADDED", "PROJECTS_REMOVED", "ACCOUNT_DISABLED", "ACCOUNT_ENABLED", "ACCOUNT_REMOVED"]) {
      const email = renderEmail(kind, data);
      expect(email.subject.length, kind).toBeGreaterThan(5);
      expect(email.html, kind).toContain("<!DOCTYPE html>");
      expect(email.text, kind).toContain("Hi Ada");
    }
  });
});

describe("Sending through n8n", () => {
  const config = { webhookUrl: "http://n8n.local/webhook/email", requestSecret: "s".repeat(32), from: "AI QA Studio <qa@example.com>" };

  it("posts the email with the shared secret", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    await createN8nEmailSender({ ...config, fetchImpl }).send({ to: "a@b.c", subject: "S", html: "<p>h</p>", text: "t" });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(config.webhookUrl);
    expect(init.headers["X-AQS-Request-Secret"]).toBe(config.requestSecret);
    expect(JSON.parse(init.body)).toEqual({ from: config.from, to: "a@b.c", subject: "S", html: "<p>h</p>", text: "t" });
  });

  it("explains common failures", async () => {
    const reply = (status, body) => vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));
    await expect(createN8nEmailSender({ ...config, fetchImpl: reply(404, {}) }).send({})).rejects.toThrow(/not active/);
    await expect(createN8nEmailSender({ ...config, fetchImpl: reply(502, { ok: false, error: "Invalid login" }) }).send({})).rejects.toThrow(
      "Invalid login",
    );
    const refused = vi.fn().mockRejectedValue(Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNREFUSED" } }));
    await expect(createN8nEmailSender({ ...config, fetchImpl: refused }).send({})).rejects.toThrow("n8n is not running");
  });

  it("is off without a webhook address or sender", () => {
    expect(createN8nEmailSender({ ...config, webhookUrl: undefined })).toBeNull();
    expect(createN8nEmailSender({ ...config, from: undefined })).toBeNull();
  });
});
