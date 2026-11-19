import * as XLSX from "xlsx";

const HEADERS = [
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

function formatDate(value) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleString();
}

function formatSteps(steps) {
  if (Array.isArray(steps)) {
    return steps.map((step, index) => `${index + 1}. ${step}`).join("\n");
  }

  if (typeof steps === "string") {
    return steps;
  }

  return "";
}

export function exportTestCasesToExcel(testCases, projectName = "Project") {
  if (!Array.isArray(testCases) || testCases.length === 0) {
    throw new Error("There are no test cases to export.");
  }

  const rows = testCases.map((testCase) => ({
    "Test Case ID": testCase.caseId ?? "",
    Title: testCase.title ?? "",
    Description: testCase.description ?? "",
    Precondition: testCase.precondition ?? "",
    "Test Steps": formatSteps(testCase.steps),
    "Test Data": testCase.data ?? "",
    "Expected Result": testCase.expectedResult ?? "",
    "Execution Status": testCase.runStatus ?? "Not Run",
    "Created Date": formatDate(testCase.createdAt),
    "Updated Date": formatDate(testCase.updatedAt),
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows, {
    header: HEADERS,
  });

  worksheet["!cols"] = [
    { wch: 24 },
    { wch: 40 },
    { wch: 45 },
    { wch: 40 },
    { wch: 55 },
    { wch: 35 },
    { wch: 45 },
    { wch: 18 },
    { wch: 22 },
    { wch: 22 },
  ];

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

  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(workbook, worksheet, "Test Cases");

  const safeProjectName =
    projectName.replace(/[<>:"/\\|?*]/g, "-").trim() || "Project";

  const date = new Date().toISOString().slice(0, 10);

  XLSX.writeFile(workbook, `${safeProjectName}-Test-Cases-${date}.xlsx`);
}
