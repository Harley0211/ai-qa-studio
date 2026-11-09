import { AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from './Button.jsx';

export function LoadingState({ label = 'Loading…' }) {
  return (
    <div role="status" className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
      <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
      {Icon && <Icon className="h-10 w-10 text-slate-400" aria-hidden="true" />}
      <h3 className="mt-3 text-base font-semibold text-slate-900">{title}</h3>
      {description && <p className="mt-1 max-w-md text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry, title = 'Something went wrong' }) {
  return (
    <div role="alert" className="flex flex-col items-center rounded-xl border border-red-200 bg-red-50 px-6 py-12 text-center">
      <AlertTriangle className="h-10 w-10 text-red-500" aria-hidden="true" />
      <h3 className="mt-3 text-base font-semibold text-red-900">{title}</h3>
      <p className="mt-1 max-w-md text-sm text-red-700">{error?.message ?? 'An unexpected error occurred.'}</p>
      {onRetry && (
        <Button variant="secondary" className="mt-5" onClick={onRetry}>Try again</Button>
      )}
    </div>
  );
}
