import { describe, expect, it } from "vitest";
import {
  buildStepRows,
  isPerStepTestCase,
  splitSteps,
} from "./test-cases.format.js";

describe("isPerStepTestCase", () => {
  it("is true only for a non-empty stepExpectedResults array", () => {
    expect(isPerStepTestCase({ stepExpectedResults: ["A"] })).toBe(true);
    expect(isPerStepTestCase({ stepExpectedResults: [] })).toBe(false);
    expect(isPerStepTestCase({ stepExpectedResults: null })).toBe(false);
    expect(isPerStepTestCase({})).toBe(false);
    expect(isPerStepTestCase(undefined)).toBe(false);
  });
});

describe("splitSteps", () => {
  it("strips stored numbering and blank lines", () => {
    expect(splitSteps("1. Open page\n\n2) Click\r\n3. Done")).toEqual([
      "Open page",
      "Click",
      "Done",
    ]);
  });

  it("accepts an array of steps", () => {
    expect(splitSteps(["Open page", "Click"])).toEqual(["Open page", "Click"]);
  });
});

describe("buildStepRows", () => {
  it("pairs steps with results and flags missing or blank ones", () => {
    const rows = buildStepRows({
      steps: "1. Open page\n2. Type\n3. Submit",
      stepExpectedResults: ["Page opens", "   "],
    });

    expect(rows).toEqual([
      { number: 1, action: "Open page", expected: "Page opens", missing: false },
      { number: 2, action: "Type", expected: "   ", missing: true },
      { number: 3, action: "Submit", expected: "", missing: true },
    ]);
  });
});
