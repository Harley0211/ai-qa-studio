import { describe, expect, it } from "vitest";
import { buildGenerationMessage } from "./generation.hooks.js";

describe("buildGenerationMessage", () => {
  it("returns the base instruction when no focus is chosen", () => {
    const message = buildGenerationMessage();
    expect(message).toContain("functional test cases");
    expect(message).not.toContain("Focus especially");
  });

  it("adds the chosen focus as an extra instruction", () => {
    expect(buildGenerationMessage(["Negative", "Boundary"])).toMatch(
      /\n\nFocus especially on these test types: Negative, Boundary\.$/,
    );
  });
});
