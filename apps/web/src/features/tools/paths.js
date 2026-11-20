export const IMAGE_TOOL_PATH = "/tools/image-to-test-cases";

export function imageToolHref(projectId) {
  return `${IMAGE_TOOL_PATH}?${new URLSearchParams({ project: projectId })}`;
}
