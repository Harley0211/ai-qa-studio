import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "../../lib/apiClient.js";

export function useStartBugReport() {
  return useMutation({
    mutationFn: (formData) => api.upload("/bug-reports", formData),
  });
}

// Follows a bug report job until the AI has finished.
export function useBugReportJob(id) {
  return useQuery({
    queryKey: ["bug-reports", id],
    queryFn: () => api.get(`/bug-reports/${encodeURIComponent(id)}`),
    enabled: Boolean(id),
    refetchInterval: (query) => (query.state.data?.data?.status === "PENDING" || !query.state.data ? 3000 : false),
  });
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
