import request from "supertest";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";
import { env } from "../src/config/env.js";
import { createOllamaClient } from "../src/modules/bug-reports/bugReports.ollama.js";
import { buildPrompt, normalizeReport } from "../src/modules/bug-reports/bugReports.service.js";
import { apiFor, createSignedInUser, n8nClient, prisma, resetDb } from "./helpers.js";

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

const modelAnswer = {
  title: "[Checkout] Payment fails with 500 when placing an order",
  summary: "Placing an order fails because POST /api/orders returns 500.",
  stepsToReproduce: ["1. Open the cart", "Step 2: Click Place order"],
  expectedResult: "The order is placed.",
  actualResult: "An error toast appears and no order is created.",
  rootCause: "POST /api/orders returned 500 Internal Server Error (\"Payment gateway timeout\"): a backend failure.",
  severity: "Critical",
  affectedArea: "Checkout",
};

const ollama = { chat: vi.fn() };
const app = createApp({ prisma, env, n8nClient, ollamaClient: ollama });
const api = () => apiFor(app);

const details = {
  description: "Clicking Place order shows 'Something went wrong' and nothing happens.",
  steps: "Open cart\nClick Place order",
  expected: "Order confirmation page",
  environment: { url: "https://shop.example/cart", browser: "Chrome 131" },
  harFacts: "Failed requests:\n- POST https://shop.example/api/orders -> 500 Internal Server Error (812 ms) - \"Payment gateway timeout\"",
  imageNotes: ["Screenshot cart.png", "Frame 1 of checkout.mp4 at 0:03"],
  attachments: [
    { name: "cart.png", kind: "image" },
    { name: "checkout.mp4", kind: "video" },
    { name: "session.har", kind: "har" },
  ],
};

function submit(body = details, images = [png, png]) {
  let req = api().post("/api/bug-reports").field("details", JSON.stringify(body));
  images.forEach((image, i) => {
    req = req.attach("images", image, { filename: `image-${i}.png`, contentType: "image/png" });
  });
  return req;
}

async function waitFor(id) {
  for (let i = 0; i < 50; i += 1) {
    const res = await api().get(`/api/bug-reports/${id}`);
    if (res.body.data.status !== "PENDING") return res;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Job did not finish");
}

beforeEach(async () => {
  await resetDb();
  ollama.chat.mockReset();
  ollama.chat.mockResolvedValue(JSON.stringify(modelAnswer));
});
afterAll(() => prisma.$disconnect());

describe("POST /api/bug-reports", () => {
  it("generates a report from the description, images and HAR facts", async () => {
    const res = await submit();
    expect(res.status).toBe(202);
    expect(res.body.data.status).toBe("PENDING");

    const done = await waitFor(res.body.data.id);
    expect(done.body.data.status).toBe("SUCCEEDED");
    expect(done.body.data.report).toMatchObject({
      title: modelAnswer.title,
      severity: "Critical",
      affectedArea: "Checkout",
      // Numbering from the model is removed; the formatter numbers steps.
      stepsToReproduce: ["Open the cart", "Click Place order"],
    });

    const call = ollama.chat.mock.calls[0][0];
    expect(call.images).toHaveLength(2);
    expect(call.images[0]).toBe(png.toString("base64"));
    expect(call.prompt).toContain("Payment gateway timeout");
    expect(call.prompt).toContain("Frame 1 of checkout.mp4");
    expect(call.prompt).toContain("Chrome 131");
    expect(call.format.required).toContain("rootCause");
  });

  it("works without any attachment", async () => {
    const res = await submit({ description: "The Save button does nothing on the profile page." }, []);
    expect(res.status).toBe(202);
    expect((await waitFor(res.body.data.id)).body.data.status).toBe("SUCCEEDED");
    expect(ollama.chat.mock.calls[0][0].images).toEqual([]);
  });

  it("reports a clear reason when the model is unavailable or answers badly", async () => {
    const down = Object.assign(new Error("Cannot reach the AI model (Ollama). Make sure Ollama is running"), {
      code: "AI_UNAVAILABLE",
    });
    ollama.chat.mockRejectedValueOnce(down);
    let done = await waitFor((await submit()).body.data.id);
    expect(done.body.data).toMatchObject({ status: "FAILED", error: down.message });

    ollama.chat.mockResolvedValueOnce("not json at all");
    done = await waitFor((await submit()).body.data.id);
    expect(done.body.data.status).toBe("FAILED");
    expect(done.body.data.error).toMatch(/unreadable answer/);
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

    res = await api().post("/api/bug-reports").field("details", "{oops");
    expect(res.status).toBe(400);
    expect(ollama.chat).not.toHaveBeenCalled();
  });

  it("allows one report at a time per person", async () => {
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

  it("needs a sign-in and only shows your own reports", async () => {
    expect((await request(app).post("/api/bug-reports").field("details", "{}")).status).toBe(401);

    const mine = await submit();
    const other = await createSignedInUser({ email: "other@test.local", name: "Other" });
    const res = await request(app).get(`/api/bug-reports/${mine.body.data.id}`).set("Cookie", other.cookie);
    expect(res.status).toBe(404);
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

    // The area goes in front of the title when the model left it out.
    expect(
      normalizeReport({ title: "Login fails with 500", affectedArea: "Login screen" }, { description: "x" }).title,
    ).toBe("[Login screen] Login fails with 500");
    expect(
      normalizeReport({ title: "[Login] Login fails", affectedArea: "Login screen" }, { description: "x" }).title,
    ).toBe("[Login] Login fails");
  });
});

describe("Ollama client", () => {
  it("sends the prompt, images and output schema and returns the answer text", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ message: { content: '{"title":"x"}' } }),
    });
    const client = createOllamaClient({ baseUrl: "http://127.0.0.1:11434/", model: "m", fetchImpl });

    const answer = await client.chat({ prompt: "p", images: ["aGk="], format: { type: "object" } });
    expect(answer).toBe('{"title":"x"}');
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

    const down = createOllamaClient({
      baseUrl: "http://x",
      model: "m",
      fetchImpl: vi.fn().mockRejectedValue(new TypeError("fetch failed")),
    });
    await expect(down.chat({ prompt: "p" })).rejects.toMatchObject({ code: "AI_UNAVAILABLE" });
  });
});
