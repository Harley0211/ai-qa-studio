import { ArrowRight, Pencil, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { IconButton } from '../../components/ui/Button.jsx';
import { formatDate } from '../../lib/format.js';
import { projectHref } from '../tools/paths.js';

const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;

function CountChip({ children }) {
  return (
    <span className="rounded-full border border-slate-200 px-2 py-0.5 text-xs text-slate-600">{children}</span>
  );
}

// onEdit / onDelete are only given to admins.
export function ProjectCard({ project, onEdit, onDelete }) {
  return (
    <li className="flex flex-col rounded-xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md">
      <Link to={projectHref(project.id)} className="flex-1 rounded-t-xl p-5 focus-visible:outline-2 focus-visible:outline-indigo-600">
        <h3 className="truncate text-base font-semibold text-slate-900">{project.name}</h3>
        <p className="mt-1 line-clamp-2 min-h-10 text-sm text-slate-500">
          {project.description || 'No description'}
        </p>
        <div className="mt-4 flex flex-wrap gap-1.5">
          <CountChip>{plural(project.urlCount, 'URL', 'URLs')}</CountChip>
          <CountChip>{plural(project.testCaseCount ?? 0, 'test case', 'test cases')}</CountChip>
          <CountChip>{plural(project.evidenceCount ?? 0, 'image', 'images')}</CountChip>
        </div>
        <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-indigo-600">
          Open project
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </span>
      </Link>
      <div className="flex items-center justify-between border-t border-slate-100 px-3 py-2">
        <span className="px-2 text-xs text-slate-400">Updated {formatDate(project.updatedAt)}</span>
        {(onEdit || onDelete) && (
          <div className="flex">
            {onEdit && <IconButton icon={Pencil} label={`Edit ${project.name}`} onClick={() => onEdit(project)} />}
            {onDelete && <IconButton icon={Trash2} label={`Delete ${project.name}`} onClick={() => onDelete(project)} />}
          </div>
        )}
      </div>
    </li>
  );
}
