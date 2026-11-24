import { FolderKanban, Lock, Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/layout/PageHeader.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog.jsx';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/States.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { useDebouncedValue } from '../../lib/useDebouncedValue.js';
import { useCurrentUser, useUsers } from '../auth/auth.hooks.js';
import { projectHref } from '../tools/paths.js';
import { AssignUsersModal } from './AssignUsersModal.jsx';
import { useDeleteProject, useProjects } from './hooks.js';
import { ProjectCard } from './ProjectCard.jsx';
import { ProjectFormModal } from './ProjectFormModal.jsx';

function Stat({ label, value, muted = false }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-5 py-4">
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className={`mt-1 text-2xl font-semibold ${muted ? 'text-slate-400' : 'text-slate-900'}`}>{value}</dd>
    </div>
  );
}

function SearchBox({ value, onChange }) {
  return (
    <div className="relative w-full max-w-md">
      <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" aria-hidden="true" />
      <input
        type="search"
        aria-label="Search projects"
        placeholder="Search projects by name"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="block w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm shadow-sm focus:outline-2 focus:outline-indigo-600"
      />
    </div>
  );
}

export function FilterChips({ label, options, value, onChange }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${
            value === option.value
              ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
              : 'border-slate-300 text-slate-600 hover:bg-slate-100'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

// The start page after signing in. Admins see and manage every project;
// testers open the projects assigned to them and see the others locked.
export default function ProjectsPage() {
  const user = useCurrentUser();
  const isAdmin = user?.role === 'ADMIN';
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const q = useDebouncedValue(search.trim(), 300);
  const { data, isPending, isError, error, refetch } = useProjects(q);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [assigning, setAssigning] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const deleteProject = useDeleteProject();
  const toast = useToast();
  const navigate = useNavigate();

  const openCreate = () => { setEditing(null); setFormOpen(true); };
  const closeForm = () => { setFormOpen(false); setEditing(null); };

  async function confirmDelete() {
    try {
      await deleteProject.mutateAsync(deleting.id);
      toast.success(`Deleted “${deleting.name}”`);
      setDeleting(null);
    } catch {
      /* error is shown inside the dialog via deleteProject.error */
    }
  }

  const items = data?.items ?? [];
  const assigned = items.filter((p) => p.access !== 'NONE');
  const locked = items.filter((p) => p.access === 'NONE');
  const shown = isAdmin ? items : filter === 'assigned' ? assigned : filter === 'none' ? locked : items;

  let content;
  if (isPending) {
    content = <LoadingState label="Loading projects…" />;
  } else if (isError) {
    content = <ErrorState error={error} onRetry={() => refetch()} />;
  } else if (items.length === 0) {
    content = q ? (
      <EmptyState icon={Search} title="No matching projects" description={`Nothing matches “${q}”. Try a different search.`} />
    ) : isAdmin ? (
      <EmptyState
        icon={FolderKanban}
        title="No projects yet"
        description="Create a project to start organising application URLs, evidence, test cases and bug reports."
        action={<Button icon={Plus} onClick={openCreate}>Create your first project</Button>}
      />
    ) : (
      <EmptyState icon={FolderKanban} title="No projects yet" description="Ask an admin to create a project for your team." />
    );
  } else if (shown.length === 0) {
    content =
      filter === 'assigned' ? (
        <EmptyState icon={Lock} title="No projects assigned to you yet" description="Ask an admin to assign the projects you work on." />
      ) : (
        <EmptyState icon={FolderKanban} title="You can open every project here" />
      );
  } else {
    content = (
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {shown.map((p) => (
          <ProjectCard
            key={p.id}
            project={p}
            onEdit={isAdmin ? (project) => { setEditing(project); setFormOpen(true); } : undefined}
            onAssign={isAdmin ? setAssigning : undefined}
            onDelete={isAdmin ? (project) => { deleteProject.reset(); setDeleting(project); } : undefined}
          />
        ))}
      </ul>
    );
  }

  const ready = !isPending && !isError && items.length > 0 && !q;

  return (
    <>
      {isAdmin ? (
        <PageHeader
          title="Choose a project"
          description="Pick the project you are working on. The tools open inside it and only show that project's data."
          actions={<Button icon={Plus} onClick={openCreate}>New project</Button>}
        />
      ) : (
        <PageHeader title="Projects" description="You can open the projects an admin has assigned to you." />
      )}

      {isAdmin ? (
        <>
          <div className="mb-6">
            <SearchBox value={search} onChange={setSearch} />
          </div>
          {ready && <AdminStats projects={items} />}
        </>
      ) : (
        <>
          {ready && (
            <dl className="mb-6 grid grid-cols-2 gap-4 sm:max-w-md">
              <Stat label="Assigned to you" value={assigned.length} />
              <Stat label="No access" value={locked.length} muted />
            </dl>
          )}
          <div className="mb-6 flex flex-wrap items-center gap-3">
            <SearchBox value={search} onChange={setSearch} />
            <FilterChips
              label="Show projects"
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: `All (${items.length})` },
                { value: 'assigned', label: `Assigned (${assigned.length})` },
                { value: 'none', label: `No access (${locked.length})` },
              ]}
            />
          </div>
        </>
      )}

      {content}

      {formOpen && (
        <ProjectFormModal
          project={editing ?? undefined}
          onClose={closeForm}
          onSaved={(saved) => {
            const wasEdit = Boolean(editing);
            closeForm();
            toast.success(wasEdit ? 'Project updated' : 'Project created');
            if (!wasEdit) navigate(projectHref(saved.id));
          }}
        />
      )}

      {assigning && <AssignUsersModal project={assigning} onClose={() => setAssigning(null)} />}

      {deleting && (
        <ConfirmDialog
          title="Delete project?"
          message={`“${deleting.name}” and everything inside it (test cases, evidence, documents, bug reports and HAR files) will be permanently deleted. This cannot be undone.`}
          confirmLabel="Delete project"
          isPending={deleteProject.isPending}
          error={deleteProject.error?.message}
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </>
  );
}

function AdminStats({ projects }) {
  const users = useUsers();
  return (
    <dl className="mb-6 grid grid-cols-2 gap-4 sm:max-w-3xl sm:grid-cols-3">
      <Stat label="Projects" value={projects.length} />
      <Stat label="Test cases" value={projects.reduce((sum, p) => sum + (p.testCaseCount ?? 0), 0)} />
      <Stat label="Users" value={users.data?.total ?? '–'} />
    </dl>
  );
}
