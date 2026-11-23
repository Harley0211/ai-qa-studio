import {
  FileJson,
  Film,
  Folder,
  Image as ImageIcon,
  Loader2,
  Paperclip,
  Sparkles,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useOutletContext } from "react-router-dom";
import { PageHeader } from "../../components/layout/PageHeader.jsx";
import { Button } from "../../components/ui/Button.jsx";
import { EmptyState, ErrorState, LoadingState } from "../../components/ui/States.jsx";
import { TextField } from "../../components/ui/TextField.jsx";
import { useToast } from "../../components/ui/Toast.jsx";
import { HarErrors } from "../har/HarViews.jsx";
import { formatBytes, readHarFile } from "../har/harParser.js";
import { bugReportHref } from "../tools/paths.js";
import { ToolCrumb } from "../tools/ToolCrumb.jsx";
import {
  MAX_AI_IMAGES,
  MAX_SAVED_FILE_BYTES,
  attachmentKind,
  attachmentProblem,
  framePlan,
} from "./attachments.js";
import { startBugReportTask, useBackgroundTasks } from "./backgroundTasks.js";
import { detectBrowser, useBugReports } from "./hooks.js";
import { SeverityBadge, StatusBadge } from "./ReportBadges.jsx";

const KIND_ICON = { image: ImageIcon, video: Film, har: FileJson };
let nextId = 1;

function StepHeading({ number, children }) {
  return (
    <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-indigo-600">
      {number} · {children}
    </h2>
  );
}

function formatWhen(value) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function AttachmentRow({ item, onRemove }) {
  const Icon = KIND_ICON[item.kind];
  return (
    <li className="rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center gap-3 px-3 py-2">
        {item.kind === "image" && item.previewUrl ? (
          <img src={item.previewUrl} alt="" className="h-10 w-14 rounded object-cover" />
        ) : (
          <span className="flex h-10 w-14 items-center justify-center rounded bg-slate-100">
            <Icon className="h-5 w-5 text-slate-500" aria-hidden="true" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-900" title={item.file.name}>
            {item.file.name}
          </p>
          <p className="text-xs text-slate-500">
            {item.kind === "har" ? "HAR file" : item.kind === "video" ? "Video" : "Image"} · {formatBytes(item.file.size)}
            {item.kind === "har" && item.har && ` · ${item.har.summary.total} requests, ${item.har.summary.failedCount} failed`}
            {item.kind === "har" && item.harError && <span className="text-red-600"> · {item.harError}</span>}
            {item.kind === "har" && !item.har && !item.harError && " · reading…"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onRemove(item.id)}
          aria-label={`Remove ${item.file.name}`}
          className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-red-600"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      {item.kind === "har" && item.har && item.har.summary.failedCount > 0 && (
        <div className="border-t border-slate-100 p-2">
          <HarErrors summary={item.har.summary} limit={5} />
        </div>
      )}
    </li>
  );
}

function AttachmentsStep({ attachments, onAdd, onRemove, plan }) {
  const input = useRef(null);
  const [dragging, setDragging] = useState(false);
  const counts = attachments.reduce((acc, item) => ({ ...acc, [item.kind]: (acc[item.kind] ?? 0) + 1 }), {});

  return (
    <section>
      <StepHeading number={2}>Evidence (optional)</StepHeading>
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
          onAdd([...(event.dataTransfer.files ?? [])]);
        }}
        className={`flex flex-col items-center rounded-xl border-2 border-dashed px-6 py-6 text-center transition-colors ${
          dragging ? "border-indigo-500 bg-indigo-50" : "border-slate-300 bg-white"
        }`}
      >
        <Paperclip className="mb-2 h-6 w-6 text-indigo-600" aria-hidden="true" />
        <p className="text-sm font-semibold text-slate-900">Drop screenshots, screen recordings and HAR files</p>
        <p className="mt-1 text-xs text-slate-500">
          Images: PNG, JPG, WEBP up to 5 MB · Videos: MP4, WebM up to {formatBytes(MAX_SAVED_FILE_BYTES)} · HAR up to 200 MB
        </p>
        <input
          ref={input}
          type="file"
          multiple
          accept="image/png,image/jpeg,image/webp,video/*,.har"
          className="hidden"
          aria-label="Add evidence files"
          onChange={(event) => {
            onAdd([...(event.target.files ?? [])]);
            event.target.value = "";
          }}
        />
        <Button variant="secondary" className="mt-3" onClick={() => input.current?.click()}>
          Choose files
        </Button>
      </div>

      {attachments.length > 0 && (
        <>
          <ul className="mt-3 space-y-2">
            {attachments.map((item) => (
              <AttachmentRow key={item.id} item={item} onRemove={onRemove} />
            ))}
          </ul>
          <p className="mt-2 text-xs text-slate-500">
            The AI sees up to {MAX_AI_IMAGES} images:{" "}
            {counts.image ? `${plan.screenshots} of ${counts.image} screenshots` : "no screenshots"}
            {counts.video ? `, ${plan.perVideo} frames from each video` : ""}
            {counts.har ? ", and the exact errors from every HAR file" : ""}. Everything is saved in the report's folder.
          </p>
        </>
      )}
    </section>
  );
}

// Reports for this project being prepared, uploaded or written right now.
function InProgress({ projectId }) {
  const tasks = useBackgroundTasks().filter(
    (task) => task.projectId === projectId && task.phase !== "done" && task.phase !== "failed",
  );
  if (tasks.length === 0) return null;

  return (
    <section aria-label="In progress" className="space-y-2">
      {tasks.map((task) => (
        <div key={task.id} className="flex items-center gap-3 rounded-xl border border-indigo-200 bg-white px-4 py-3">
          <Loader2 className="h-4 w-4 animate-spin text-indigo-600" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-900">{task.label}</p>
            <p className="text-xs text-slate-500">{task.message} You can leave this page; it keeps going.</p>
          </div>
          {task.reportId && (
            <Link to={bugReportHref(projectId, task.reportId)} className="text-sm font-medium text-indigo-600 hover:underline">
              Open
            </Link>
          )}
        </div>
      ))}
    </section>
  );
}

// Every saved report in this project, each a folder of files.
export function SavedReports({ projectId }) {
  const { data, isPending, isError, error, refetch } = useBugReports(projectId);
  const items = data?.items ?? [];

  return (
    <section aria-label="Saved bug reports" className="space-y-3">
      <h2 className="text-base font-semibold text-slate-900">Saved bug reports</h2>
      {isPending ? (
        <LoadingState label="Loading bug reports..." />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Folder}
          title="No bug reports yet"
          description="Every report you generate is saved here in its own folder, with its files."
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                to={bugReportHref(projectId, item.id)}
                className="flex h-full gap-3 rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:border-indigo-300"
              >
                <Folder className="mt-0.5 h-5 w-5 shrink-0 text-indigo-500" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-900">
                    {item.title || item.description || "Bug report"}
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-1.5">
                    <StatusBadge status={item.status} />
                    {item.severity && <SeverityBadge severity={item.severity} />}
                  </span>
                  <span className="mt-1.5 block text-xs text-slate-500">
                    {item.fileCount} {item.fileCount === 1 ? "file" : "files"} · {formatBytes(item.totalSize)} ·{" "}
                    {formatWhen(item.createdAt)}
                    {item.createdBy && ` · ${item.createdBy.name}`}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function BugReportPage() {
  const { project } = useOutletContext();
  const toast = useToast();
  const location = useLocation();
  const detected = useMemo(() => detectBrowser(), []);
  const emptyForm = { description: "", steps: "", expected: "" };
  const [form, setForm] = useState(emptyForm);
  const [environment, setEnvironment] = useState({ url: "", browser: detected.browser, device: detected.device, build: "" });
  const [attachments, setAttachments] = useState([]);
  const [errors, setErrors] = useState({});
  const counts = attachments.reduce((acc, item) => ({ ...acc, [item.kind]: (acc[item.kind] ?? 0) + 1 }), {});
  const plan = framePlan(counts.image ?? 0, counts.video ?? 0);
  const busyTasks = useBackgroundTasks().filter((task) => task.phase !== "done" && task.phase !== "failed");

  function addFiles(files) {
    const added = [];
    for (const file of files) {
      const problem = attachmentProblem(file);
      if (problem) {
        toast.error(problem);
        continue;
      }
      const kind = attachmentKind(file);
      const item = { id: nextId++, file, kind, previewUrl: kind === "image" ? URL.createObjectURL(file) : null };
      added.push(item);
      if (kind === "har") {
        readHarFile(file).then(
          (har) => setAttachments((list) => list.map((x) => (x.id === item.id ? { ...x, har } : x))),
          (err) => setAttachments((list) => list.map((x) => (x.id === item.id ? { ...x, harError: err.message } : x))),
        );
      }
    }
    if (added.length) setAttachments((list) => [...list, ...added]);
  }

  function removeAttachment(id) {
    setAttachments((list) => {
      const item = list.find((x) => x.id === id);
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return list.filter((x) => x.id !== id);
    });
  }

  // A HAR handed over from the HAR reader ("Create bug report").
  const handedOver = useRef(false);
  useEffect(() => {
    const file = location.state?.harFile;
    if (file && !handedOver.current) {
      handedOver.current = true;
      addFiles([file]);
    }
    // Only on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function generate() {
    if (form.description.trim().length < 10) {
      setErrors({ description: "Describe what happened (at least 10 characters)." });
      return;
    }
    if (attachments.some((item) => item.kind === "har" && !item.har && !item.harError)) {
      toast.error("Wait until the HAR files have been read.");
      return;
    }
    if (busyTasks.length > 0) {
      toast.error("Wait for your current bug report to finish.");
      return;
    }
    setErrors({});
    startBugReportTask({ project, form, environment, attachments, maxFileBytes: MAX_SAVED_FILE_BYTES });
    toast.success("Generating in the background. You can keep working; you'll be told when it's ready.");
    // The task keeps the files; the form is ready for the next report.
    setForm(emptyForm);
    setAttachments([]);
    setEnvironment((env) => ({ ...env, url: "", build: "" }));
  }

  return (
    <>
      <ToolCrumb project={project} tool="Bug report" />
      <PageHeader
        title="Bug report generator"
        description={`Describe a bug in ${project.name}, attach screenshots, recordings or a HAR file, and get a Jira ticket and a Slack message ready to paste.`}
      />

      <div className="space-y-6">
        <div className="space-y-6 rounded-xl border border-slate-200 bg-white p-5">
          <section className="space-y-3">
            <StepHeading number={1}>What happened</StepHeading>
            <TextField
              label="Describe the bug"
              multiline
              rows={4}
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
              placeholder="e.g. After clicking Place order, an error toast says “Something went wrong” and no order is created."
              error={errors.description}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField
                label="Steps you took (optional)"
                multiline
                value={form.steps}
                onChange={(event) => setForm({ ...form, steps: event.target.value })}
                placeholder={"One step per line\nOpen the cart\nClick Place order"}
              />
              <TextField
                label="What you expected (optional)"
                multiline
                value={form.expected}
                onChange={(event) => setForm({ ...form, expected: event.target.value })}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-4">
              <TextField label="Page / URL" value={environment.url} onChange={(event) => setEnvironment({ ...environment, url: event.target.value })} />
              <TextField label="Browser" value={environment.browser} onChange={(event) => setEnvironment({ ...environment, browser: event.target.value })} />
              <TextField label="Device / OS" value={environment.device} onChange={(event) => setEnvironment({ ...environment, device: event.target.value })} />
              <TextField label="Build / version" value={environment.build} onChange={(event) => setEnvironment({ ...environment, build: event.target.value })} />
            </div>
          </section>

          <AttachmentsStep attachments={attachments} onAdd={addFiles} onRemove={removeAttachment} plan={plan} />

          <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-5">
            <Button icon={Sparkles} onClick={generate} disabled={busyTasks.length > 0}>
              Generate bug report
            </Button>
            <span className="text-xs text-slate-500">
              {busyTasks.length > 0
                ? "One report at a time: wait for the current one to finish."
                : "Runs in the background and is saved with all its files. You can leave this page."}
            </span>
          </div>
        </div>

        <InProgress projectId={project.id} />
        <SavedReports projectId={project.id} />
      </div>
    </>
  );
}
