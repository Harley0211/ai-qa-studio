import { ArrowRight, Lock } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge } from '../../components/ui/Switch.jsx';
import { formatDate } from '../../lib/format.js';
import { projectHref } from '../tools/paths.js';

const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;

function CountChip({ tone = 'neutral', children }) {
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-xs ${
        tone === 'warning' ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-slate-200 text-slate-600'
      }`}
    >
      {children}
    </span>
  );
}

const footerLink = 'font-medium text-slate-500 hover:text-indigo-700';

// A project a tester isn't assigned to: only its name, no way in.
function LockedCard({ project }) {
  return (
    <li className="locked-card flex flex-col rounded-xl border border-dashed border-slate-300">
      <div className="flex-1 p-5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="truncate text-base font-semibold text-slate-600">{project.name}</h3>
          <Badge>No access</Badge>
        </div>
        <p className="mt-1 text-sm text-slate-500">Project details are hidden</p>
        <div className="mt-4 flex">
          <span className="inline-flex items-center gap-1 rounded-full border border-slate-300 px-2 py-0.5 text-xs text-slate-500">
            <Lock className="h-3 w-3" aria-hidden="true" />
            Locked
          </span>
        </div>
      </div>
      <p className="border-t border-slate-200 px-5 py-3 text-xs text-slate-600">
        Not assigned to you. Ask an admin for access.
      </p>
    </li>
  );
}

// onEdit / onAssign / onDelete are only given to admins.
export function ProjectCard({ project, onEdit, onAssign, onDelete }) {
  if (project.access === 'NONE') return <LockedCard project={project} />;
  const isAdminView = project.access === 'ADMIN';
  const members = project.memberCount ?? 0;

  return (
    <li className="flex flex-col rounded-xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md">
      <Link to={projectHref(project.id)} className="flex-1 rounded-t-xl p-5 focus-visible:outline-2 focus-visible:outline-indigo-600">
        <div className="flex items-start justify-between gap-2">
          <h3 className="truncate text-base font-semibold text-slate-900">{project.name}</h3>
          {project.access === 'ASSIGNED' && <Badge tone="success">Assigned</Badge>}
        </div>
        <p className="mt-1 line-clamp-2 min-h-10 text-sm text-slate-500">
          {project.description || 'No description'}
        </p>
        <div className="mt-4 flex flex-wrap gap-1.5">
          <CountChip>{plural(project.urlCount ?? 0, 'URL', 'URLs')}</CountChip>
          <CountChip>{plural(project.testCaseCount ?? 0, 'test case', 'test cases')}</CountChip>
          {isAdminView && (
            <CountChip tone={members === 0 ? 'warning' : 'neutral'}>
              {members === 0 ? 'No users' : plural(members, 'user', 'users')}
            </CountChip>
          )}
        </div>
        <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-indigo-600">
          Open project
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </span>
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-5 py-3 text-xs">
        <span className="text-slate-400">Updated {formatDate(project.updatedAt)}</span>
        {(onEdit || onAssign || onDelete) && (
          <span className="flex items-center gap-1.5">
            {onEdit && (
              <button type="button" className={footerLink} aria-label={`Edit ${project.name}`} onClick={() => onEdit(project)}>
                Edit
              </button>
            )}
            {onAssign && (
              <>
                <span aria-hidden="true" className="text-slate-300">·</span>
                <button
                  type="button"
                  className={footerLink}
                  aria-label={`Assign users to ${project.name}`}
                  onClick={() => onAssign(project)}
                >
                  Assign users
                </button>
              </>
            )}
            {onDelete && (
              <>
                <span aria-hidden="true" className="text-slate-300">·</span>
                <button
                  type="button"
                  className={`${footerLink} hover:text-red-700`}
                  aria-label={`Delete ${project.name}`}
                  onClick={() => onDelete(project)}
                >
                  Delete
                </button>
              </>
            )}
          </span>
        )}
      </div>
    </li>
  );
}
