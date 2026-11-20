import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useToast } from "../../components/ui/Toast.jsx";
import { api } from "../../lib/apiClient.js";
import { projectKeys } from "../projects/hooks.js";
import { testCaseKeys } from "../projects/test-cases.hooks.js";

export const MAX_GENERATION_EVIDENCE = 20;

export const FOCUS_OPTIONS = [
  "Functional",
  "Negative",
  "Boundary",
  "Validation",
  "UI / layout",
];

const BASE_GENERATION_MESSAGE =
  "Analyze the uploaded application screenshots and generate detailed, comprehensive functional test cases. Cover visible UI elements, user interactions, validations, navigation, positive and negative scenarios, and relevant edge cases. Return clear, actionable steps and expected results.";

// The n8n prompts start with this message, so an optional focus is added as
// an extra instruction line (no workflow change needed).
export function buildGenerationMessage(focus = []) {
  if (focus.length === 0) return BASE_GENERATION_MESSAGE;

  return `${BASE_GENERATION_MESSAGE}\n\nFocus especially on these test types: ${focus.join(", ")}.`;
}

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

// Starts a generation run and follows it until it finishes, showing toasts and
// refreshing test case and project data on success.
export function useGenerationFlow(projectId) {
  const [runId, setRunId] = useState(null);
  const [completed, setCompleted] = useState(false);
  const queryClient = useQueryClient();
  const toast = useToast();

  const generateTestCases = useGenerateTestCases(projectId);
  const generation = useGenerationRun(projectId, runId);
  const status = generation.data?.data?.status;

  useEffect(() => {
    setCompleted(false);
  }, [projectId]);

  useEffect(() => {
    if (!runId) return;

    if (status === "SUCCEEDED") {
      queryClient.invalidateQueries({ queryKey: testCaseKeys.all(projectId) });
      queryClient.invalidateQueries({ queryKey: projectKeys.all });
      toast.success("Test cases generated successfully.");
      setCompleted(true);
      setRunId(null);
    }

    if (status === "FAILED") {
      toast.error(generation.data.data.error || "Test case generation failed.");
      setRunId(null);
    }
  }, [generation.data, projectId, queryClient, runId, status, toast]);

  async function start(input) {
    setCompleted(false);
    const result = await generateTestCases.mutateAsync(input);
    setRunId(result.data.id);
    return result;
  }

  return {
    start,
    isGenerating:
      generateTestCases.isPending ||
      (Boolean(runId) && status !== "SUCCEEDED" && status !== "FAILED"),
    isWaiting: Boolean(runId) && status === "PENDING",
    statusError: Boolean(runId) && generation.isError,
    completed,
  };
}
