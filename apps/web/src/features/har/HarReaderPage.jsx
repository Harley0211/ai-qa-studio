import { Bug, Download, FileJson, Folder, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { Link, useNavigate, useOutletContext } from "react-router-dom";
import { PageHeader } from "../../components/layout/PageHeader.jsx";
import { Button } from "../../components/ui/Button.jsx";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog.jsx";
import { EmptyState, ErrorState, LoadingState } from "../../components/ui/States.jsx";
import { useToast } from "../../components/ui/Toast.jsx";
import { downloadBlob } from "../../lib/zip.js";
import { useCurrentUser } from "../auth/auth.hooks.js";
import { MAX_SAVED_FILE_BYTES } from "../bug-report/attachments.js";
import { useDeleteHarFile, useHarFiles, useSaveHarFile } from "../bug-report/hooks.js";
import { bugReportsHref, harFileHref } from "../tools/paths.js";
import { ToolCrumb } from "../tools/ToolCrumb.jsx";
import { HarEntryDetail, HarErrors, HarSummary, HarTable } from "./HarViews.jsx";
import { HarExplanation } from "./HarExplanation.jsx";
import { harReportMarkdown } from "./harExplainer.js";
import { formatBytes, formatMs, readHarFile, redactHar } from "./harParser.js";

// Parsed HARs this browser just opened, so opening the saved copy right after
// doesn't download and parse it again.
export const openedHars = new Map();

// Drop zone for one .har file.
export function HarDropzone({ onFile, busy, label = "Drop a HAR file here" }) {
  const input = useRef(null);
  const [dragging, setDragging] = useState(false);

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        const file = event.dataTransfer.files?.[0];
        if (file) onFile(file);
      }}
      className={`flex flex-col items-center rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors ${
        dragging ? "border-indigo-500 bg-indigo-50" : "border-slate-300 bg-white"
      }`}
    >
      <FileJson className="mb-2 h-7 w-7 text-indigo-600" aria-hidden="true" />
      <p className="text-sm font-semibold text-slate-900">{label}</p>
      <p className="mt-1 text-xs text-slate-500">
        Export it from the browser: DevTools → Network → “Save all as HAR”. It is read on this computer; a copy
        without cookies, tokens or passwords is saved to the HAR library.
      </p>
      <input
        ref={input}
        type="file"
        accept=".har,application/json"
        className="hidden"
        aria-label="Choose HAR file"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onFile(file);
          event.target.value = "";
        }}
      />
      <Button icon={Upload} variant="secondary" className="mt-3" loading={busy} onClick={() => input.current?.click()}>
        Choose HAR file
      </Button>
    </div>
  );
}

// Everything the reader shows for one parsed HAR.
export function HarResult({ projectId, fileName, parsed, actions }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [selected, setSelected] = useState(parsed.summary.errors[0] ?? null);
  const base = fileName.replace(/\.har$/i, "");

  function downloadSummary() {
    downloadBlob(new Blob([harReportMarkdown(fileName, parsed)], { type: "text/markdown" }), `${base}-summary.md`);
  }

  function downloadRedacted() {
    downloadBlob(new Blob([JSON.stringify(redactHar(parsed.har), null, 2)], { type: "application/json" }), `${base}-redacted.har`);
    toast.success("Downloaded a copy without cookies, tokens or passwords.");
  }

  function createBugReport() {
    const file = new File([JSON.stringify(parsed.har)], fileName, { type: "application/json" });
    navigate(bugReportsHref(projectId), { state: { harFile: file } });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-600">
          <span className="font-semibold text-slate-900">{fileName}</span>
          {parsed.summary.capturedAt && ` · captured ${new Date(parsed.summary.capturedAt).toLocaleString()}`}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" icon={Download} onClick={downloadSummary}>
            Summary (.md)
          </Button>
          <Button variant="secondary" size="sm" icon={Download} onClick={downloadRedacted}>
            Redacted HAR
          </Button>
          <Button size="sm" icon={Bug} onClick={createBugReport}>
            Create bug report
          </Button>
          {actions}
        </div>
      </div>
      <HarSummary summary={parsed.summary} />
      <HarExplanation summary={parsed.summary} entries={parsed.entries} onSelect={setSelected} />
      <HarErrors summary={parsed.summary} onSelect={setSelected} />
      {selected && <HarEntryDetail key={selected.id} entry={selected} onClose={() => setSelected(null)} />}
      <HarTable entries={parsed.entries} selectedId={selected?.id} onSelect={setSelected} />
    </div>
  );
}

// The short summary stored with a saved HAR, for the library list.
export function librarySummary(summary) {
  return {
    total: summary.total,
    failedCount: summary.failedCount,
    durationMs: summary.durationMs,
    totalBytes: summary.totalBytes,
    capturedAt: summary.capturedAt,
    classCounts: summary.classCounts,
    topErrors: summary.errors.slice(0, 5).map((entry) => ({
      method: entry.method,
      path: entry.path.split("?")[0].slice(0, 300),
      status: entry.status,
    })),
  };
}

function HarLibrary({ projectId }) {
  const toast = useToast();
  const user = useCurrentUser();
  const { data, isPending, isError, error, refetch } = useHarFiles(projectId);
  const remove = useDeleteHarFile(projectId);
  const [deleting, setDeleting] = useState(null);
  const items = data?.items ?? [];

  async function confirmDelete() {
    try {
      await remove.mutateAsync(deleting.id);
      openedHars.delete(deleting.id);
      toast.success("HAR file and its folder deleted.");
      setDeleting(null);
    } catch {
      /* Shown in the dialog. */
    }
  }

  return (
    <section aria-label="HAR library" className="space-y-3">
      <h2 className="text-base font-semibold text-slate-900">HAR library</h2>
      {isPending ? (
        <LoadingState label="Loading HAR files..." />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        <EmptyState icon={Folder} title="No HAR files yet" description="Every HAR you open here is saved in its own folder." />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {items.map((item) => {
            const canDelete = user && (user.role === "ADMIN" || item.createdBy?.id === user.id);
            return (
              <li key={item.id} className="flex gap-3 rounded-xl border border-slate-200 bg-white p-4">
                <Folder className="mt-0.5 h-5 w-5 shrink-0 text-indigo-500" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <Link to={harFileHref(projectId, item.id)} className="block truncate text-sm font-semibold text-slate-900 hover:text-indigo-700">
                    {item.name}
                  </Link>
                  <p className="mt-1 text-xs text-slate-500">
                    {item.summary.total} requests ·{" "}
                    <span className={item.summary.failedCount ? "font-semibold text-red-600" : ""}>
                      {item.summary.failedCount} failed
                    </span>{" "}
                    · {formatMs(item.summary.durationMs)} · {formatBytes(item.size)}
                  </p>
                  {item.summary.topErrors[0] && (
                    <p className="mt-0.5 truncate font-mono text-xs text-red-700">
                      {item.summary.topErrors[0].status || "ERR"} {item.summary.topErrors[0].method} {item.summary.topErrors[0].path}
                    </p>
                  )}
                  <p className="mt-0.5 text-xs text-slate-400">
                    {new Date(item.createdAt).toLocaleString()}
                    {item.createdBy && ` · ${item.createdBy.name}`}
                  </p>
                </div>
                {canDelete && (
                  <button
                    type="button"
                    onClick={() => {
                      remove.reset();
                      setDeleting(item);
                    }}
                    aria-label={`Delete ${item.name}`}
                    className="self-start rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {deleting && (
        <ConfirmDialog
          title="Delete this HAR file?"
          message={`${deleting.name} and its folder will be permanently deleted from storage.`}
          confirmLabel="Delete folder"
          isPending={remove.isPending}
          error={remove.error?.message}
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </section>
  );
}

export default function HarReaderPage() {
  const { project } = useOutletContext();
  const navigate = useNavigate();
  const toast = useToast();
  const save = useSaveHarFile(project.id);
  const [local, setLocal] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function open(file) {
    setBusy(true);
    setError(null);
    try {
      const parsed = await readHarFile(file);
      const redacted = new Blob([JSON.stringify(redactHar(parsed.har))], { type: "application/json" });
      if (redacted.size > MAX_SAVED_FILE_BYTES) {
        setLocal({ fileName: file.name, parsed });
        toast.error(`This HAR is too large to save (over ${formatBytes(MAX_SAVED_FILE_BYTES)} without secrets). Showing it without saving.`);
        return;
      }
      try {
        const saved = await save.mutateAsync({ blob: redacted, name: file.name, summary: librarySummary(parsed.summary) });
        openedHars.set(saved.data.id, { fileName: file.name, parsed });
        toast.success("Saved to the HAR library.");
        navigate(harFileHref(project.id, saved.data.id));
      } catch (err) {
        setLocal({ fileName: file.name, parsed });
        toast.error(`Showing the file, but it couldn't be saved: ${err.message}`);
      }
    } catch (err) {
      setError(err.message || "Unable to read this file.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <ToolCrumb project={project} tool="HAR reader" />
      <PageHeader
        title="HAR reader"
        description={`See every request in a HAR file: status codes, errors, slow calls, headers and responses. Each file is kept in ${project.name}'s HAR library.`}
      />
      <div className="space-y-6">
        {local ? (
          <HarResult
            projectId={project.id}
            fileName={local.fileName}
            parsed={local.parsed}
            actions={
              <Button variant="ghost" size="sm" onClick={() => setLocal(null)}>
                Open another file
              </Button>
            }
          />
        ) : (
          <HarDropzone onFile={open} busy={busy} />
        )}
        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}
        <HarLibrary projectId={project.id} />
      </div>
    </>
  );
}
