
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/apiClient.js';

export const evidenceKeys = {
  all: (projectId) => ['evidence', projectId],
  list: (projectId) => ['evidence', projectId, 'list'],
};

export function useEvidence(projectId) {
  return useQuery({
    queryKey: evidenceKeys.list(projectId),
    queryFn: () => api.get(`/projects/${projectId}/evidence`),
    enabled: Boolean(projectId),
  });
}

export function useUploadEvidence(projectId) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (formData) =>
      api.upload(`/projects/${projectId}/evidence`, formData),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: evidenceKeys.all(projectId),
      });
      // Project cards and the overview show image counts.
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

// Deletes every image an earlier generation already used.
export function useClearUsedEvidence(projectId) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.post(`/projects/${projectId}/evidence/clear-used`),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: evidenceKeys.all(projectId),
      });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

export function useDeleteEvidence(projectId) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (evidenceId) =>
      api.delete(`/projects/${projectId}/evidence/${evidenceId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: evidenceKeys.all(projectId),
      });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}
