import { FileText, Plus, Sparkles, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { Button, IconButton } from "../../components/ui/Button.jsx";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog.jsx";
import { EmptyState, ErrorState, LoadingState } from "../../components/ui/States.jsx";
import { useToast } from "../../components/ui/Toast.jsx";
import { formatDate } from "../../lib/format.js";
import { prdToolHref } from "../tools/paths.js";
import { AddDocumentModal } from "./AddDocumentModal.jsx";
import { useDeleteDocument, useDocument, useDocuments } from "./hooks.js";

const plural = (count, one, many) => `${count.toLocaleString()} ${count === 1 ? one : many}`;

function SectionList({ projectId, documentId }) {
  const { data, isPending, isError } = useDocument(projectId, documentId);

  if (isPending) return <LoadingState label="Loading sections..." />;
  if (isError) return <p className="text-sm text-red-600">Unable to load sections.</p>;

  return (
    <ol className="mt-2 space-y-1 text-sm">
      {data.sections.map((section) => (
        <li key={section.id} className="flex justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2">
          <span className="text-slate-800">{section.title}</span>
          <span className="shrink-0 text-xs text-slate-500">
            {plural(section.charCount, "character", "characters")}
          </span>
        </li>
      ))}
    </ol>
  );
}

export default function DocumentsTab() {
  const { project } = useOutletContext();
  const { data, isPending, isError, error, refetch } = useDocuments(project.id);
  const deleteDocument = useDeleteDocument(project.id);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const toast = useToast();
  const items = data?.items ?? [];

  async function confirmDelete() {
    try {
      await deleteDocument.mutateAsync(deleting.id);
      toast.success("Document deleted.");
      setDeleting(null);
    } catch {
      /* Error is shown in the confirmation dialog. */
    }
  }

  return (
    <section>
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Documents</h2>
          <p className="text-sm text-slate-500">
            PRDs and requirements used to generate test cases.
          </p>
        </div>
        <Button icon={Plus} onClick={() => setAdding(true)}>
          Add document
        </Button>
      </div>

      {isPending ? (
        <LoadingState label="Loading documents..." />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No documents yet"
          description="Paste or upload a PRD to generate test cases from its sections."
          action={
            <Button icon={Plus} onClick={() => setAdding(true)}>
              Add document
            </Button>
          }
        />
      ) : (
        <ul className="space-y-3">
          {items.map((doc) => (
            <li key={doc.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold text-slate-900">{doc.title}</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    {plural(doc.sectionCount, "section", "sections")} ·{" "}
                    {plural(doc.charCount, "character", "characters")} ·{" "}
                    {doc.sourceType === "UPLOAD" ? doc.filename : "Pasted text"} · Added{" "}
                    {formatDate(doc.createdAt)}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Link
                    to={prdToolHref(project.id, doc.id)}
                    className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-50"
                  >
                    <Sparkles className="h-4 w-4" aria-hidden="true" />
                    Generate test cases
                    <span className="sr-only"> from {doc.title}</span>
                  </Link>
                  <IconButton
                    icon={Trash2}
                    label={`Delete ${doc.title}`}
                    className="text-red-600 hover:bg-red-50 hover:text-red-700"
                    onClick={() => {
                      deleteDocument.reset();
                      setDeleting(doc);
                    }}
                  />
                </div>
              </div>
              <details className="mt-3">
                <summary className="cursor-pointer text-sm font-medium text-indigo-600 hover:text-indigo-700">
                  View sections
                </summary>
                <SectionList projectId={project.id} documentId={doc.id} />
              </details>
            </li>
          ))}
        </ul>
      )}

      {adding && (
        <AddDocumentModal
          projectId={project.id}
          onClose={() => setAdding(false)}
          onSaved={(saved) => {
            setAdding(false);
            toast.success(`“${saved.title}” added with ${plural(saved.sectionCount, "section", "sections")}.`);
          }}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title="Delete document?"
          message={`“${deleting.title}” will be removed. Test cases already generated from it are kept.`}
          confirmLabel="Delete document"
          isPending={deleteDocument.isPending}
          error={deleteDocument.error?.message}
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </section>
  );
}
