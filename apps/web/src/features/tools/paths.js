// Every tool works inside one project: /projects/:projectId/tools/<tool>.
// After signing in, people choose a project first (/projects).

export const PROJECTS_PATH = "/projects";

// Route paths, relative to /projects/:projectId.
export const TOOL_ROUTES = {
  image: "tools/image-to-test-cases",
  prd: "tools/prd-to-test-cases",
  bugReport: "tools/bug-report",
  harReader: "tools/har-reader",
};

export const projectHref = (projectId) => `${PROJECTS_PATH}/${encodeURIComponent(projectId)}`;
const toolHref = (projectId, tool) => `${projectHref(projectId)}/${TOOL_ROUTES[tool]}`;

export const imageToolHref = (projectId) => toolHref(projectId, "image");

export function prdToolHref(projectId, documentId) {
  const base = toolHref(projectId, "prd");
  return documentId ? `${base}?${new URLSearchParams({ document: documentId })}` : base;
}

export const bugReportsHref = (projectId) => toolHref(projectId, "bugReport");
export const bugReportHref = (projectId, reportId) => `${bugReportsHref(projectId)}/${encodeURIComponent(reportId)}`;
export const harReaderHref = (projectId) => toolHref(projectId, "harReader");
export const harFileHref = (projectId, harId) => `${harReaderHref(projectId)}/${encodeURIComponent(harId)}`;
