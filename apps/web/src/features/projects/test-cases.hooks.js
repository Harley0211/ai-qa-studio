import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/apiClient.js";

export const testCaseKeys = {
  all: (projectId) => ["test-cases", projectId],
  list: (projectId, filters) => ["test-cases", projectId, "list", filters],
  detail: (projectId, testCaseId) => [
    "test-cases",
    projectId,
    "detail",
    testCaseId,
  ],
};

export function useTestCases(projectId, filters = {}) {
  const params = new URLSearchParams();

  if (filters.q) params.set("q", filters.q);
  if (filters.runStatus) params.set("runStatus", filters.runStatus);

  const queryString = params.toString();

  return useQuery({
    queryKey: testCaseKeys.list(projectId, filters),
    queryFn: () =>
      api.get(
        `/projects/${encodeURIComponent(projectId)}/test-cases${
          queryString ? `?${queryString}` : ""
        }`,
      ),
    enabled: Boolean(projectId),
  });
}

export function useCreateTestCase(projectId) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body) =>
      api.post(`/projects/${encodeURIComponent(projectId)}/test-cases`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: testCaseKeys.all(projectId),
      });
    },
  });
}

export function useUpdateTestCase(projectId) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...body }) =>
      api.patch(
        `/projects/${encodeURIComponent(projectId)}/test-cases/${encodeURIComponent(id)}`,
        body,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: testCaseKeys.all(projectId),
      });
    },
  });
}

export function useUpdateTestCaseStatus(projectId) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, runStatus }) =>
      api.patch(
        `/projects/${encodeURIComponent(projectId)}/test-cases/${encodeURIComponent(id)}/status`,
        { runStatus },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: testCaseKeys.all(projectId),
      });
    },
  });
}

export function useDeleteTestCase(projectId) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id) =>
      api.delete(
        `/projects/${encodeURIComponent(projectId)}/test-cases/${encodeURIComponent(id)}`,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: testCaseKeys.all(projectId),
      });
    },
  });
}
