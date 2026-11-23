import { describe, expect, it } from "vitest";
import { createZip, crc32 } from "../../lib/zip.js";
import { jiraMarkdown, jiraWiki, slackMessage, slugify } from "../bug-report/formatters.js";
import { attachmentKind, attachmentProblem, framePlan } from "../bug-report/attachments.js";
import { frameTimes } from "../bug-report/videoFrames.js";
import { sampleHarText } from "./harFixture.js";
import {
  REDACTED,
  errorMessageFrom,
  harFactsForAi,
  harSummaryMarkdown,
  parseHar,
  redactHar,
} from "./harParser.js";

describe("Reading a HAR file", () => {
  const { entries, summary, har } = parseHar(sampleHarText());

  it("counts requests by status and finds the failures, most serious first", () => {
    expect(summary.total).toBe(5);
    expect(summary.classCounts).toEqual({ "2xx": 2, "3xx": 0, "4xx": 1, "5xx": 1, failed: 1 });
    expect(summary.statusCounts).toMatchObject({ 200: 2, 404: 1, 500: 1, failed: 1 });
    expect(summary.failedCount).toBe(3);
    expect(summary.errors.map((e) => e.status)).toEqual([500, 0, 404]);
    expect(summary.slowest[0].path).toBe("/api/recommendations");
    expect(summary.durationMs).toBe(5400);
    expect(summary.creator).toBe("WebInspector 537.36");
  });

  it("reads the server's error message and the network error", () => {
    const [server, blocked, missing] = summary.errors;
    expect(server.errorMessage).toBe("Payment gateway timeout");
    expect(missing.errorMessage).toBe("Coupon not found");
    expect(blocked.networkError).toBe("net::ERR_BLOCKED_BY_CLIENT");
    expect(blocked.type).toBe("script");
    expect(entries[0].type).toBe("document");
  });

  it("explains files that are not HAR", () => {
    expect(() => parseHar("hello")).toThrow("not JSON");
    expect(() => parseHar("{}")).toThrow("no log.entries");
  });

  it("knows common error body shapes", () => {
    expect(errorMessageFrom(JSON.stringify({ detail: "Forbidden for role" }))).toBe("Forbidden for role");
    expect(errorMessageFrom(JSON.stringify({ errors: [{ message: "Email taken" }] }))).toBe("Email taken");
    expect(errorMessageFrom("<h1>Bad Gateway</h1>")).toBe("Bad Gateway");
    expect(errorMessageFrom("")).toBeNull();
  });

  it("gives the AI exact facts without secrets", () => {
    const facts = harFactsForAi("session.har", summary);
    expect(facts).toContain('HAR file "session.har": 5 requests');
    expect(facts).toContain("1 server errors (5xx)");
    expect(facts).toContain('POST https://shop.example/api/orders?session_token=%5BREDACTED%5D -> 500 Internal Server Error (812 ms) - "Payment gateway timeout"');
    expect(facts).toContain("Failed (net::ERR_BLOCKED_BY_CLIENT)");
    expect(facts).toContain("took 2.40 s");
    expect(facts).not.toContain("abc123");
  });

  it("writes a readable summary", () => {
    const md = harSummaryMarkdown("session.har", summary);
    expect(md).toContain("# HAR summary: session.har");
    expect(md).toContain("| 500 | 1 |");
    expect(md).toContain("Coupon not found");
  });

  it("makes a copy without cookies, tokens or passwords", () => {
    const safe = redactHar(har);
    const order = safe.log.entries[1];
    const text = JSON.stringify(safe);

    expect(order.request.headers.find((h) => h.name === "Authorization").value).toBe(REDACTED);
    expect(order.request.headers.find((h) => h.name === "Cookie").value).toBe(REDACTED);
    expect(order.response.headers.find((h) => h.name === "Set-Cookie").value).toBe(REDACTED);
    expect(order.request.cookies).toEqual([]);
    expect(JSON.parse(order.request.postData.text)).toEqual({ cardNumber: REDACTED, amount: 25, password: REDACTED });
    expect(text).not.toContain("abc123");
    expect(text).not.toContain("hunter2");
    expect(text).not.toContain("eyJhbGciOiJIUzI1NiJ9");
    // The original is untouched.
    expect(har.log.entries[1].request.cookies).toHaveLength(1);
  });
});

describe("ZIP files", () => {
  it("uses the standard CRC-32", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  it("writes a valid archive with every file", async () => {
    const zip = await createZip([
      { name: "a.txt", data: "hello" },
      { name: "a.txt", data: "again" },
      { name: "folder/b.bin", data: new Uint8Array([1, 2, 3]) },
    ]);
    // jsdom's Blob has no arrayBuffer(); browsers do.
    const buffer = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsArrayBuffer(zip);
    });
    const bytes = new Uint8Array(buffer);
    const view = new DataView(bytes.buffer);
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    const end = bytes.length - 22;
    expect(view.getUint32(end, true)).toBe(0x06054b50);
    expect(view.getUint16(end + 10, true)).toBe(3);
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain("a (2).txt");
    expect(text).toContain("folder/b.bin");
  });
});

describe("Bug report texts", () => {
  const report = {
    title: "[Checkout] Order fails with 500 when placing an order",
    summary: "Placing an order fails.",
    stepsToReproduce: ["Open the cart", "Click Place order"],
    expectedResult: "The order is placed.",
    actualResult: "An error toast appears.",
    rootCause: "POST /api/orders returns 500 (Payment gateway timeout).",
    severity: "Critical",
    affectedArea: "Checkout",
  };
  const { summary } = parseHar(sampleHarText());
  const context = {
    environment: { url: "https://shop.example/cart", browser: "Chrome 131", device: "", build: "" },
    attachments: [
      { name: "cart.png", kind: "image" },
      { name: "session.har", kind: "har" },
    ],
    harErrors: summary.errors.map((entry) => ({ file: "session.har", entry })),
  };

  it("Slack starts with Hi team and has the essentials", () => {
    const text = slackMessage(report, context);
    expect(text.startsWith("Hi team,\n")).toBe(true);
    expect(text).toContain(`:bug: *${report.title}*`);
    expect(text).toContain("*Severity:* Critical");
    expect(text).toContain("1. Open the cart");
    expect(text).toContain("*Likely root cause:*");
    expect(text).toContain('`POST /api/orders?session_token=%5BREDACTED%5D` → 500 Internal Server Error – "Payment gateway timeout"');
    expect(text).toContain(":paperclip: *Attachments:* cart.png, session.har (redacted copy)");
  });

  it("Jira Markdown has the sections, a network table and the priority", () => {
    const text = jiraMarkdown(report, context);
    expect(text).toContain("## Steps to reproduce\n1. Open the cart\n2. Click Place order");
    expect(text).toContain("**Suggested priority:** High");
    expect(text).toContain("## Root cause analysis");
    expect(text).toContain("| POST | `/api/orders?session_token=%5BREDACTED%5D` | 500 Internal Server Error | 812 ms | Payment gateway timeout |");
    expect(text).toContain("- **Browser:** Chrome 131");
    expect(text).not.toContain("Device / OS");
  });

  it("Jira wiki markup uses headings, numbered steps and attachment links", () => {
    const text = jiraWiki(report, context);
    expect(text).toContain("h2. Summary");
    expect(text).toContain("# Open the cart");
    expect(text).toContain("||Method||Endpoint||Status||Time||Message||");
    expect(text).toContain("* [^cart.png]");
  });

  it("leaves out empty parts", () => {
    const text = slackMessage(report, {});
    expect(text).not.toContain("Network errors");
    expect(text).not.toContain("Attachments");
    expect(slugify("[Checkout] Order fails!")).toBe("checkout-order-fails");
  });
});

describe("Attachments", () => {
  const file = (name, type, size = 10) => ({ name, type, size });

  it("recognises images, videos and HAR files", () => {
    expect(attachmentKind(file("a.png", "image/png"))).toBe("image");
    expect(attachmentKind(file("rec.mp4", "video/mp4"))).toBe("video");
    expect(attachmentKind(file("rec.mov", ""))).toBe("video");
    expect(attachmentKind(file("network.har", "application/json"))).toBe("har");
    expect(attachmentKind(file("notes.pdf", "application/pdf"))).toBeNull();
    expect(attachmentProblem(file("notes.pdf", "application/pdf"))).toMatch(/only images/);
    expect(attachmentProblem(file("big.png", "image/png", 6 * 1024 * 1024))).toMatch(/larger than/);
  });

  it("shares the AI's 12 images between screenshots and video frames", () => {
    expect(framePlan(3, 0)).toMatchObject({ screenshots: 3, perVideo: 0 });
    expect(framePlan(20, 0)).toMatchObject({ screenshots: 12 });
    expect(framePlan(2, 1)).toMatchObject({ screenshots: 2, perVideo: 4 });
    expect(framePlan(10, 2)).toMatchObject({ screenshots: 8, perVideo: 2 });
    expect(framePlan(8, 6)).toMatchObject({ screenshots: 8, perVideo: 1, videosWithFrames: 4 });
  });

  it("spreads video frames through the recording", () => {
    expect(frameTimes(10, 4)).toEqual([2, 4, 6, 8]);
    expect(frameTimes(NaN, 4)).toEqual([0]);
  });
});
