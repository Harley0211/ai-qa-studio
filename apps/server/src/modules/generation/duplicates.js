// Finds generated test cases that repeat one already in the library, by
// comparing titles. Same rule as the n8n workflow's "Plan Scenarios" step uses
// to drop repeated scenarios, so both agree on what counts as a repeat.

// Words that say nothing about what a test checks.
const STOP_WORDS = new Set([
  "verify", "test", "check", "ensure", "validate", "that", "the", "a", "an",
  "is", "are", "of", "to", "with", "when", "and", "or", "on", "in", "for",
  "be", "user", "can",
]);

export function titleWords(title) {
  return new Set(
    String(title ?? "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .split(" ")
      .filter((word) => word && !STOP_WORDS.has(word)),
  );
}

// How much two titles overlap (0..1), or 0 when they don't count as the same.
// Nearly all words of the shorter title must appear in the longer one, and
// the two must share most of their words overall.
export function titleSimilarity(a, b) {
  if (a.size === 0 || b.size === 0) return 0;

  let shared = 0;
  for (const word of a) if (b.has(word)) shared += 1;

  const ofShorter = shared / Math.min(a.size, b.size);
  const ofLonger = shared / Math.max(a.size, b.size);

  return ofShorter >= 0.85 && ofLonger >= 0.6 ? ofLonger : 0;
}

// For each draft, the library test case it most likely repeats, or null.
// library: [{ id, caseId, title }]
export function findDuplicates(drafts, library) {
  const known = library.map((testCase) => ({
    testCase,
    words: titleWords(testCase.title),
  }));

  return drafts.map((draft) => {
    const words = titleWords(draft.title);
    let best = null;
    let bestScore = 0;

    for (const { testCase, words: other } of known) {
      const score = titleSimilarity(words, other);
      if (score > bestScore) {
        best = testCase;
        bestScore = score;
      }
    }

    return best
      ? { id: best.id, caseId: best.caseId, title: best.title }
      : null;
  });
}
