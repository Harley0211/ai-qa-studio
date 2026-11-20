export const IMAGE_TOOL_PATH = "/tools/image-to-test-cases";
export const PRD_TOOL_PATH = "/tools/prd-to-test-cases";

export function imageToolHref(projectId) {
  return `${IMAGE_TOOL_PATH}?${new URLSearchParams({ project: projectId })}`;
}

export function prdToolHref(projectId, documentId) {
  const params = new URLSearchParams({ project: projectId });
  if (documentId) params.set("document", documentId);
  return `${PRD_TOOL_PATH}?${params}`;
}
