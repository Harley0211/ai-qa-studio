import { ExternalLink, Globe, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Button, IconButton } from '../../components/ui/Button.jsx';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog.jsx';
import { EmptyState } from '../../components/ui/States.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { safeHref } from '../../lib/url.js';
import { useDeleteUrl } from './hooks.js';
import { UrlFormModal } from './UrlFormModal.jsx';

export default function UrlsTab() {
  const { project } = useOutletContext();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const deleteUrl = useDeleteUrl(project.id);
  const toast = useToast();

  const openAdd = () => { setEditing(null); setFormOpen(true); };
  const closeForm = () => { setFormOpen(false); setEditing(null); };

  async function confirmDelete() {
    try {
      await deleteUrl.mutateAsync(deleting.id);
      toast.success('URL removed');
      setDeleting(null);
    } catch {
      /* shown in dialog */
    }
  }

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Application URLs</h2>
          <p className="text-sm text-slate-500">Pages and environments under test for this project.</p>
        </div>
        <Button icon={Plus} onClick={openAdd}>Add URL</Button>
      </div>

      {project.urls.length === 0 ? (
        <EmptyState
          icon={Globe}
          title="No URLs yet"
          description="Add the application URLs you want to analyse and test."
          action={<Button icon={Plus} onClick={openAdd}>Add your first URL</Button>}
        />
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
          {project.urls.map((u) => (
            <li key={u.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                {u.label && <p className="truncate text-sm font-medium text-slate-900">{u.label}</p>}
                <a href={safeHref(u.url)} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-1 text-sm text-indigo-600 hover:underline">
                  <span className="truncate">{u.url}</span>
                  <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                </a>
              </div>
              <div className="flex shrink-0">
                <IconButton icon={Pencil} label={`Edit ${u.url}`} onClick={() => { setEditing(u); setFormOpen(true); }} />
                <IconButton icon={Trash2} label={`Remove ${u.url}`} onClick={() => { deleteUrl.reset(); setDeleting(u); }} />
              </div>
            </li>
          ))}
        </ul>
      )}

      {formOpen && (
        <UrlFormModal
          projectId={project.id}
          urlRecord={editing ?? undefined}
          onClose={closeForm}
          onSaved={() => { toast.success(editing ? 'URL updated' : 'URL added'); closeForm(); }}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title="Remove URL?"
          message={`${deleting.url} will be removed from this project.`}
          confirmLabel="Remove URL"
          isPending={deleteUrl.isPending}
          error={deleteUrl.error?.message}
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </section>
  );
}
