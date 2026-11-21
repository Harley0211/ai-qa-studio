import { Pencil, Sparkles, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { IconButton } from '../../components/ui/Button.jsx';
import { formatDate } from '../../lib/format.js';
import { imageToolHref } from '../tools/paths.js';

const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;

function CountChip({ children }) {
  return (
    <span className="rounded-full border border-slate-200 px-2 py-0.5 text-xs text-slate-600">{children}</span>
  );
}

export function ProjectCard({ project, onEdit, onDelete }) {
  return (
    <li className="flex flex-col rounded-xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md">
      <Link to={`/projects/${project.id}`} className="flex-1 rounded-t-xl p-5 focus-visible:outline-2 focus-visible:outline-indigo-600">
        <h3 className="truncate text-base font-semibold text-slate-900">{project.name}</h3>
        <p className="mt-1 line-clamp-2 min-h-10 text-sm text-slate-500">
          {project.description || 'No description'}
        </p>
        <div className="mt-4 flex flex-wrap gap-1.5">
          <CountChip>{plural(project.urlCount, 'URL', 'URLs')}</CountChip>
          <CountChip>{plural(project.testCaseCount ?? 0, 'test case', 'test cases')}</CountChip>
          <CountChip>{plural(project.evidenceCount ?? 0, 'image', 'images')}</CountChip>
        </div>
      </Link>
      <div className="px-5 pb-4">
        <Link
          to={imageToolHref(project.id)}
          className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 px-2.5 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-50"
        >
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          Image → test cases
          <span className="sr-only"> for {project.name}</span>
        </Link>
      </div>
      <div className="flex items-center justify-between border-t border-slate-100 px-3 py-2">
        <span className="px-2 text-xs text-slate-400">Updated {formatDate(project.updatedAt)}</span>
        <div className="flex">
          <IconButton icon={Pencil} label={`Edit ${project.name}`} onClick={() => onEdit(project)} />
          <IconButton icon={Trash2} label={`Delete ${project.name}`} onClick={() => onDelete(project)} />
        </div>
      </div>
    </li>
  );
}
