// Splits a requirements document into sections at its headings.
//
// Recognised headings:
//   - Markdown:          "## 3.2 Purchase flow"
//   - Numbered outline:  "3.2 Purchase flow", "3.2. Purchase flow", "3 Requirements"
// A numbered list item such as "1. Click Login" is NOT a heading (single
// number followed by a dot), so ordinary step lists stay inside their section.

export const MAX_SECTIONS = 100;

const MARKDOWN_HEADING = /^#{1,6}\s+(.+?)\s*#*$/;
// "3.2 Title" / "3.2. Title", or "3 Title" (capitalised, not a sentence).
const OUTLINE_HEADING = /^(?:\d+(?:\.\d+)+\.?\s+\S.*|\d+\s+[A-Z][^.]*)$/;
const MAX_HEADING_LENGTH = 120;

function headingTitle(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > MAX_HEADING_LENGTH) return null;

  const markdown = MARKDOWN_HEADING.exec(trimmed);
  if (markdown) return markdown[1].trim();

  return OUTLINE_HEADING.test(trimmed) ? trimmed : null;
}

export function splitIntoSections(content) {
  const lines = content.replace(/\r\n?/g, "\n").split("\n");
  const raw = [];
  let current = { title: "Introduction", heading: null, body: [] };

  for (const line of lines) {
    const title = headingTitle(line);

    if (title) {
      raw.push(current);
      current = { title, heading: line.trim(), body: [] };
    } else {
      current.body.push(line);
    }
  }
  raw.push(current);

  // Sections with no text of their own (e.g. a parent heading directly
  // followed by its first sub-heading) are not useful to generate from.
  const withText = raw.filter((section) => section.body.join("\n").trim());

  if (withText.length === 0) return [];

  if (withText.length === 1 && raw.length === 1) {
    return [{ id: "s1", title: "Whole document", text: content.trim() }];
  }

  return withText.slice(0, MAX_SECTIONS).map((section, index) => ({
    id: `s${index + 1}`,
    title: section.title,
    text: [section.heading, section.body.join("\n").trim()]
      .filter(Boolean)
      .join("\n"),
  }));
}
