import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { env } from "../src/config/env.js";
import { hashPassword } from "../src/modules/auth/auth.passwords.js";
import { n8nClient, prisma, resetDb } from "./helpers.js";

// The app as it runs behind a Cloudflare quick tunnel, serving the built web app.
const webDist = mkdtempSync(path.join(os.tmpdir(), "aqs-web-dist-"));
mkdirSync(path.join(webDist, "assets"));
writeFileSync(path.join(webDist, "index.html"), "<!doctype html><title>AI QA Studio</title>");
writeFileSync(path.join(webDist, "assets", "index-abc123.js"), "console.log('app')");

const liveApp = createApp({
  prisma,
  env: { ...env, WEB_DIST_DIR: webDist, publicHosts: [".trycloudflare.com"] },
  n8nClient,
});

const TUNNEL_HOST = "calm-river-1234.trycloudflare.com";
const viaTunnel = (method, url) =>
  request(liveApp)[method](url).set("Host", TUNNEL_HOST).set("X-Forwarded-Proto", "https");

beforeEach(resetDb);
afterAll(async () => {
  rmSync(webDist, { recursive: true, force: true });
  await prisma.$disconnect();
});

const PASSWORD = "correct horse 1";
async function createUser(email = "tester@example.com") {
  return prisma.user.create({
    data: { email, name: "Tess", role: "MEMBER", passwordHash: await hashPassword(PASSWORD) },
  });
}

describe("Going live through a tunnel", () => {
  it("accepts the tunnel's host name but still refuses others", async () => {
    expect((await viaTunnel("get", "/api/health")).status).toBe(200);

    const other = await request(liveApp).get("/api/health").set("Host", "evil.example.com");
    expect(other.status).toBe(403);
    expect(other.body.error.code).toBe("FORBIDDEN_HOST");

    // The suffix alone is not a host.
    const bare = await request(liveApp).get("/api/health").set("Host", "trycloudflare.com");
    expect(bare.status).toBe(403);
  });

  it("serves the built web app for every page, and the API under /api", async () => {
    const page = await viaTunnel("get", "/projects/p1/test-cases");
    expect(page.status).toBe(200);
    expect(page.text).toContain("<title>AI QA Studio</title>");
    expect(page.headers["cache-control"]).toBe("no-cache");
    expect(page.headers["content-security-policy"]).toContain("script-src 'self'");

    const asset = await viaTunnel("get", "/assets/index-abc123.js");
    expect(asset.status).toBe(200);
    expect(asset.headers["cache-control"]).toContain("immutable");

    const unknownApi = await viaTunnel("get", "/api/nothing-here");
    expect(unknownApi.status).toBe(404);
    expect(unknownApi.body.error.code).toBe("NOT_FOUND");
  });

  it("signs in over https with a Secure cookie and accepts same-origin changes", async () => {
    await createUser();

    const login = await viaTunnel("post", "/api/auth/login")
      .set("Origin", `https://${TUNNEL_HOST}`)
      .send({ email: "tester@example.com", password: PASSWORD });

    expect(login.status).toBe(200);
    const cookie = login.headers["set-cookie"].find((c) => c.startsWith("aqs_session="));
    expect(cookie).toMatch(/Secure/);
    expect(cookie).toMatch(/HttpOnly/);

    const created = await viaTunnel("post", "/api/projects")
      .set("Origin", `https://${TUNNEL_HOST}`)
      .set("Cookie", cookie.split(";")[0])
      .send({ name: "Live project" });
    expect(created.status).toBe(201);

    const crossSite = await viaTunnel("post", "/api/projects")
      .set("Origin", "https://evil.example.com")
      .set("Cookie", cookie.split(";")[0])
      .send({ name: "Not allowed" });
    expect(crossSite.status).toBe(403);
  });

  it("keeps plain http (local use) cookies without Secure", async () => {
    await createUser();
    const login = await request(liveApp)
      .post("/api/auth/login")
      .send({ email: "tester@example.com", password: PASSWORD });
    const cookie = login.headers["set-cookie"].find((c) => c.startsWith("aqs_session="));
    expect(cookie).not.toMatch(/Secure/);
  });

  it("counts failed sign-ins per visitor, so others can't lock you out", async () => {
    await createUser();
    const attempt = (ip, password) =>
      viaTunnel("post", "/api/auth/login")
        .set("X-Forwarded-For", ip)
        .send({ email: "tester@example.com", password });

    for (let i = 0; i < 10; i += 1) {
      expect((await attempt("203.0.113.9", "guess")).status).toBe(401);
    }
    expect((await attempt("203.0.113.9", PASSWORD)).status).toBe(429);

    // The real user, from another address, can still sign in.
    expect((await attempt("198.51.100.7", PASSWORD)).status).toBe(200);
  });
});
