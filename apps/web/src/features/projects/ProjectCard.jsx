import { Globe, Pencil, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { IconButton } from '../../components/ui/Button.jsx';
import { formatDate } from '../../lib/format.js';

export function ProjectCard({ project, onEdit, onDelete }) {
  return (
    <li className="flex flex-col rounded-xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md">
      <Link to={`/projects/${project.id}`} className="flex-1 rounded-t-xl p-5 focus-visible:outline-2 focus-visible:outline-indigo-600">
        <h3 className="truncate text-base font-semibold text-slate-900">{project.name}</h3>
        <p className="mt-1 line-clamp-2 min-h-10 text-sm text-slate-500">
          {project.description || 'No description'}
        </p>
        <div className="mt-4 flex items-center gap-1.5 text-xs text-slate-500">
          <Globe className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{project.urlCount} {project.urlCount === 1 ? 'URL' : 'URLs'}</span>
        </div>
      </Link>
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
