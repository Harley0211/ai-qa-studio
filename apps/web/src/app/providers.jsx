import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { ToastProvider } from '../components/ui/Toast.jsx';

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 10_000,
        refetchOnWindowFocus: false,
        // Retry once on network/5xx failures only; never retry 4xx.
        retry: (count, err) => (err?.status === 0 || err?.status >= 500) && count < 1,
      },
    },
  });
}

export function AppProviders({ children, queryClient }) {
  const [client] = useState(() => queryClient ?? createQueryClient());
  return (
    <QueryClientProvider client={client}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
}
