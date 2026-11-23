import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/apiClient.js";

// Bug reports and HAR files belong to a project: every request names it.
export const bugReportKeys = {
  all: ["bug-reports"],
  list: (projectId) => ["bug-reports", projectId, "list"],
  detail: (projectId, id) => ["bug-reports", projectId, id],
};
export const harFileKeys = {
  all: ["har-files"],
  list: (projectId) => ["har-files", projectId],
  detail: (projectId, id) => ["har-files", projectId, id],
};

const poll = (isBusy) => (query) => (isBusy(query.state.data) ? 3000 : false);
export const bugReportsUrl = (projectId) => `/projects/${encodeURIComponent(projectId)}/bug-reports`;
const reportUrl = (projectId, id) => `${bugReportsUrl(projectId)}/${encodeURIComponent(id)}`;
export const harFilesUrl = (projectId) => `/projects/${encodeURIComponent(projectId)}/har-files`;

// Every saved bug report (folder), newest first. Keeps refreshing while one
// is still generating.
export function useBugReports(projectId) {
  return useQuery({
    queryKey: bugReportKeys.list(projectId),
    queryFn: () => api.get(bugReportsUrl(projectId)),
    refetchInterval: poll((data) => data?.items?.some((item) => item.status === "PENDING")),
  });
}

export function useBugReport(projectId, id) {
  return useQuery({
    queryKey: bugReportKeys.detail(projectId, id),
    queryFn: () => api.get(reportUrl(projectId, id)),
    enabled: Boolean(projectId && id),
    refetchInterval: poll((data) => data?.data?.status === "PENDING"),
  });
}

function useReportMutation(mutationFn) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: bugReportKeys.all }),
  });
}

export const useUpdateBugReport = (projectId, id) =>
  useReportMutation((changes) => api.patch(reportUrl(projectId, id), changes));
export const useRetryBugReport = (projectId, id) => useReportMutation(() => api.post(`${reportUrl(projectId, id)}/retry`));
export const useDeleteBugReport = (projectId) => useReportMutation((id) => api.delete(reportUrl(projectId, id)));

export const bugReportFileUrl = (projectId, id, fileId, download = false) =>
  `/api${reportUrl(projectId, id)}/files/${encodeURIComponent(fileId)}${download ? "?download=1" : ""}`;

// The HAR reader's saved files.
export function useHarFiles(projectId) {
  return useQuery({ queryKey: harFileKeys.list(projectId), queryFn: () => api.get(harFilesUrl(projectId)) });
}

export function useHarFile(projectId, id) {
  return useQuery({
    queryKey: harFileKeys.detail(projectId, id),
    queryFn: () => api.get(`${harFilesUrl(projectId)}/${encodeURIComponent(id)}`),
  });
}

export function useSaveHarFile(projectId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ blob, name, summary }) => {
      const form = new FormData();
      form.append("summary", JSON.stringify(summary));
      form.append("file", blob, name);
      return api.upload(harFilesUrl(projectId), form);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: harFileKeys.all }),
  });
}

export function useDeleteHarFile(projectId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.delete(`${harFilesUrl(projectId)}/${encodeURIComponent(id)}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: harFileKeys.all }),
  });
}

export const harFileUrl = (projectId, id) => `/api${harFilesUrl(projectId)}/${encodeURIComponent(id)}/file`;

// Downloads a saved file as a Blob (same-origin, with the sign-in cookie).
export async function fetchBlob(url) {
  let res;
  try {
    res = await fetch(url);
  } catch {
    throw new Error("Cannot reach the backend. Make sure the server is running.");
  }
  if (!res.ok) throw new Error(`Couldn't download a file (${res.status}).`);
  return res.blob();
}

// "Chrome 131 on Windows" from the browser this page runs in.
export function detectBrowser(userAgent = navigator.userAgent) {
  const browsers = [
    ["Edge", /Edg\/(\d+)/],
    ["Opera", /OPR\/(\d+)/],
    ["Chrome", /Chrome\/(\d+)/],
    ["Firefox", /Firefox\/(\d+)/],
    ["Safari", /Version\/(\d+).*Safari/],
  ];
  const systems = [
    ["Windows", /Windows/],
    ["Android", /Android/],
    ["iOS", /iPhone|iPad/],
    ["macOS", /Mac OS X/],
    ["Linux", /Linux/],
  ];
  const browser = browsers.find(([, pattern]) => pattern.test(userAgent));
  const system = systems.find(([, pattern]) => pattern.test(userAgent));
  return {
    browser: browser ? `${browser[0]} ${userAgent.match(browser[1])[1]}` : "",
    device: system ? system[0] : "",
  };
}
