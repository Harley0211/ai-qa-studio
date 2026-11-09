import { ExternalLink } from 'lucide-react';
import { Link, useOutletContext } from 'react-router-dom';
import { formatDate } from '../../lib/format.js';
import { safeHref } from '../../lib/url.js';

export default function OverviewTab() {
  const { project } = useOutletContext();
  const preview = project.urls.slice(0, 5);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-900">Project details</h2>
        <dl className="mt-3 space-y-3 text-sm">
          <div>
            <dt className="text-slate-500">Description</dt>
            <dd className="mt-0.5 whitespace-pre-wrap text-slate-900">{project.description || 'No description'}</dd>
          </div>
          <div className="flex gap-8">
            <div>
              <dt className="text-slate-500">Created</dt>
              <dd className="mt-0.5 text-slate-900">{formatDate(project.createdAt)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Last updated</dt>
              <dd className="mt-0.5 text-slate-900">{formatDate(project.updatedAt)}</dd>
            </div>
          </div>
        </dl>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">Application URLs ({project.urlCount})</h2>
          <Link to={`/projects/${project.id}/urls`} className="text-sm font-medium text-indigo-600 hover:underline">Manage</Link>
        </div>
        {preview.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">No URLs registered yet.</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {preview.map((u) => (
              <li key={u.id} className="flex items-center gap-2">
                <a href={safeHref(u.url)} target="_blank" rel="noopener noreferrer" className="flex min-w-0 items-center gap-1 text-indigo-600 hover:underline">
                  <span className="truncate">{u.label || u.url}</span>
                  <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
