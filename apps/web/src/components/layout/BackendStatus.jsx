import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/apiClient.js';

export function BackendStatus() {
  const { isPending, isError } = useQuery({
    queryKey: ['health'],
    queryFn: () => api.get('/health'),
    refetchInterval: 30_000,
    retry: false,
  });

  const [dot, text] = isPending
    ? ['bg-slate-400', 'Checking backend…']
    : isError
      ? ['bg-red-500', 'Backend unavailable']
      : ['bg-emerald-500', 'Backend online'];

  return (
    <div className="flex items-center gap-2 text-xs text-slate-500">
      <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden="true" />
      <span>{text}</span>
    </div>
  );
}
