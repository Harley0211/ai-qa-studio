import { FolderKanban, Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/layout/PageHeader.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog.jsx';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/States.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { useDebouncedValue } from '../../lib/useDebouncedValue.js';
import { useDeleteProject, useProjects } from './hooks.js';
import { ProjectCard } from './ProjectCard.jsx';
import { ProjectFormModal } from './ProjectFormModal.jsx';

function Stat({ label, value }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-5 py-4">
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold text-slate-900">{value}</dd>
    </div>
  );
}

export default function ProjectsPage() {
  const [search, setSearch] = useState('');
  const q = useDebouncedValue(search.trim(), 300);
  const { data, isPending, isError, error, refetch } = useProjects(q);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
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

  let content;
  if (isPending) {
    content = <LoadingState label="Loading projects…" />;
  } else if (isError) {
    content = <ErrorState error={error} onRetry={() => refetch()} />;
  } else if (data.items.length === 0) {
    content = q ? (
      <EmptyState icon={Search} title="No matching projects" description={`Nothing matches “${q}”. Try a different search.`} />
    ) : (
      <EmptyState
        icon={FolderKanban}
        title="No projects yet"
        description="Create a project to start organising application URLs, evidence and test cases."
        action={<Button icon={Plus} onClick={openCreate}>Create your first project</Button>}
      />
    );
  } else {
    content = (
      <>
        {!q && (
          <dl className="mb-6 grid grid-cols-2 gap-4 sm:max-w-md">
            <Stat label="Projects" value={data.total} />
            <Stat label="Application URLs" value={data.items.reduce((sum, p) => sum + p.urlCount, 0)} />
          </dl>
        )}
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {data.items.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              onEdit={(project) => { setEditing(project); setFormOpen(true); }}
              onDelete={(project) => { deleteProject.reset(); setDeleting(project); }}
            />
          ))}
        </ul>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Projects"
        description="Each project keeps its own URLs, evidence and test cases."
        actions={<Button icon={Plus} onClick={openCreate}>New project</Button>}
      />

      <div className="relative mb-6 max-w-md">
        <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" aria-hidden="true" />
        <input
          type="search"
          aria-label="Search projects"
          placeholder="Search projects by name"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="block w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm shadow-sm focus:outline-2 focus:outline-indigo-600"
        />
      </div>

      {content}

      {formOpen && (
        <ProjectFormModal
          project={editing ?? undefined}
          onClose={closeForm}
          onSaved={(saved) => {
            const wasEdit = Boolean(editing);
            closeForm();
            toast.success(wasEdit ? 'Project updated' : 'Project created');
            if (!wasEdit) navigate(`/projects/${saved.id}`);
          }}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title="Delete project?"
          message={`“${deleting.name}” and everything inside it will be permanently deleted. This cannot be undone.`}
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
