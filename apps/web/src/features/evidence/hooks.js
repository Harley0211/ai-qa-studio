
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
    },
  });
}
