import { describe, expect, it } from "vitest";
import { sampleHar } from "./harFixture.js";
import { explainHar, explanationMarkdown, harReportMarkdown } from "./harExplainer.js";
import { parseHar } from "./harParser.js";

const withEntries = (entries) => JSON.stringify({ log: { ...sampleHar.log, entries } });
const explain = (text) => {
  const { summary, entries } = parseHar(text);
  return explainHar(summary, entries);
};
const [page, orders, coupon, pixel, recommendations] = sampleHar.log.entries;

describe("Explaining a HAR with failures", () => {
  const explanation = explain(JSON.stringify(sampleHar));

  it("leads with the most serious problem", () => {
    expect(explanation.verdict.tone).toBe("error");
    expect(explanation.verdict.headline).toBe(
      "3 requests failed. The main problem: POST /api/orders → 500 Internal Server Error.",
    );
    expect(explanation.verdict.text).toContain("Most likely for: Backend / API team.");
  });

  it("explains each problem, most important first", () => {
    const [server, missing, blocked] = explanation.findings;

    expect(server).toMatchObject({
      level: "high",
      serverMessage: "Payment gateway timeout",
      owner: "Backend / API team",
    });
    expect(server.what).toBe("POST /api/orders on shop.example failed with 500 Internal Server Error, after 812 ms.");
    expect(server.meaning).toMatch(/problem is on the server side/);
    expect(server.next[0]).toMatch(/server logs/);

    expect(missing).toMatchObject({ level: "medium", title: "GET /api/coupons/SAVE10 → 404 Not Found", serverMessage: "Coupon not found" });

    // An ad script blocked by an extension, on another site: not our bug.
    expect(blocked).toMatchObject({ level: "low", thirdParty: true, owner: "Not our app (a third-party service)" });
    expect(blocked.title).toBe("GET /pixel.js → Blocked by the browser");
    expect(blocked.meaning).toMatch(/ad blocker/);
  });

  it("describes the rest of the file", () => {
    expect(explanation.observations).toContain("2 succeeded (2xx: the server answered normally).");
    expect(explanation.observations.some((line) => line.includes("GET /api/recommendations (2.40 s)"))).toBe(true);
    expect(explanation.nextSteps[0]).toMatch(/Attach this HAR/);
  });

  it("writes a paragraph for the lead", () => {
    expect(explanation.forLead).toContain("5 requests over 5.40 s");
    expect(explanation.forLead).toContain(
      'The main one is POST /api/orders, which returned 500 Internal Server Error with the message "Payment gateway timeout".',
    );
    expect(explanation.forLead).toContain("needs the Backend / API team");
    expect(explanation.forLead).toContain("Other failures: GET /api/coupons/SAVE10 → 404 Not Found");
  });

  it("goes into the downloadable summary", () => {
    const md = harReportMarkdown("session.har", parseHar(JSON.stringify(sampleHar)));
    expect(md).toContain("# HAR summary: session.har");
    expect(md).toContain("## What happened");
    expect(md).toContain("#### POST /api/orders → 500 Internal Server Error");
    expect(md).toContain("- **Who should look:** Backend / API team");
    expect(md).toContain("### How to explain it to your lead");
    expect(explanationMarkdown(explanation)).not.toContain("undefined");
  });
});

describe("Explaining a HAR without failures", () => {
  it("still explains what the file shows and what to do next", () => {
    const explanation = explain(withEntries([page, recommendations]));
    expect(explanation.verdict).toMatchObject({ tone: "ok", headline: "All 2 requests succeeded. No failed calls in this file." });
    expect(explanation.verdict.text).toMatch(/most likely in the page itself/);
    expect(explanation.findings).toEqual([]);
    expect(explanation.nextSteps[0]).toMatch(/browser console/);
    expect(explanation.forLead).toContain("All requests succeeded; there are no failed calls.");
    expect(explanation.forLead).toContain("The slowest call was GET /api/recommendations at 2.40 s.");
  });

  it("calls only harmless failures harmless", () => {
    const explanation = explain(withEntries([page, pixel]));
    expect(explanation.verdict.tone).toBe("warning");
    expect(explanation.verdict.headline).toMatch(/none of them look like a problem in the app/);
    expect(explanation.forLead).toMatch(/don't point to a problem in our app/);
  });

  it("says when the recording is empty", () => {
    const explanation = explain(withEntries([]));
    expect(explanation.verdict.headline).toBe("This file has no requests in it.");
    expect(explanation.forLead).toMatch(/record it again/);
  });
});

describe("Grouping and status codes", () => {
  const response = (status, statusText) => ({ ...orders.response, status, statusText, content: { size: 0, mimeType: "application/json", text: "" } });

  it("groups repeats of the same failure", () => {
    const again = { ...orders, startedDateTime: "2026-11-23T02:00:04.000Z" };
    const explanation = explain(withEntries([page, orders, again]));
    expect(explanation.findings).toHaveLength(1);
    expect(explanation.findings[0].requests).toHaveLength(2);
    expect(explanation.findings[0].what).toContain("failed 2 times");
    expect(explanation.forLead).toContain("(2 times)");
  });

  it.each([
    [401, "Unauthorized", /not signed in|expired/, "Backend team (sign-in and permissions)"],
    [403, "Forbidden", /not allow/, "Backend team (sign-in and permissions)"],
    [429, "Too Many Requests", /limiting/, "Backend / API team"],
    [504, "Gateway Timeout", /waited too long/, "Backend / API team"],
    [418, "I'm a teapot", /rejected the request/, "Frontend team"],
  ])("explains %i", (status, text, meaning, owner) => {
    const [finding] = explain(withEntries([page, { ...orders, response: response(status, text) }])).findings;
    expect(finding.meaning).toMatch(meaning);
    expect(finding.owner).toBe(owner);
  });

  it("explains requests that got no response", () => {
    const refused = { ...orders, response: response(0, ""), _error: "net::ERR_CONNECTION_REFUSED" };
    const [finding] = explain(withEntries([page, refused])).findings;
    expect(finding.title).toBe("POST /api/orders → Connection failed");
    expect(finding.owner).toMatch(/Network/);
  });
});
