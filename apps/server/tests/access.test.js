import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { hashPassword } from "../src/modules/auth/auth.passwords.js";
import { anonymousApi, api, app, createProject, createSignedInUser, prisma, resetDb, TEST_ADMIN } from "./helpers.js";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

const PASSWORD = "correct horse 1";
const as = (cookie) => (method, url) => request(app)[method](url).set("Cookie", cookie);
const cookieFrom = (res) =>
  (res.headers["set-cookie"] ?? []).find((c) => c.startsWith("aqs_session="));

async function twoProjects() {
  return { pncc: await createProject({ name: "PNCC" }), fiber: await createProject({ name: "Fiber" }) };
}

describe("Testers only open assigned projects", () => {
  it("lists assigned projects in full and the others locked, name only", async () => {
    const { pncc, fiber } = await twoProjects();
    const tester = await createSignedInUser({ email: "t@test.local", name: "Tess", projectIds: [pncc.id] });

    const { body } = await as(tester.cookie)("get", "/api/projects");
    expect(body.items.map((p) => [p.name, p.access])).toEqual([
      ["PNCC", "ASSIGNED"],
      ["Fiber", "NONE"],
    ]);
    expect(body.items[1]).toEqual({ id: fiber.id, name: "Fiber", access: "NONE" });
    expect(body.items[0]).not.toHaveProperty("memberCount");
  });

  it("refuses every request inside a project that isn't assigned", async () => {
    const { pncc, fiber } = await twoProjects();
    const tester = await createSignedInUser({ email: "t@test.local", name: "Tess", projectIds: [pncc.id] });
    const call = as(tester.cookie);

    expect((await call("get", `/api/projects/${pncc.id}`)).status).toBe(200);
    for (const path of ["", "/urls", "/evidence", "/test-cases", "/documents", "/bug-reports", "/har-files"]) {
      const res = await call("get", `/api/projects/${fiber.id}${path}`);
      expect(res.status, path).toBe(403);
      expect(res.body.error.code).toBe("NO_PROJECT_ACCESS");
    }
    expect((await call("post", `/api/projects/${fiber.id}/urls`).send({ url: "https://x.example" })).status).toBe(403);
    expect((await call("get", "/api/projects/missing")).status).toBe(404);
  });

  it("applies a removed assignment on the very next request", async () => {
    const { pncc } = await twoProjects();
    const tester = await createSignedInUser({ email: "t@test.local", name: "Tess", projectIds: [pncc.id] });
    expect((await as(tester.cookie)("get", `/api/projects/${pncc.id}`)).status).toBe(200);

    await api().patch(`/api/users/${tester.user.id}`).send({ projectIds: [] });

    expect((await as(tester.cookie)("get", `/api/projects/${pncc.id}`)).status).toBe(403);
  });

  it("lets admins open every project, with the number of assigned testers", async () => {
    const { pncc } = await twoProjects();
    await createSignedInUser({ email: "t@test.local", name: "Tess", projectIds: [pncc.id] });

    const { body } = await api().get("/api/projects");
    expect(Object.fromEntries(body.items.map((p) => [p.name, [p.access, p.memberCount]]))).toEqual({
      PNCC: ["ADMIN", 1],
      Fiber: ["ADMIN", 0],
    });
  });
});

describe("Assigning (admin)", () => {
  it("assigns testers to a project from the project", async () => {
    const { pncc } = await twoProjects();
    const tess = await createSignedInUser({ email: "t@test.local", name: "Tess" });
    const admin2 = await createSignedInUser({ email: "a2@test.local", name: "Second admin", role: "ADMIN" });

    const res = await api().put(`/api/projects/${pncc.id}/members`).send({ userIds: [tess.user.id, admin2.user.id, "nobody"] });
    expect(res.status).toBe(200);
    // Admins and unknown ids are skipped.
    expect(res.body.userIds).toEqual([tess.user.id]);
    expect((await as(tess.cookie)("get", `/api/projects/${pncc.id}`)).status).toBe(200);
    expect((await api().get(`/api/projects/${pncc.id}/members`)).body.userIds).toEqual([tess.user.id]);

    // Testers can't change assignments.
    expect((await as(tess.cookie)("put", `/api/projects/${pncc.id}/members`).send({ userIds: [] })).status).toBe(403);
  });

  it("assigns projects to a tester from the user, and lists them", async () => {
    const { pncc, fiber } = await twoProjects();
    const tess = await createSignedInUser({ email: "t@test.local", name: "Tess" });

    const saved = await api()
      .patch(`/api/users/${tess.user.id}`)
      .send({ name: "Tess T", projectIds: [pncc.id, fiber.id, "gone"] });
    expect(saved.status).toBe(200);
    expect(saved.body.data).toMatchObject({ name: "Tess T", status: "ACTIVE" });
    expect(saved.body.data.projectIds.sort()).toEqual([pncc.id, fiber.id].sort());

    const list = await api().get("/api/users");
    expect(list.body.projectTotal).toBe(2);
    expect(list.body.items.find((u) => u.id === tess.user.id).projectIds).toHaveLength(2);
    expect((await api().get(`/api/users/${tess.user.id}`)).body.data.email).toBe("t@test.local");
  });

  it("adds a tester with projects; they show as Invited until they sign in", async () => {
    const { pncc } = await twoProjects();
    const res = await api()
      .post("/api/users")
      .send({ name: "Jun", email: "jun@test.local", password: PASSWORD, projectIds: [pncc.id] });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ status: "INVITED", projectIds: [pncc.id] });

    await anonymousApi().post("/api/auth/login").send({ email: "jun@test.local", password: PASSWORD });
    const after = await api().get(`/api/users/${res.body.data.id}`);
    expect(after.body.data.status).toBe("ACTIVE");
  });

  it("changes a user's email, but not to one that is taken", async () => {
    const tess = await createSignedInUser({ email: "t@test.local", name: "Tess" });
    expect((await api().patch(`/api/users/${tess.user.id}`).send({ email: "New@Test.local" })).body.data.email).toBe(
      "new@test.local",
    );
    const taken = await api().patch(`/api/users/${tess.user.id}`).send({ email: TEST_ADMIN.email });
    expect(taken.status).toBe(409);
    expect(taken.body.error.details.fields).toHaveProperty("email");
  });
});

describe("Disabling accounts", () => {
  it("signs a disabled user out and refuses their sign-in, until enabled again", async () => {
    const user = await prisma.user.create({
      data: { email: "ana@test.local", name: "Ana", passwordHash: await hashPassword(PASSWORD), lastLoginAt: new Date() },
    });
    const login = () => anonymousApi().post("/api/auth/login").send({ email: "ana@test.local", password: PASSWORD });
    const cookie = cookieFrom(await login()).split(";")[0];

    const disabled = await api().patch(`/api/users/${user.id}`).send({ active: false });
    expect(disabled.body.data).toMatchObject({ active: false, status: "DISABLED" });
    expect((await anonymousApi().get("/api/projects").set("Cookie", cookie)).status).toBe(401);

    const refused = await login();
    expect(refused.status).toBe(403);
    expect(refused.body.error.code).toBe("ACCOUNT_DISABLED");
    // A wrong password still gets the usual answer (doesn't reveal the account).
    const wrong = await anonymousApi().post("/api/auth/login").send({ email: "ana@test.local", password: "nope" });
    expect(wrong.body.error.code).toBe("INVALID_CREDENTIALS");

    await api().patch(`/api/users/${user.id}`).send({ active: true });
    expect((await login()).status).toBe(200);
  });

  it("doesn't let an admin disable or demote themselves", async () => {
    const admin = await prisma.user.findUnique({ where: { email: TEST_ADMIN.email } });
    const disable = await api().patch(`/api/users/${admin.id}`).send({ active: false });
    expect(disable.status).toBe(400);
    expect(disable.body.error.code).toBe("CANNOT_CHANGE_SELF");
  });
});

describe("Creating your own account", () => {
  const register = (body) =>
    anonymousApi()
      .post("/api/auth/register")
      .send({ name: "Maria", email: "maria@test.local", password: PASSWORD, storedLocally: true, ...body });

  it("creates a signed-in tester with no projects", async () => {
    await twoProjects();
    const res = await register();
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ role: "MEMBER", status: "ACTIVE" });

    const cookie = cookieFrom(res);
    // Without "Remember me" the cookie ends with the browser.
    expect(cookie).not.toMatch(/Expires=/);
    const projects = await anonymousApi().get("/api/projects").set("Cookie", cookie.split(";")[0]);
    expect(projects.body.items.every((p) => p.access === "NONE")).toBe(true);
  });

  it("needs the local-storage confirmation and a free email", async () => {
    const unconfirmed = await register({ storedLocally: false });
    expect(unconfirmed.status).toBe(400);
    expect(unconfirmed.body.error.details.fields).toHaveProperty("storedLocally");

    const taken = await register({ email: TEST_ADMIN.email });
    expect(taken.status).toBe(409);
    expect(taken.body.error.code).toBe("EMAIL_TAKEN");
  });

  it("is said to be open on the status endpoint", async () => {
    expect((await anonymousApi().get("/api/auth/status")).body.signupAllowed).toBe(true);
  });
});

describe("Remember me", () => {
  it("keeps a long cookie when on and a browser-session cookie when off", async () => {
    await prisma.user.create({
      data: { email: "rem@test.local", name: "Rem", passwordHash: await hashPassword(PASSWORD) },
    });
    const login = (remember) =>
      anonymousApi().post("/api/auth/login").send({ email: "rem@test.local", password: PASSWORD, remember });

    const on = await login(true);
    expect(cookieFrom(on)).toMatch(/Expires=/);
    const off = await login(false);
    expect(cookieFrom(off)).not.toMatch(/Expires=/);

    const status = await anonymousApi().get("/api/auth/status").set("Cookie", cookieFrom(off).split(";")[0]);
    expect(status.body).toMatchObject({ remember: false, user: { email: "rem@test.local" } });
  });
});
