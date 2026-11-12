import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/apiClient.js";
import { testCaseKeys } from "../projects/test-cases.hooks.js";

export const generationKeys = {
  detail: (projectId, runId) => ["generations", projectId, runId],
};

export function useGenerateTestCases(projectId) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ message, evidenceIds, generationFormat = "OVERALL" }) =>
      api.post(`/projects/${encodeURIComponent(projectId)}/generations`, {
        message,
        evidenceIds,
        generationFormat,
      }),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: testCaseKeys.all(projectId),
      });
    },
  });
}

export function useGenerationRun(projectId, runId) {
  return useQuery({
    queryKey: generationKeys.detail(projectId, runId),

    queryFn: () =>
      api.get(
        `/projects/${encodeURIComponent(projectId)}/generations/${encodeURIComponent(runId)}`,
      ),

    enabled: Boolean(projectId && runId),

    refetchInterval: (query) =>
      query.state.data?.data?.status === "PENDING" ? 2000 : false,
  });
}
