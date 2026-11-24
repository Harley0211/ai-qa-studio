import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { hashPassword } from "../src/modules/auth/auth.passwords.js";
import {
  anonymousApi,
  api,
  createProject,
  createSignedInUser,
  prisma,
  resetDb,
  TEST_ADMIN,
} from "./helpers.js";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

const PASSWORD = "correct horse 1";

// A user with a real password, so sign-in can be tested.
async function createUser({ email = "tester@example.com", name = "Tess Tester", role = "MEMBER", password = PASSWORD } = {}) {
  return prisma.user.create({
    data: { email, name, role, passwordHash: await hashPassword(password) },
  });
}

const sessionCookieFrom = (res) =>
  (res.headers["set-cookie"] ?? []).find((c) => c.startsWith("aqs_session="));

const cookieValue = (setCookie) => setCookie.split(";")[0];

async function login(email = "tester@example.com", password = PASSWORD) {
  return anonymousApi().post("/api/auth/login").send({ email, password });
}

describe("First run", () => {
  beforeEach(async () => {
    await prisma.session.deleteMany();
    await prisma.user.deleteMany();
  });

  it("asks for the first admin when there are no users", async () => {
    const res = await anonymousApi().get("/api/auth/status");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ setupRequired: true, signupAllowed: false, user: null });
  });

  it("creates the first admin, signs them in, and closes setup", async () => {
    const res = await anonymousApi()
      .post("/api/auth/setup")
      .send({ name: "Harley", email: "Harley@Example.com ", password: PASSWORD });

    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ name: "Harley", email: "harley@example.com", role: "ADMIN" });
    expect(res.body.user).not.toHaveProperty("passwordHash");

    const cookie = sessionCookieFrom(res);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Strict/);

    const status = await anonymousApi().get("/api/auth/status").set("Cookie", cookieValue(cookie));
    expect(status.body).toMatchObject({ setupRequired: false, user: { email: "harley@example.com" } });

    const again = await anonymousApi()
      .post("/api/auth/setup")
      .send({ name: "Someone", email: "someone@example.com", password: PASSWORD });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("SETUP_DONE");
    expect(await prisma.user.count()).toBe(1);
  });

  it("validates the first admin's details", async () => {
    const res = await anonymousApi()
      .post("/api/auth/setup")
      .send({ name: "", email: "not-an-email", password: "short" });

    expect(res.status).toBe(400);
    expect(Object.keys(res.body.error.details.fields).sort()).toEqual(["email", "name", "password"]);
  });
});

describe("Signing in and out", () => {
  it("signs in with the right password, case-insensitive email", async () => {
    await createUser();

    const res = await login("TESTER@example.com");

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ email: "tester@example.com", role: "MEMBER" });

    const projects = await anonymousApi()
      .get("/api/projects")
      .set("Cookie", cookieValue(sessionCookieFrom(res)));
    expect(projects.status).toBe(200);
  });

  it("gives the same answer for a wrong password and an unknown email", async () => {
    await createUser();

    const wrong = await login("tester@example.com", "wrong password");
    const unknown = await login("nobody@example.com", PASSWORD);

    for (const res of [wrong, unknown]) {
      expect(res.status).toBe(401);
      expect(res.body.error).toEqual({
        code: "INVALID_CREDENTIALS",
        message: "Email or password is incorrect",
      });
      expect(sessionCookieFrom(res)).toBeUndefined();
    }
  });

  it("refuses sign-in for an email after 10 failed attempts", async () => {
    await createUser({ email: "locked@example.com" });

    for (let i = 0; i < 10; i += 1) {
      expect((await login("locked@example.com", "nope")).status).toBe(401);
    }

    const blocked = await login("locked@example.com", PASSWORD);
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe("TOO_MANY_ATTEMPTS");
  });

  it("signs out: the session stops working", async () => {
    await createUser();
    const cookie = cookieValue(sessionCookieFrom(await login()));

    const out = await anonymousApi().post("/api/auth/logout").set("Cookie", cookie);
    expect(out.status).toBe(204);
    expect(sessionCookieFrom(out)).toMatch(/aqs_session=;/);

    const after = await anonymousApi().get("/api/projects").set("Cookie", cookie);
    expect(after.status).toBe(401);
  });

  it("does not accept an expired session", async () => {
    const { user, cookie } = await createSignedInUser({ email: "old@example.com", name: "Old" });
    await prisma.session.updateMany({
      where: { userId: user.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const res = await anonymousApi().get("/api/projects").set("Cookie", cookie);
    expect(res.status).toBe(401);
  });
});

describe("What needs a sign-in", () => {
  it("protects the project API but not the health check", async () => {
    const projects = await anonymousApi().get("/api/projects");
    expect(projects.status).toBe(401);
    expect(projects.body.error).toEqual({ code: "UNAUTHENTICATED", message: "Please sign in to continue" });

    expect((await anonymousApi().post("/api/projects").send({ name: "X" })).status).toBe(401);
    expect((await anonymousApi().get("/api/health")).status).toBe(200);
  });

  it("lets n8n reach its callback and signed downloads, which have their own tokens", async () => {
    const project = await createProject();

    const callback = await anonymousApi()
      .post(`/api/projects/${project.id}/generations/run1/callback`)
      .send({});
    expect(callback.status).toBe(401);
    expect(callback.body.error.code).toBe("INVALID_CALLBACK_TOKEN");

    const failure = await anonymousApi()
      .post(`/api/projects/${project.id}/generations/run1/failure`)
      .send({});
    expect(failure.body.error.code).toBe("INVALID_CALLBACK_TOKEN");

    const download = await anonymousApi().get(
      `/api/projects/${project.id}/evidence/ev1/signed-file?expires=1&signature=x`,
    );
    expect(download.body.error?.code).not.toBe("UNAUTHENTICATED");

    // Everything else under a project still needs a sign-in.
    const unsignedFile = await anonymousApi().get(`/api/projects/${project.id}/evidence/ev1/file`);
    expect(unsignedFile.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("refuses changes sent from another website", async () => {
    const res = await api()
      .post("/api/projects")
      .set("Origin", "https://evil.example")
      .send({ name: "From elsewhere" });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN_ORIGIN");

    const own = await api()
      .post("/api/projects")
      .set("Origin", "http://localhost:5173")
      .send({ name: "From the app" });
    expect(own.status).toBe(201);
  });
});

describe("Changing your own password", () => {
  it("checks the current password, then signs out your other browsers", async () => {
    await createUser();
    const here = cookieValue(sessionCookieFrom(await login()));
    const elsewhere = cookieValue(sessionCookieFrom(await login()));

    const wrong = await anonymousApi()
      .post("/api/auth/password")
      .set("Cookie", here)
      .send({ currentPassword: "nope", newPassword: "a brand new one" });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error.details.fields).toHaveProperty("currentPassword");

    const ok = await anonymousApi()
      .post("/api/auth/password")
      .set("Cookie", here)
      .send({ currentPassword: PASSWORD, newPassword: "a brand new one" });
    expect(ok.status).toBe(204);

    expect((await anonymousApi().get("/api/projects").set("Cookie", here)).status).toBe(200);
    expect((await anonymousApi().get("/api/projects").set("Cookie", elsewhere)).status).toBe(401);

    expect((await login("tester@example.com", PASSWORD)).status).toBe(401);
    expect((await login("tester@example.com", "a brand new one")).status).toBe(200);
  });

  it("needs a sign-in", async () => {
    const res = await anonymousApi()
      .post("/api/auth/password")
      .send({ currentPassword: "x", newPassword: "long enough" });
    expect(res.status).toBe(401);
  });
});

describe("Managing users (admin)", () => {
  const usersApi = () => api();

  it("lists users without password hashes", async () => {
    await createUser();
    const res = await usersApi().get("/api/users");

    expect(res.status).toBe(200);
    expect(res.body.items.map((u) => u.email)).toEqual([TEST_ADMIN.email, "tester@example.com"]);
    expect(res.body.items[0]).not.toHaveProperty("passwordHash");
  });

  it("adds a user who can then sign in", async () => {
    const res = await usersApi()
      .post("/api/users")
      .send({ name: "New Person", email: "New@Example.com", password: PASSWORD });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ email: "new@example.com", role: "MEMBER" });
    expect((await login("new@example.com")).status).toBe(200);

    const duplicate = await usersApi()
      .post("/api/users")
      .send({ name: "Again", email: "new@example.com", password: PASSWORD });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe("EMAIL_TAKEN");
  });

  it("is admin-only", async () => {
    const { cookie } = await createSignedInUser({ email: "member@example.com", name: "Member" });

    const list = await anonymousApi().get("/api/users").set("Cookie", cookie);
    expect(list.status).toBe(403);
    expect(list.body.error.code).toBe("FORBIDDEN");

    const add = await anonymousApi()
      .post("/api/users")
      .set("Cookie", cookie)
      .send({ name: "X", email: "x@example.com", password: PASSWORD });
    expect(add.status).toBe(403);

    expect((await anonymousApi().get("/api/users")).status).toBe(401);

    // Testers see project names, but only open the ones assigned to them.
    await createProject({ name: "Shared" });
    const projects = await anonymousApi().get("/api/projects").set("Cookie", cookie);
    expect(projects.body.items).toEqual([{ id: expect.any(String), name: "Shared", access: "NONE" }]);
  });

  it("resets a password, which signs that user out", async () => {
    const user = await createUser();
    const cookie = cookieValue(sessionCookieFrom(await login()));

    const res = await usersApi().patch(`/api/users/${user.id}`).send({ password: "reset by admin" });
    expect(res.status).toBe(200);

    expect((await anonymousApi().get("/api/projects").set("Cookie", cookie)).status).toBe(401);
    expect((await login("tester@example.com", "reset by admin")).status).toBe(200);
  });

  it("changes names and roles, but always keeps one admin", async () => {
    const user = await createUser();

    const promoted = await usersApi().patch(`/api/users/${user.id}`).send({ role: "ADMIN", name: "Tess" });
    expect(promoted.body.data).toMatchObject({ role: "ADMIN", name: "Tess" });

    // With two admins, one can go back to member...
    const demoted = await usersApi().patch(`/api/users/${user.id}`).send({ role: "MEMBER" });
    expect(demoted.body.data.role).toBe("MEMBER");

    // ...but an admin can't demote themselves.
    const admin = await prisma.user.findUnique({ where: { email: TEST_ADMIN.email } });
    const self = await usersApi().patch(`/api/users/${admin.id}`).send({ role: "MEMBER" });
    expect(self.status).toBe(400);
    expect(self.body.error.code).toBe("CANNOT_CHANGE_SELF");
  });

  it("removes a user and their sessions, but not yourself", async () => {
    const user = await createUser();
    const cookie = cookieValue(sessionCookieFrom(await login()));

    expect((await usersApi().delete(`/api/users/${user.id}`)).status).toBe(204);
    expect(await prisma.user.findUnique({ where: { id: user.id } })).toBeNull();
    expect((await anonymousApi().get("/api/projects").set("Cookie", cookie)).status).toBe(401);

    const admin = await prisma.user.findUnique({ where: { email: TEST_ADMIN.email } });
    const self = await usersApi().delete(`/api/users/${admin.id}`);
    expect(self.status).toBe(400);
    expect(self.body.error.code).toBe("CANNOT_REMOVE_SELF");

    expect((await usersApi().delete("/api/users/unknown")).status).toBe(404);
  });

  it("validates new users", async () => {
    const res = await usersApi()
      .post("/api/users")
      .send({ name: "", email: "bad", password: "short", role: "OWNER" });
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.error.details.fields).sort()).toEqual([
      "email",
      "name",
      "password",
      "role",
    ]);
  });
});
