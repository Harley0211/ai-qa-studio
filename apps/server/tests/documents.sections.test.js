import { describe, expect, it } from "vitest";
import { splitIntoSections } from "../src/modules/documents/documents.sections.js";

const titles = (content) => splitIntoSections(content).map((s) => s.title);

describe("splitIntoSections", () => {
  it("splits at markdown headings and keeps the heading in the text", () => {
    const sections = splitIntoSections(
      "# Add-ons PRD\nOverview text.\n\n## 3.1 Catalog\nShows add-ons.\n\n## 3.2 Purchase\nUser buys one.",
    );

    expect(sections.map((s) => s.title)).toEqual(["Add-ons PRD", "3.1 Catalog", "3.2 Purchase"]);
    expect(sections[1]).toEqual({ id: "s2", title: "3.1 Catalog", text: "## 3.1 Catalog\nShows add-ons." });
  });

  it("splits at numbered outline headings", () => {
    expect(titles("1 Introduction\nWhy.\n3.2 Purchase flow\nSteps.\n3.3. Errors\nCodes.")).toEqual([
      "1 Introduction",
      "3.2 Purchase flow",
      "3.3. Errors",
    ]);
  });

  it("keeps numbered list items and sentences inside their section", () => {
    const sections = splitIntoSections(
      "## Login\n1. Open the page\n2. Enter credentials\n10 users can log in at once.\n2 Factor codes expire.",
    );

    expect(sections).toHaveLength(1);
    expect(sections[0].text).toContain("1. Open the page");
    expect(sections[0].text).toContain("10 users can log in at once.");
    expect(sections[0].text).toContain("2 Factor codes expire.");
  });

  it("puts text before the first heading in an Introduction section", () => {
    expect(titles("Some preamble.\n# Scope\nIn scope.")).toEqual(["Introduction", "Scope"]);
  });

  it("drops headings with no text of their own", () => {
    expect(titles("# 3 Requirements\n## 3.1 Catalog\nShows add-ons.")).toEqual(["3.1 Catalog"]);
  });

  it("treats a document without headings as one section", () => {
    expect(splitIntoSections("Users can reset passwords.\r\nLinks expire in 1 hour.")).toEqual([
      { id: "s1", title: "Whole document", text: "Users can reset passwords.\r\nLinks expire in 1 hour." },
    ]);
  });

  it("returns nothing for blank text", () => {
    expect(splitIntoSections("   \n  ")).toEqual([]);
  });
});
