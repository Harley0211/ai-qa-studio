import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { api, setUnauthenticatedHandler } from "../../lib/apiClient.js";

export const authKeys = {
  status: ["auth", "status"],
  users: ["users"],
};

// { setupRequired, user } from the server.
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
function useStartSession() {
  const queryClient = useQueryClient();
  return (user) => {
    // Keep the status query itself: the sign-in screen is watching it.
    queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== "auth" });
    queryClient.setQueryData(authKeys.status, { setupRequired: false, user });
  };
}

export function useLogin() {
  const start = useStartSession();
  return useMutation({
    mutationFn: (credentials) => api.post("/auth/login", credentials),
    onSuccess: (result) => start(result.user),
  });
}

export function useSetup() {
  const start = useStartSession();
  return useMutation({
    mutationFn: (details) => api.post("/auth/setup", details),
    onSuccess: (result) => start(result.user),
  });
}

export function useLogout() {
  const start = useStartSession();
  return useMutation({
    mutationFn: () => api.post("/auth/logout"),
    onSettled: () => start(null),
  });
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

function useUsersMutation(mutationFn) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: authKeys.users });
      // The admin may have renamed themselves.
      queryClient.invalidateQueries({ queryKey: authKeys.status });
    },
  });
}

export const useCreateUser = () =>
  useUsersMutation((user) => api.post("/users", user));

export const useUpdateUser = () =>
  useUsersMutation(({ id, ...changes }) =>
    api.patch(`/users/${encodeURIComponent(id)}`, changes),
  );

export const useDeleteUser = () =>
  useUsersMutation((id) => api.delete(`/users/${encodeURIComponent(id)}`));
