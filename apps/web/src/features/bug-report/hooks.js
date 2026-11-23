import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/apiClient.js";

export const bugReportKeys = {
  all: ["bug-reports"],
  list: ["bug-reports", "list"],
  detail: (id) => ["bug-reports", id],
};
export const harFileKeys = { all: ["har-files"] };

const poll = (isBusy) => (query) => (isBusy(query.state.data) ? 3000 : false);
const reportUrl = (id) => `/bug-reports/${encodeURIComponent(id)}`;

// Every saved bug report (folder), newest first. Keeps refreshing while one
// is still generating.
export function useBugReports() {
  return useQuery({
    queryKey: bugReportKeys.list,
    queryFn: () => api.get("/bug-reports"),
    refetchInterval: poll((data) => data?.items?.some((item) => item.status === "PENDING")),
  });
}

export function useBugReport(id) {
  return useQuery({
    queryKey: bugReportKeys.detail(id),
    queryFn: () => api.get(reportUrl(id)),
    enabled: Boolean(id),
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

export const useUpdateBugReport = (id) => useReportMutation((changes) => api.patch(reportUrl(id), changes));
export const useRetryBugReport = (id) => useReportMutation(() => api.post(`${reportUrl(id)}/retry`));
export const useDeleteBugReport = () => useReportMutation((id) => api.delete(reportUrl(id)));

export const bugReportFileUrl = (id, fileId, download = false) =>
  `/api${reportUrl(id)}/files/${encodeURIComponent(fileId)}${download ? "?download=1" : ""}`;

// The HAR reader's saved files.
export function useHarFiles() {
  return useQuery({ queryKey: harFileKeys.all, queryFn: () => api.get("/har-files") });
}

export function useSaveHarFile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ blob, name, summary }) => {
      const form = new FormData();
      form.append("summary", JSON.stringify(summary));
      form.append("file", blob, name);
      return api.upload("/har-files", form);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: harFileKeys.all }),
  });
}

export function useDeleteHarFile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.delete(`/har-files/${encodeURIComponent(id)}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: harFileKeys.all }),
  });
}

export const harFileUrl = (id) => `/api/har-files/${encodeURIComponent(id)}/file`;

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
