import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/apiClient.js";
import { generationKeys } from "../evidence/generation.hooks.js";
import { projectKeys } from "../projects/hooks.js";

export const documentKeys = {
  all: (projectId) => ["documents", projectId],
  list: (projectId) => ["documents", projectId, "list"],
  detail: (projectId, documentId) => ["documents", projectId, "detail", documentId],
};

const documentsUrl = (projectId) =>
  `/projects/${encodeURIComponent(projectId)}/documents`;

export function useDocuments(projectId) {
  return useQuery({
    queryKey: documentKeys.list(projectId),
    queryFn: () => api.get(documentsUrl(projectId)),
    enabled: Boolean(projectId),
  });
}

export function useDocument(projectId, documentId) {
  return useQuery({
    queryKey: documentKeys.detail(projectId, documentId),
    queryFn: () =>
      api.get(`${documentsUrl(projectId)}/${encodeURIComponent(documentId)}`),
    enabled: Boolean(projectId && documentId),
  });
}

function useDocumentMutation(projectId, mutationFn) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: documentKeys.all(projectId) });
      // Project cards and the overview show document counts.
      queryClient.invalidateQueries({ queryKey: projectKeys.all });
    },
  });
}

export function useCreateDocument(projectId) {
  return useDocumentMutation(projectId, (body) =>
    api.post(documentsUrl(projectId), body),
  );
}

export function useUploadDocument(projectId) {
  return useDocumentMutation(projectId, (formData) =>
    api.upload(`${documentsUrl(projectId)}/upload`, formData),
  );
}

export function useDeleteDocument(projectId) {
  return useDocumentMutation(projectId, (documentId) =>
    api.delete(`${documentsUrl(projectId)}/${encodeURIComponent(documentId)}`),
  );
}

export function useGenerateFromDocument(projectId) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ documentId, ...body }) =>
      api.post(
        `${documentsUrl(projectId)}/${encodeURIComponent(documentId)}/generations`,
        body,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: generationKeys.all(projectId) });
    },
  });
}
