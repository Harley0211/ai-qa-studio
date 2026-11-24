import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { api, setUnauthenticatedHandler } from "../../lib/apiClient.js";
import { resetTasks } from "../bug-report/backgroundTasks.js";

export const authKeys = {
  status: ["auth", "status"],
  users: ["users"],
  user: (id) => ["users", id],
};

export const ROLE_LABELS = { ADMIN: "Admin", MEMBER: "Tester" };

// { setupRequired, signupAllowed, user, remember } from the server.
export function useAuthStatus() {
  return useQuery({
    queryKey: authKeys.status,
    queryFn: () => api.get("/auth/status"),
    staleTime: Infinity,
  });
}

export function useCurrentUser() {
  return useAuthStatus().data?.user ?? null;
}

// When any request finds the session gone, show the sign-in screen.
export function useSignOutOnExpiredSession() {
  const queryClient = useQueryClient();

  useEffect(() => {
    setUnauthenticatedHandler(() => {
      const status = queryClient.getQueryData(authKeys.status);
      if (status?.user) {
        queryClient.setQueryData(authKeys.status, { ...status, user: null });
      }
    });
    return () => setUnauthenticatedHandler(null);
  }, [queryClient]);
}

// After signing in or out, nothing cached for the previous user is kept.
// `signedOut` ("manual" or "idle") shows the "You are signed out" screen.
function useStartSession() {
  const queryClient = useQueryClient();
  return (user, { remember = true, signedOut } = {}) => {
    // Keep the status query itself: the sign-in screen is watching it.
    queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== "auth" });
    const previous = queryClient.getQueryData(authKeys.status) ?? {};
    queryClient.setQueryData(authKeys.status, {
      ...previous,
      setupRequired: false,
      user,
      remember,
      signedOut: user ? undefined : signedOut,
    });
  };
}

export function useLogin() {
  const start = useStartSession();
  return useMutation({
    mutationFn: (credentials) => api.post("/auth/login", credentials),
    onSuccess: (result, credentials) => start(result.user, { remember: credentials.remember !== false }),
  });
}

export function useRegister() {
  const start = useStartSession();
  return useMutation({
    mutationFn: (details) => api.post("/auth/register", details),
    onSuccess: (result) => start(result.user, { remember: false }),
  });
}

export function useSetup() {
  const start = useStartSession();
  return useMutation({
    mutationFn: (details) => api.post("/auth/setup", details),
    onSuccess: (result) => start(result.user),
  });
}

// reason: "manual" (Sign out button) or "idle" (30 minutes without activity).
export function useLogout() {
  const start = useStartSession();
  return useMutation({
    mutationFn: () => api.post("/auth/logout"),
    onSettled: (_data, _error, reason = "manual") => {
      // Work started in this browser belongs to the person signing out.
      resetTasks();
      start(null, { signedOut: reason });
    },
  });
}

// Back from the "You are signed out" screen to the sign-in form.
export function useClearSignedOut() {
  const queryClient = useQueryClient();
  return () => {
    const status = queryClient.getQueryData(authKeys.status);
    if (status) queryClient.setQueryData(authKeys.status, { ...status, signedOut: undefined });
  };
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (passwords) => api.post("/auth/password", passwords),
  });
}

// Admin: user management.
export function useUsers() {
  return useQuery({
    queryKey: authKeys.users,
    queryFn: () => api.get("/users"),
  });
}

export function useUser(id) {
  return useQuery({
    queryKey: authKeys.user(id),
    queryFn: async () => (await api.get(`/users/${encodeURIComponent(id)}`)).data,
  });
}

function useUsersMutation(mutationFn) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: authKeys.users });
      // Assigned-user counts on the project cards.
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      // The admin may have renamed themselves.
      queryClient.invalidateQueries({ queryKey: authKeys.status });
    },
  });
}

export const useCreateUser = () =>
  useUsersMutation(async (user) => (await api.post("/users", user)).data);

export const useUpdateUser = () =>
  useUsersMutation(async ({ id, ...changes }) =>
    (await api.patch(`/users/${encodeURIComponent(id)}`, changes)).data,
  );

export const useDeleteUser = () =>
  useUsersMutation((id) => api.delete(`/users/${encodeURIComponent(id)}`));

// Admin: the testers assigned to one project.
export function useProjectMembers(projectId) {
  return useQuery({
    queryKey: ["projects", "members", projectId],
    queryFn: () => api.get(`/projects/${encodeURIComponent(projectId)}/members`),
  });
}

export const useSetProjectMembers = (projectId) =>
  useUsersMutation((userIds) => api.put(`/projects/${encodeURIComponent(projectId)}/members`, { userIds }));
