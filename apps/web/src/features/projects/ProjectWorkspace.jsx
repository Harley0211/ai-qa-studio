import { ArrowLeftRight, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link, NavLink, Outlet, useNavigate, useOutletContext } from "react-router-dom";
import { PageHeader } from "../../components/layout/PageHeader.jsx";
import { Button } from "../../components/ui/Button.jsx";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog.jsx";
import { useToast } from "../../components/ui/Toast.jsx";
import { useCurrentUser } from "../auth/auth.hooks.js";
import { PROJECTS_PATH, projectHref } from "../tools/paths.js";
import { useDeleteProject } from "./hooks.js";
import { ProjectFormModal } from "./ProjectFormModal.jsx";

export default function ProjectWorkspace() {
  const { project } = useOutletContext();
  const user = useCurrentUser();
  const isAdmin = user?.role === "ADMIN";
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const deleteProject = useDeleteProject();
  const toast = useToast();
  const navigate = useNavigate();

  const base = projectHref(project.id);
  const tabs = [
    { to: base, label: "Overview", end: true },
    { to: `${base}/urls`, label: "URLs" },
    { to: `${base}/evidence`, label: "Evidence" },
    { to: `${base}/documents`, label: "Documents" },
    { to: `${base}/test-cases`, label: "Test cases" },
  ];

  async function confirmDelete() {
    try {
      await deleteProject.mutateAsync(project.id);
      toast.success(`Deleted “${project.name}”`);
      navigate(PROJECTS_PATH);
    } catch {
      /* shown in dialog */
    }
  }

  return (
    <>
      <Link
        to={PROJECTS_PATH}
        className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
      >
        <ArrowLeftRight className="h-4 w-4" aria-hidden="true" /> Switch project
      </Link>

      <PageHeader
        title={project.name}
        description={project.description}
        actions={
          isAdmin && (
            <>
              <Button variant="secondary" icon={Pencil} onClick={() => setEditing(true)}>
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
          )
        }
      />

      <nav aria-label="Project sections" className="mb-6 flex gap-1 overflow-x-auto border-b border-slate-200">
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) =>
              `-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${
                isActive ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-800"
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
          message={`“${project.name}” and everything inside it (test cases, evidence, documents, bug reports and HAR files) will be permanently deleted. This cannot be undone.`}
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
