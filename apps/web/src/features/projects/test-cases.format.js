// A test case is "Per step" when it carries a non-empty stepExpectedResults
// array. There is no stored format column; this mirrors the rule used by
// test-cases.export.js so the UI and the Excel export always agree.
export function isPerStepTestCase(testCase) {
  return (
    Array.isArray(testCase?.stepExpectedResults) &&
    testCase.stepExpectedResults.length > 0
  );
}

// Splits stored steps ("1. Open page\n2. Click") into plain action strings.
export function splitSteps(steps) {
  const list = Array.isArray(steps)
    ? steps
    : String(steps || "")
        .split(/\r?\n/)
        .filter((line) => line.trim());

  return list.map((step) => String(step).replace(/^\s*\d+[.)]\s*/, ""));
}

// Pairs each step with its expected result. A row is flagged as missing when
// there is no result for that step or the result is blank.
export function buildStepRows(testCase) {
  const results = testCase?.stepExpectedResults ?? [];

  return splitSteps(testCase?.steps).map((action, index) => {
    const expected = typeof results[index] === "string" ? results[index] : "";

    return {
      number: index + 1,
      action,
      expected,
      missing: expected.trim() === "",
    };
  });
}
