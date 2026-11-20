import { ExternalLink, FileText, Image, PenLine } from 'lucide-react';
import { Link, useOutletContext } from 'react-router-dom';
import { formatDate } from '../../lib/format.js';
import { safeHref } from '../../lib/url.js';
import { imageToolHref, prdToolHref } from '../tools/paths.js';
import { useAllTestCases } from './test-cases.hooks.js';

const STATUSES = ['Passed', 'Failed', 'Blocked', 'Not Run'];

const primaryLink =
  'inline-flex items-center justify-center rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600';
const secondaryLink =
  'inline-flex items-center justify-center rounded-lg bg-white px-3.5 py-2 text-sm font-medium text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600';

function StartCard({ icon: Icon, title, description, meta, children }) {
  return (
    <div className="flex flex-col rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-indigo-600" aria-hidden="true" />
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      </div>
      <p className="mt-1 flex-1 text-sm text-slate-500">{description}</p>
      <p className="mt-3 text-xs text-slate-400">{meta}</p>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function ExecutionSummary({ projectId }) {
  const { data, isPending, isError } = useAllTestCases(projectId);
  const items = data?.items ?? [];
  const count = (status) => items.filter((item) => item.runStatus === status).length;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">Execution summary</h2>
        <Link to={`/projects/${projectId}/test-cases`} className="text-sm font-medium text-indigo-600 hover:underline">
          View test cases
        </Link>
      </div>
      {isError ? (
        <p className="mt-3 text-sm text-red-600">Unable to load test cases.</p>
      ) : (
        <dl className="mt-3 divide-y divide-slate-100 text-sm">
          {[['Total', items.length], ...STATUSES.map((status) => [status, count(status)])].map(([label, value]) => (
            <div key={label} className="flex justify-between py-2">
              <dt className="text-slate-500">{label}</dt>
              <dd className="font-semibold text-slate-900">{isPending ? '—' : value}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

export default function OverviewTab() {
  const { project } = useOutletContext();
  const preview = project.urls.slice(0, 5);
  const imageCount = project.evidenceCount ?? 0;
  const documentCount = project.documentCount ?? 0;

  return (
    <div className="space-y-6">
      <section aria-labelledby="start-generating">
        <h2 id="start-generating" className="mb-3 text-sm font-semibold text-slate-900">Start generating</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <StartCard
            icon={Image}
            title="From image evidence"
            description="Screenshots become test cases."
            meta={`${imageCount} ${imageCount === 1 ? 'image' : 'images'} uploaded`}
          >
            <Link to={imageToolHref(project.id)} className={primaryLink}>
              Open tool<span className="sr-only">: image evidence</span>
            </Link>
          </StartCard>
          <StartCard
            icon={FileText}
            title="From PRD / document"
            description="Requirements become test cases, linked to their section."
            meta={`${documentCount} ${documentCount === 1 ? 'document' : 'documents'} added`}
          >
            <Link to={prdToolHref(project.id)} className={primaryLink}>
              Open tool<span className="sr-only">: PRD / document</span>
            </Link>
          </StartCard>
          <StartCard
            icon={PenLine}
            title="Write manually"
            description="Add a test case yourself. Works without AI."
            meta="Always available"
          >
            <Link to={`/projects/${project.id}/test-cases`} state={{ openCreate: true }} className={secondaryLink}>
              Add test case
            </Link>
          </StartCard>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <ExecutionSummary projectId={project.id} />

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

        <section className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-2">
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
    </div>
  );
}
