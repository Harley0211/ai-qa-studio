import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
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
  all: (projectId) => ["generations", projectId],
  detail: (projectId, runId) => ["generations", projectId, runId],
  pendingReview: (projectId) => ["generations", projectId, "pending-review"],
};

const generationsUrl = (projectId) =>
  `/projects/${encodeURIComponent(projectId)}/generations`;

// Runs whose generated test cases are waiting to be accepted or discarded.
export function usePendingReviews(projectId) {
  return useQuery({
    queryKey: generationKeys.pendingReview(projectId),
    queryFn: () => api.get(`${generationsUrl(projectId)}?review=pending`),
    enabled: Boolean(projectId),
  });
}

function useReviewMutation(projectId, mutationFn) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: generationKeys.all(projectId) });
      queryClient.invalidateQueries({ queryKey: testCaseKeys.all(projectId) });
      queryClient.invalidateQueries({ queryKey: projectKeys.all });
    },
  });
}

export function useAcceptDrafts(projectId) {
  return useReviewMutation(projectId, ({ runId, indexes }) =>
    api.post(`${generationsUrl(projectId)}/${encodeURIComponent(runId)}/accept`, {
      indexes,
    }),
  );
}

export function useDiscardDrafts(projectId) {
  return useReviewMutation(projectId, (runId) =>
    api.post(`${generationsUrl(projectId)}/${encodeURIComponent(runId)}/discard`),
  );
}

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

function runQuery(projectId, runId) {
  return {
    queryKey: generationKeys.detail(projectId, runId),
    queryFn: () =>
      api.get(
        `/projects/${encodeURIComponent(projectId)}/generations/${encodeURIComponent(runId)}`,
      ),
    refetchInterval: (query) =>
      query.state.data?.data?.status === "PENDING" ? 2000 : false,
  };
}

export function useGenerationRun(projectId, runId) {
  return useQuery({
    ...runQuery(projectId, runId),
    enabled: Boolean(projectId && runId),
  });
}

// Follows several runs at once (one per document section). Each finished run
// shows up for review straight away; one message is shown when all are done.
export function useRunsProgress(projectId) {
  const [runIds, setRunIds] = useState([]);
  const queryClient = useQueryClient();
  const toast = useToast();

  const results = useQueries({
    queries: runIds.map((runId) => runQuery(projectId, runId)),
  });
  const statuses = results.map((result) => result.data?.data?.status);
  const finished = statuses.filter((s) => s === "SUCCEEDED" || s === "FAILED").length;
  const failed = statuses.filter((s) => s === "FAILED").length;
  const statusKey = statuses.join(",");

  useEffect(() => {
    if (runIds.length === 0) return;

    queryClient.invalidateQueries({ queryKey: generationKeys.pendingReview(projectId) });

    if (finished < runIds.length) return;

    if (failed === runIds.length) {
      toast.error("Test case generation failed.");
    } else if (failed > 0) {
      toast.success(
        `Test cases are ready to review. ${failed} of ${runIds.length} sections failed.`,
      );
    } else {
      toast.success("Test cases are ready to review.");
    }
    setRunIds([]);
    // statusKey captures every status change; the other values derive from it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusKey, projectId]);

  return {
    track: setRunIds,
    isGenerating: runIds.length > 0,
    total: runIds.length,
    finished,
  };
}

// Starts a generation run and follows it until it finishes, showing toasts and
// refreshing test case and project data on success.
export function useGenerationFlow(projectId) {
  const [runId, setRunId] = useState(null);
  const queryClient = useQueryClient();
  const toast = useToast();

  const generateTestCases = useGenerateTestCases(projectId);
  const generation = useGenerationRun(projectId, runId);
  const status = generation.data?.data?.status;

  useEffect(() => {
    if (!runId) return;

    if (status === "SUCCEEDED") {
      // Generated cases are drafts now; they wait in the review list.
      queryClient.invalidateQueries({
        queryKey: generationKeys.pendingReview(projectId),
      });
      toast.success("Test cases are ready to review.");
      setRunId(null);
    }

    if (status === "FAILED") {
      toast.error(generation.data.data.error || "Test case generation failed.");
      setRunId(null);
    }
  }, [generation.data, projectId, queryClient, runId, status, toast]);

  async function start(input) {
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
  };
}
