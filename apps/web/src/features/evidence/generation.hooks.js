import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/apiClient.js";
import { testCaseKeys } from "../projects/test-cases.hooks.js";

export const generationKeys = {
  detail: (projectId, runId) => ["generations", projectId, runId],
};

export function useGenerationRun(projectId, runId) {
  return useQuery({
    queryKey: generationKeys.detail(projectId, runId),

    queryFn: () =>
      api.get(
        `/projects/${encodeURIComponent(projectId)}/generations/${encodeURIComponent(runId)}`,
      ),

    enabled: Boolean(projectId && runId),

    refetchInterval: (query) =>
      query.state.data?.status === "PENDING" ? 2000 : false,
  });
}
