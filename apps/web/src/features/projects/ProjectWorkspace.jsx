import { ArrowLeft, FolderX, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import {
  Link,
  NavLink,
  Outlet,
  useNavigate,
  useParams,
} from "react-router-dom";
import { PageHeader } from "../../components/layout/PageHeader.jsx";
import { Button } from "../../components/ui/Button.jsx";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog.jsx";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "../../components/ui/States.jsx";
import { useToast } from "../../components/ui/Toast.jsx";
import { useDeleteProject, useProject } from "./hooks.js";
import { ProjectFormModal } from "./ProjectFormModal.jsx";

export default function ProjectWorkspace() {
  const { projectId } = useParams();
  const {
    data: project,
    isPending,
    isError,
    error,
    refetch,
  } = useProject(projectId);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const deleteProject = useDeleteProject();
  const toast = useToast();
  const navigate = useNavigate();

  if (isPending) return <LoadingState label="Loading project…" />;
  if (isError) {
    return error.status === 404 ? (
      <EmptyState
        icon={FolderX}
        title="Project not found"
        description="It may have been deleted, or the link is incorrect."
        action={
          <Link
            to="/projects"
            className="text-sm font-medium text-indigo-600 hover:underline"
          >
            Back to projects
          </Link>
        }
      />
    ) : (
      <ErrorState error={error} onRetry={() => refetch()} />
    );
  }

  const base = `/projects/${project.id}`;
  const tabs = [
    { to: base, label: "Overview", end: true },
    { to: `${base}/urls`, label: "URLs" },
    { to: `${base}/evidence`, label: "Evidence" },
    { to: `${base}/test-cases`, label: "Test cases" },
  ];

  async function confirmDelete() {
    try {
      await deleteProject.mutateAsync(project.id);
      toast.success(`Deleted “${project.name}”`);
      navigate("/projects");
    } catch {
      /* shown in dialog */
    }
  }

  return (
    <>
      <Link
        to="/projects"
        className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All projects
      </Link>

      <PageHeader
        title={project.name}
        description={project.description}
        actions={
          <>
            <Button
              variant="secondary"
              icon={Pencil}
              onClick={() => setEditing(true)}
            >
              Edit
            </Button>
            <Button
              variant="secondary"
              icon={Trash2}
              onClick={() => {
                deleteProject.reset();
                setDeleting(true);
              }}
            >
              Delete
            </Button>
          </>
        }
      />

      <nav
        aria-label="Project sections"
        className="mb-6 flex gap-1 overflow-x-auto border-b border-slate-200"
      >
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) =>
              `-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${
                isActive
                  ? "border-indigo-600 text-indigo-700"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`
            }
          >
            {t.label}
          </NavLink>
        ))}
      </nav>

      <Outlet context={{ project }} />

      {editing && (
        <ProjectFormModal
          project={project}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            toast.success("Project updated");
          }}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title="Delete project?"
          message={`“${project.name}” and everything inside it will be permanently deleted. This cannot be undone.`}
          confirmLabel="Delete project"
          isPending={deleteProject.isPending}
          error={deleteProject.error?.message}
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(false)}
        />
      )}
    </>
  );
}
