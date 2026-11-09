import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/apiClient.js';

export const projectKeys = {
  all: ['projects'],
  list: (q) => ['projects', 'list', q],
  detail: (id) => ['projects', 'detail', id],
};

export function useProjects(q = '') {
  return useQuery({
    queryKey: projectKeys.list(q),
    queryFn: () => api.get(q ? `/projects?${new URLSearchParams({ q })}` : '/projects'),
    placeholderData: keepPreviousData,
  });
}

export function useProject(id) {
  return useQuery({
    queryKey: projectKeys.detail(id),
    queryFn: () => api.get(`/projects/${encodeURIComponent(id)}`),
  });
}

function useInvalidatingMutation(mutationFn) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => qc.invalidateQueries({ queryKey: projectKeys.all }),
  });
}

export const useCreateProject = () => useInvalidatingMutation((body) => api.post('/projects', body));
export const useUpdateProject = () => useInvalidatingMutation(({ id, ...body }) => api.patch(`/projects/${id}`, body));
export const useDeleteProject = () => useInvalidatingMutation((id) => api.delete(`/projects/${id}`));

export const useAddUrl = (projectId) => useInvalidatingMutation((body) => api.post(`/projects/${projectId}/urls`, body));
export const useUpdateUrl = (projectId) => useInvalidatingMutation(({ id, ...body }) => api.patch(`/projects/${projectId}/urls/${id}`, body));
export const useDeleteUrl = (projectId) => useInvalidatingMutation((id) => api.delete(`/projects/${projectId}/urls/${id}`));
