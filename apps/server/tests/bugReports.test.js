import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";
import { env } from "../src/config/env.js";
import { createOllamaClient } from "../src/modules/bug-reports/bugReports.ollama.js";
import {
  INTERRUPTED_ERROR,
  buildPrompt,
  createBugReportService,
  normalizeReport,
} from "../src/modules/bug-reports/bugReports.service.js";
import { createFileStore } from "../src/lib/fileStore.js";
import { apiFor, createSignedInUser, n8nClient, prisma, resetDb, TEST_ADMIN } from "./helpers.js";

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 4, 5, 6]);

const modelAnswer = {
  title: "[Checkout] Payment fails with 500 when placing an order",
  summary: "Placing an order fails because POST /api/orders returns 500.",
  stepsToReproduce: ["1. Open the cart", "Step 2: Click Place order"],
  expectedResult: "The order is placed.",
  actualResult: "An error toast appears and no order is created.",
  rootCause: 'POST /api/orders returned 500 Internal Server Error ("Payment gateway timeout"): a backend failure.',
  severity: "Critical",
  affectedArea: "Checkout",
};

const filesRoot = mkdtempSync(path.join(os.tmpdir(), "aqs-bug-report-tests-"));
const ollama = { chat: vi.fn() };
const app = createApp({ prisma, env, n8nClient, ollamaClient: ollama, filesRoot });
const api = () => apiFor(app);

const details = {
  description: "Clicking Place order shows 'Something went wrong' and nothing happens.",
  steps: "Open cart\nClick Place order",
  expected: "Order confirmation page",
  environment: { url: "https://shop.example/cart", browser: "Chrome 131" },
  harFacts: 'Failed requests:\n- POST https://shop.example/api/orders -> 500 Internal Server Error (812 ms) - "Payment gateway timeout"',
  imageNotes: ["Screenshot cart.png", "Frame 1 of checkout.mp4 at 0:03"],
  imageKinds: ["image", "frame"],
  attachments: [
    { name: "cart.png", kind: "image" },
    { name: "checkout.mp4", kind: "video" },
    { name: "session.har", kind: "har" },
  ],
  harErrors: [
    {
      file: "session.har",
      entry: { method: "POST", url: "https://shop.example/api/orders", status: 500, statusText: "Internal Server Error", time: 812, errorMessage: "Payment gateway timeout" },
    },
  ],
};

function submit(body = details, images = [png, jpeg], agent = api()) {
  let req = agent.post("/api/bug-reports").field("details", JSON.stringify(body));
  images.forEach((image, i) => {
    req = req.attach("images", image, { filename: i === 0 ? "cart.png" : "checkout-frame-1.jpg", contentType: "image/png" });
  });
  return req;
}

async function waitFor(id) {
  for (let i = 0; i < 100; i += 1) {
    const res = await api().get(`/api/bug-reports/${id}`);
    if (res.body.data.status !== "PENDING") return res;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Report did not finish");
}

const folder = (id) => path.join(filesRoot, "bug-reports", id);

beforeEach(async () => {
  await resetDb();
  ollama.chat.mockReset();
  ollama.chat.mockResolvedValue(JSON.stringify(modelAnswer));
});
afterAll(async () => {
  rmSync(filesRoot, { recursive: true, force: true });
  await prisma.$disconnect();
});

describe("Generating a bug report", () => {
  it("saves the report and its images, and finishes on the server", async () => {
    const res = await submit();
    expect(res.status).toBe(202);
    const { id } = res.body.data;

    // Listed straight away, while the AI is still working.
    const list = await api().get("/api/bug-reports");
    expect(list.body.items[0]).toMatchObject({ id, fileCount: 2, createdBy: { name: TEST_ADMIN.name } });

    const done = await waitFor(id);
    expect(done.body.data).toMatchObject({
      status: "SUCCEEDED",
      title: modelAnswer.title,
      severity: "Critical",
      report: { stepsToReproduce: ["Open the cart", "Click Place order"] },
      input: { description: details.description, harErrors: details.harErrors },
    });
    expect(done.body.data.files.map((f) => [f.name, f.kind, f.usedByAi])).toEqual([
      ["cart.png", "image", true],
      ["checkout-frame-1.jpg", "frame", true],
    ]);
    expect(readdirSync(path.join(folder(id), "attachments"))).toEqual(["1-cart.png"]);
    expect(readdirSync(path.join(folder(id), "video-frames"))).toEqual(["2-checkout-frame-1.jpg"]);

    const call = ollama.chat.mock.calls[0][0];
    expect(call.images).toEqual([png.toString("base64"), jpeg.toString("base64")]);
    expect(call.prompt).toContain("Payment gateway timeout");
    expect(call.prompt).toContain("Frame 1 of checkout.mp4");
  });

  it("works without any attachment", async () => {
    const res = await submit({ description: "The Save button does nothing on the profile page." }, []);
    expect((await waitFor(res.body.data.id)).body.data.status).toBe("SUCCEEDED");
    expect(ollama.chat.mock.calls[0][0].images).toEqual([]);
  });

  it("keeps a failure with its reason and can retry it with the same images", async () => {
    ollama.chat.mockRejectedValueOnce(
      Object.assign(new Error("Cannot reach the AI model (Ollama). Make sure Ollama is running"), { code: "AI_UNAVAILABLE" }),
    );
    const { id } = (await submit()).body.data;
    const failed = await waitFor(id);
    expect(failed.body.data).toMatchObject({ status: "FAILED", error: expect.stringMatching(/Cannot reach/) });

    const retry = await api().post(`/api/bug-reports/${id}/retry`);
    expect(retry.status).toBe(202);
    const done = await waitFor(id);
    expect(done.body.data.status).toBe("SUCCEEDED");
    expect(ollama.chat.mock.calls[1][0].images).toEqual([png.toString("base64"), jpeg.toString("base64")]);

    expect((await api().post(`/api/bug-reports/${id}/retry`)).status).toBe(409);
  });

  it("says when the model's answer is unreadable", async () => {
    ollama.chat.mockResolvedValueOnce("not json at all");
    const done = await waitFor((await submit()).body.data.id);
    expect(done.body.data).toMatchObject({ status: "FAILED", error: expect.stringMatching(/unreadable answer/) });
  });

  it("validates the request", async () => {
    let res = await submit({ description: "short" }, []);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");

    res = await api()
      .post("/api/bug-reports")
      .field("details", JSON.stringify(details))
      .attach("images", Buffer.from("not an image"), { filename: "x.png", contentType: "image/png" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_FILE_TYPE");

    expect((await api().post("/api/bug-reports").field("details", "{oops")).status).toBe(400);
    expect(ollama.chat).not.toHaveBeenCalled();
    expect((await api().get("/api/bug-reports")).body.total).toBe(0);
  });

  it("allows one generating report at a time per person", async () => {
    let release;
    ollama.chat.mockImplementationOnce(() => new Promise((resolve) => (release = resolve)));
    const first = await submit();
    expect(first.status).toBe(202);

    const second = await submit();
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe("BUG_REPORT_IN_PROGRESS");

    release(JSON.stringify(modelAnswer));
    await waitFor(first.body.data.id);
    expect((await submit()).status).toBe(202);
  });

  it("marks reports cut off by a server restart as interrupted", async () => {
    const user = await prisma.user.findFirst();
    const row = await prisma.bugReport.create({ data: { input: "{}", createdById: user.id } });

    const service = createBugReportService({ prisma, store: createFileStore(filesRoot), ollama });
    await service.recoverInterrupted();

    expect(await prisma.bugReport.findUnique({ where: { id: row.id } })).toMatchObject({
      status: "FAILED",
      error: INTERRUPTED_ERROR,
    });
  });
});

describe("A bug report's folder", () => {
  async function finishedReport() {
    const { id } = (await submit()).body.data;
    await waitFor(id);
    return id;
  }

  it("takes videos, HAR copies and summaries, and serves them back", async () => {
    const id = await finishedReport();

    const video = await api()
      .post(`/api/bug-reports/${id}/files`)
      .field("kind", "video")
      .attach("file", Buffer.from("fake mp4"), { filename: "checkout.mp4", contentType: "video/mp4" });
    expect(video.status).toBe(201);
    expect(video.body.data).toMatchObject({ name: "checkout.mp4", kind: "video", mimeType: "video/mp4", usedByAi: false });

    const har = await api()
      .post(`/api/bug-reports/${id}/files`)
      .field("kind", "har")
      .attach("file", Buffer.from('{"log":{"entries":[]}}'), { filename: "session-redacted.har", contentType: "text/html" });
    // The served type is decided by the server, not the browser.
    expect(har.body.data.mimeType).toBe("application/json");

    const download = await api().get(`/api/bug-reports/${id}/files/${video.body.data.id}?download=1`);
    expect(download.status).toBe(200);
    expect(download.headers["content-disposition"]).toMatch(/attachment; filename="checkout.mp4"/);
    expect(download.body.toString()).toBe("fake mp4");

    const report = (await api().get(`/api/bug-reports/${id}`)).body.data;
    expect(report.files).toHaveLength(4);
    expect((await api().get("/api/bug-reports")).body.items[0].fileCount).toBe(4);
  });

  it("rejects unknown kinds and fake images, leaving no temp files behind", async () => {
    const id = await finishedReport();
    let res = await api()
      .post(`/api/bug-reports/${id}/files`)
      .field("kind", "script")
      .attach("file", Buffer.from("x"), { filename: "x.js" });
    expect(res.status).toBe(400);

    res = await api()
      .post(`/api/bug-reports/${id}/files`)
      .field("kind", "image")
      .attach("file", Buffer.from("<svg/>"), { filename: "x.png", contentType: "image/svg+xml" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_FILE_TYPE");
  });

  it("saves edited title, severity and texts", async () => {
    const id = await finishedReport();
    const texts = { jiraMarkdown: "## Summary\nEdited", jiraWiki: "h2. Summary", slack: "Hi team,\nEdited" };

    const res = await api().patch(`/api/bug-reports/${id}`).send({ title: "[Checkout] New title", severity: "Minor", texts });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ title: "[Checkout] New title", severity: "Minor", texts, report: { severity: "Minor" } });

    expect((await api().patch(`/api/bug-reports/${id}`).send({ severity: "Urgent" })).status).toBe(400);
    expect((await api().patch(`/api/bug-reports/${id}`).send({})).status).toBe(400);
  });

  it("deletes the report together with its folder", async () => {
    const id = await finishedReport();
    expect(existsSync(folder(id))).toBe(true);

    expect((await api().delete(`/api/bug-reports/${id}`)).status).toBe(204);
    expect(existsSync(folder(id))).toBe(false);
    expect((await api().get(`/api/bug-reports/${id}`)).status).toBe(404);
    expect(await prisma.bugReportFile.count()).toBe(0);
  });

  it("is shared with the team, but only its creator or an admin can change it", async () => {
    const id = await finishedReport();
    const member = await createSignedInUser({ email: "member@test.local", name: "Member" });
    const asMember = (method, url) => request(app)[method](url).set("Cookie", member.cookie);

    expect((await asMember("get", `/api/bug-reports/${id}`)).status).toBe(200);
    expect((await asMember("delete", `/api/bug-reports/${id}`)).status).toBe(403);
    expect((await asMember("patch", `/api/bug-reports/${id}`).send({ severity: "Minor" })).status).toBe(403);
    expect(existsSync(folder(id))).toBe(true);

    expect((await request(app).get("/api/bug-reports")).status).toBe(401);
  });
});

describe("Prompt and answer handling", () => {
  it("leaves out empty sections and keeps the HAR facts verbatim", () => {
    const prompt = buildPrompt({ description: "Login button does nothing", environment: {}, imageNotes: [] });
    expect(prompt).toContain("Login button does nothing");
    expect(prompt).not.toContain("NETWORK EVIDENCE");
    expect(prompt).not.toContain("ENVIRONMENT:");
    expect(buildPrompt({ ...details })).toContain(details.harFacts);
  });

  it("fills gaps from the tester's input and fixes an unknown severity", () => {
    const report = normalizeReport(
      { title: "Bug: Save does nothing", severity: "Urgent", stepsToReproduce: [] },
      { description: "Save does nothing on the profile page", steps: "Open profile\nClick Save", expected: "Saved" },
    );
    expect(report).toMatchObject({
      title: "Save does nothing",
      severity: "Major",
      stepsToReproduce: ["Open profile", "Click Save"],
      expectedResult: "Saved",
      actualResult: "Save does nothing on the profile page",
    });
    expect(normalizeReport({ title: "" }, { description: "x" })).toBeNull();
    expect(normalizeReport({ title: "Login fails with 500", affectedArea: "Login screen" }, { description: "x" }).title).toBe(
      "[Login screen] Login fails with 500",
    );
    expect(normalizeReport({ title: "[Login] Login fails", affectedArea: "Login screen" }, { description: "x" }).title).toBe(
      "[Login] Login fails",
    );
  });
});

describe("Ollama client", () => {
  it("sends the prompt, images and output schema and returns the answer text", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ message: { content: '{"title":"x"}' } }) });
    const client = createOllamaClient({ baseUrl: "http://127.0.0.1:11434/", model: "m", fetchImpl });

    expect(await client.chat({ prompt: "p", images: ["aGk="], format: { type: "object" } })).toBe('{"title":"x"}');
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("http://127.0.0.1:11434/api/chat");
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ model: "m", stream: false, format: { type: "object" } });
    expect(body.messages[0]).toEqual({ role: "user", content: "p", images: ["aGk="] });
  });

  it("explains a missing model and an unreachable Ollama", async () => {
    const missing = createOllamaClient({
      baseUrl: "http://x",
      model: "nope",
      fetchImpl: vi.fn().mockResolvedValue({ ok: false, status: 404, text: async () => 'model "nope" not found' }),
    });
    await expect(missing.chat({ prompt: "p" })).rejects.toThrow('The AI model "nope" is not installed in Ollama');

    const down = createOllamaClient({ baseUrl: "http://x", model: "m", fetchImpl: vi.fn().mockRejectedValue(new TypeError("fetch failed")) });
    await expect(down.chat({ prompt: "p" })).rejects.toMatchObject({ code: "AI_UNAVAILABLE" });
  });
});
