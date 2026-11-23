export const IMAGE_TOOL_PATH = "/tools/image-to-test-cases";
export const PRD_TOOL_PATH = "/tools/prd-to-test-cases";
export const BUG_REPORT_PATH = "/tools/bug-report";
export const HAR_READER_PATH = "/tools/har-reader";

export const bugReportHref = (id) => `${BUG_REPORT_PATH}/${encodeURIComponent(id)}`;
export const harFileHref = (id) => `${HAR_READER_PATH}/${encodeURIComponent(id)}`;

export function imageToolHref(projectId) {
  return `${IMAGE_TOOL_PATH}?${new URLSearchParams({ project: projectId })}`;
}

export function prdToolHref(projectId, documentId) {
  const params = new URLSearchParams({ project: projectId });
  if (documentId) params.set("document", documentId);
  return `${PRD_TOOL_PATH}?${params}`;
}
