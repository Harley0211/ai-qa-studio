import { buildStepRows, isPerStepTestCase } from "./test-cases.format.js";

// Shared by the Test cases library and the review of generated test cases.

export function FormatChip({ testCase }) {
  const perStep = isPerStepTestCase(testCase);

  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-xs font-medium ${
        perStep
          ? "border-indigo-200 bg-indigo-50 text-indigo-700"
          : "border-slate-200 bg-white text-slate-600"
      }`}
    >
      {perStep ? "Per step" : "Overall"}
    </span>
  );
}

// The document section a generated case came from, if any.
export function SourceChip({ testCase }) {
  if (!testCase.sourceSection) return null;

  const documentTitle = testCase.sourceDocument?.title;

  return (
    <span
      title={documentTitle ? undefined : "The source document was deleted"}
      className="max-w-full truncate rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-600"
    >
      From {documentTitle ? `${documentTitle} › ` : ""}
      {testCase.sourceSection}
    </span>
  );
}

function TestData({ data }) {
  if (!data) return null;

  return (
    <div>
      <h4 className="font-semibold text-slate-700">Test data</h4>
      <p className="mt-1 whitespace-pre-wrap text-slate-600">{data}</p>
    </div>
  );
}

function StepExpectedResultsTable({ testCase }) {
  const rows = buildStepRows(testCase);
  const missingCount = rows.filter((row) => row.missing).length;

  return (
    <>
      <TestData data={testCase.data} />

      <div>
        <h4 className="font-semibold text-slate-700">
          Step-by-step expected results
        </h4>

        {missingCount > 0 && (
          <p
            role="status"
            className="mt-1 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800"
          >
            {missingCount === 1
              ? "1 step has no expected result."
              : `${missingCount} steps have no expected result.`}
          </p>
        )}

        <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[560px] border-collapse text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-600">
              <tr>
                <th className="w-16 border-b border-slate-200 px-3 py-2">Step</th>
                <th className="w-[45%] border-b border-slate-200 px-3 py-2">Action</th>
                <th className="border-b border-slate-200 px-3 py-2">Expected result</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.number}
                  className={`align-top ${row.missing ? "bg-amber-50/60" : ""}`}
                >
                  <td className="border-b border-slate-100 px-3 py-3 font-medium text-slate-500">
                    {row.number}
                  </td>
                  <td className="border-b border-slate-100 px-3 py-3 whitespace-pre-wrap text-slate-700">
                    {row.action}
                  </td>
                  <td className="border-b border-slate-100 px-3 py-3 whitespace-pre-wrap text-slate-700">
                    {row.missing ? (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                        Missing expected result
                      </span>
                    ) : (
                      row.expected
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

// Precondition, then either the per-step table or the overall layout.
export function TestCaseDetails({ testCase }) {
  return (
    <div className="space-y-3 text-sm">
      {testCase.precondition && (
        <div>
          <h4 className="font-semibold text-slate-700">Precondition</h4>
          <p className="mt-1 whitespace-pre-wrap text-slate-600">
            {testCase.precondition}
          </p>
        </div>
      )}

      {isPerStepTestCase(testCase) ? (
        <StepExpectedResultsTable testCase={testCase} />
      ) : (
        <>
          <div>
            <h4 className="font-semibold text-slate-700">Test steps</h4>
            <pre className="mt-1 whitespace-pre-wrap font-sans text-slate-600">
              {testCase.steps}
            </pre>
          </div>

          <TestData data={testCase.data} />

          <div>
            <h4 className="font-semibold text-slate-700">Expected result</h4>
            <p className="mt-1 whitespace-pre-wrap text-slate-600">
              {testCase.expectedResult}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
