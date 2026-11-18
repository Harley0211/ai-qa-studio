import * as XLSX from "xlsx";

const OVERALL_HEADERS = [
  "Test Case ID",
  "Title",
  "Description",
  "Precondition",
  "Test Steps",
  "Test Data",
  "Expected Result",
  "Execution Status",
  "Created Date",
  "Updated Date",
];

const PER_STEP_HEADERS = [
  "Test Case ID",
  "Title",
  "Description",
  "Precondition",
  "Step",
  "Data",
  "Expected Result",
  "Execution Status",
  "Created Date",
  "Updated Date",
];

function formatDate(value) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleString();
}

function normalizeSteps(steps) {
  if (Array.isArray(steps)) {
    return steps.map((step) => String(step));
  }

  if (typeof steps === "string") {
    return steps
      .split(/\r?\n/)
      .map((step) => step.replace(/^\s*\d+\.\s*/, "").trim())
      .filter(Boolean);
  }

  return [];
}

function formatSteps(steps) {
  return normalizeSteps(steps)
    .map((step, index) => `${index + 1}. ${step}`)
    .join("\n");
}

function buildBaseRow(testCase) {
  return {
    "Test Case ID": testCase.caseId ?? "",
    Title: testCase.title ?? "",
    Description: testCase.description ?? "",
    Precondition: testCase.precondition ?? "",
    "Execution Status": testCase.runStatus ?? "Not Run",
    "Created Date": formatDate(testCase.createdAt),
    "Updated Date": formatDate(testCase.updatedAt),
  };
}

function buildWorksheet(rows, headers, widths) {
  const worksheet = XLSX.utils.json_to_sheet(rows, { header: headers });

  worksheet["!cols"] = widths.map((wch) => ({ wch }));
  worksheet["!rows"] = [{ hpt: 28 }, ...rows.map(() => ({ hpt: 60 }))];

  const range = XLSX.utils.decode_range(worksheet["!ref"]);

  for (let column = range.s.c; column <= range.e.c; column += 1) {
    const address = XLSX.utils.encode_cell({ r: 0, c: column });
    const cell = worksheet[address];

    if (cell) {
      cell.s = {
        font: { bold: true, color: { rgb: "FFFFFF" } },
        fill: { fgColor: { rgb: "3730A3" } },
        alignment: {
          horizontal: "center",
          vertical: "center",
          wrapText: true,
        },
      };
    }
  }

  for (let row = 1; row <= range.e.r; row += 1) {
    for (let column = range.s.c; column <= range.e.c; column += 1) {
      const address = XLSX.utils.encode_cell({ r: row, c: column });
      const cell = worksheet[address];

      if (cell) {
        cell.s = {
          alignment: {
            vertical: "top",
            wrapText: true,
          },
        };
      }
    }
  }

  worksheet["!autofilter"] = {
    ref: XLSX.utils.encode_range(range),
  };

  worksheet["!freeze"] = {
    xSplit: 0,
    ySplit: 1,
    topLeftCell: "A2",
    activePane: "bottomLeft",
    state: "frozen",
  };

  return worksheet;
}

export function exportTestCasesToExcel(testCases, projectName = "Project") {
  if (!Array.isArray(testCases) || testCases.length === 0) {
    throw new Error("There are no test cases to export.");
  }

  const hasPerStepResults = testCases.some(
    (testCase) =>
      Array.isArray(testCase.stepExpectedResults) &&
      testCase.stepExpectedResults.length > 0,
  );

  let rows;
  let headers;
  let widths;

  if (hasPerStepResults) {
    headers = PER_STEP_HEADERS;

    rows = testCases.flatMap((testCase) => {
      const base = buildBaseRow(testCase);
      const steps = normalizeSteps(testCase.steps);

      if (
        !Array.isArray(testCase.stepExpectedResults) ||
        testCase.stepExpectedResults.length === 0
      ) {
        return [{
          ...base,
          Step: formatSteps(testCase.steps),
          Data: testCase.data ?? "",
          "Expected Result": testCase.expectedResult ?? "",
        }];
      }

      return steps.map((step, index) => ({
        ...base,
        Step: `${index + 1}. ${step}`,
        Data: testCase.data ?? "",
        "Expected Result": testCase.stepExpectedResults[index] ?? "",
      }));
    });

    widths = [24, 40, 45, 40, 55, 35, 55, 18, 22, 22];
  } else {
    headers = OVERALL_HEADERS;

    rows = testCases.map((testCase) => ({
      ...buildBaseRow(testCase),
      "Test Steps": formatSteps(testCase.steps),
      "Test Data": testCase.data ?? "",
      "Expected Result": testCase.expectedResult ?? "",
    }));

    widths = [24, 40, 45, 40, 55, 35, 45, 18, 22, 22];
  }

  const worksheet = buildWorksheet(rows, headers, widths);
  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(workbook, worksheet, "Test Cases");

  const safeProjectName =
    projectName.replace(/[<>:"/\\|?*]/g, "-").trim() || "Project";

  const date = new Date().toISOString().slice(0, 10);

  XLSX.writeFile(workbook, `${safeProjectName}-Test-Cases-${date}.xlsx`);
}
