import { ArrowLeft, Check, Copy, Download, FolderOpen, Loader2, RotateCcw, Save, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { PageHeader } from "../../components/layout/PageHeader.jsx";
import { Button } from "../../components/ui/Button.jsx";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog.jsx";
import { ErrorState, LoadingState } from "../../components/ui/States.jsx";
import { useToast } from "../../components/ui/Toast.jsx";
import { downloadBlob } from "../../lib/zip.js";
import { useCurrentUser } from "../auth/auth.hooks.js";
import { formatBytes } from "../har/harParser.js";
import { BUG_REPORT_PATH } from "../tools/paths.js";
import { buildBugReportZip } from "./attachments.js";
import { PRIORITY_FOR_SEVERITY, jiraMarkdown, jiraWiki, slackMessage, slugify } from "./formatters.js";
import {
  bugReportFileUrl,
  fetchBlob,
  useBugReport,
  useDeleteBugReport,
  useRetryBugReport,
  useUpdateBugReport,
} from "./hooks.js";
import { SeverityBadge, StatusBadge } from "./ReportBadges.jsx";

const SEVERITIES = ["Blocker", "Critical", "Major", "Minor", "Trivial"];
const KIND_LABEL = {
  image: "Screenshot",
  frame: "Video frame",
  video: "Video",
  har: "HAR (redacted)",
  "har-summary": "HAR summary",
};

const contextOf = (input) => ({
  environment: input?.environment ?? {},
  attachments: input?.attachments ?? [],
  harErrors: input?.harErrors ?? [],
});

const textsFor = (report, context) => ({
  jiraMarkdown: jiraMarkdown(report, context),
  jiraWiki: jiraWiki(report, context),
  slack: slackMessage(report, context),
});

function CopyButton({ text, label }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy. Select the text and copy it instead.");
    }
  }
  return (
    <Button variant="secondary" size="sm" icon={copied ? Check : Copy} onClick={copy}>
      {copied ? "Copied" : label}
    </Button>
  );
}

function ReportEditor({ data, canChange }) {
  const toast = useToast();
  const update = useUpdateBugReport(data.id);
  const context = useMemo(() => contextOf(data.input), [data.input]);
  const [draft, setDraft] = useState(() => ({
    report: data.report,
    texts: data.texts ?? textsFor(data.report, context),
  }));
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState("jira");
  const [jiraFlavor, setJiraFlavor] = useState("markdown");
  const jiraText = jiraFlavor === "markdown" ? draft.texts.jiraMarkdown : draft.texts.jiraWiki;

  function changeReport(next) {
    setDraft({ report: next, texts: textsFor(next, context) });
    setDirty(true);
  }

  function changeText(key, value) {
    setDraft((current) => ({ ...current, texts: { ...current.texts, [key]: value } }));
    setDirty(true);
  }

  async function save() {
    try {
      await update.mutateAsync({ title: draft.report.title, severity: draft.report.severity, texts: draft.texts });
      setDirty(false);
      toast.success("Changes saved.");
    } catch (err) {
      toast.error(err.message || "Unable to save the changes.");
    }
  }

  return (
    <section aria-label="Generated bug report" className="space-y-4 rounded-xl border border-indigo-200 bg-white p-5">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <div>
          <label htmlFor="bug-title" className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Jira summary (title)
          </label>
          <div className="mt-1 flex gap-2">
            <input
              id="bug-title"
              value={draft.report.title}
              readOnly={!canChange}
              onChange={(event) => changeReport({ ...draft.report, title: event.target.value })}
              className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900"
            />
            <CopyButton text={draft.report.title} label="Copy" />
          </div>
        </div>
        <div>
          <label htmlFor="bug-severity" className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Severity
          </label>
          <select
            id="bug-severity"
            value={draft.report.severity}
            disabled={!canChange}
            onChange={(event) => changeReport({ ...draft.report, severity: event.target.value })}
            className="mt-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
          >
            {SEVERITIES.map((value) => (
              <option key={value} value={value}>
                {value} (priority {PRIORITY_FOR_SEVERITY[value]})
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500">
          Changing the title or severity rewrites the texts below. You can also edit the texts directly.
        </p>
        {canChange && (
          <Button icon={Save} size="sm" disabled={!dirty} loading={update.isPending} onClick={save}>
            {dirty ? "Save changes" : "Saved"}
          </Button>
        )}
      </div>

      <div role="tablist" aria-label="Report format" className="flex gap-1 border-b border-slate-200">
        {[
          ["jira", "Jira"],
          ["slack", "Slack"],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`rounded-t-lg px-4 py-2 text-sm font-semibold ${
              tab === key ? "bg-indigo-50 text-indigo-700" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "jira" ? (
        <div role="tabpanel" aria-label="Jira" className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div role="group" aria-label="Jira format" className="flex gap-1">
              {[
                ["markdown", "Jira Cloud (Markdown)"],
                ["wiki", "Jira Server / Data Center (wiki)"],
              ].map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={jiraFlavor === key}
                  onClick={() => setJiraFlavor(key)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${
                    jiraFlavor === key ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <CopyButton text={jiraText} label="Copy description" />
          </div>
          <textarea
            aria-label="Jira description"
            value={jiraText}
            readOnly={!canChange}
            onChange={(event) => changeText(jiraFlavor === "markdown" ? "jiraMarkdown" : "jiraWiki", event.target.value)}
            rows={18}
            className="block w-full rounded-lg border border-slate-300 bg-white p-3 font-mono text-xs text-slate-800"
          />
        </div>
      ) : (
        <div role="tabpanel" aria-label="Slack" className="space-y-2">
          <div className="flex justify-end">
            <CopyButton text={draft.texts.slack} label="Copy message" />
          </div>
          <textarea
            aria-label="Slack message"
            value={draft.texts.slack}
            readOnly={!canChange}
            onChange={(event) => changeText("slack", event.target.value)}
            rows={18}
            className="block w-full rounded-lg border border-slate-300 bg-white p-3 font-mono text-xs text-slate-800"
          />
        </div>
      )}

      <ZipButton data={data} draft={draft} />
    </section>
  );
}

function ZipButton({ data, draft }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    try {
      const files = await Promise.all(
        data.files.map(async (file) => ({ ...file, blob: await fetchBlob(bugReportFileUrl(data.id, file.id, true)) })),
      );
      const blob = await buildBugReportZip({ report: draft.report, texts: draft.texts, files });
      downloadBlob(blob, `bug-report-${slugify(draft.report.title)}-${String(data.createdAt).slice(0, 10)}.zip`);
    } catch (err) {
      toast.error(err.message || "Unable to build the ZIP file.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex justify-end border-t border-slate-100 pt-4">
      <Button icon={Download} loading={busy} onClick={download}>
        Download ZIP
      </Button>
    </div>
  );
}

function FolderFiles({ data }) {
  return (
    <section aria-label="Files in this folder" className="rounded-xl border border-slate-200 bg-white">
      <h2 className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-900">
        <FolderOpen className="h-4 w-4 text-indigo-500" aria-hidden="true" />
        Folder · {data.files.length} {data.files.length === 1 ? "file" : "files"}
      </h2>
      {data.files.length === 0 ? (
        <p className="px-4 py-3 text-sm text-slate-500">No files were attached.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {data.files.map((file) => (
            <li key={file.id} className="flex items-center gap-3 px-4 py-2.5">
              {file.mimeType.startsWith("image/") ? (
                <img src={bugReportFileUrl(data.id, file.id)} alt="" loading="lazy" className="h-10 w-14 rounded object-cover" />
              ) : (
                <span className="flex h-10 w-14 items-center justify-center rounded bg-slate-100 text-xs text-slate-500">
                  {file.kind === "video" ? "Video" : "File"}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-900">{file.name}</p>
                <p className="text-xs text-slate-500">
                  {KIND_LABEL[file.kind] ?? file.kind} · {formatBytes(file.size)}
                  {file.usedByAi && " · seen by the AI"}
                </p>
              </div>
              <a
                href={bugReportFileUrl(data.id, file.id, true)}
                download={file.name}
                className="text-sm font-medium text-indigo-600 hover:underline"
              >
                Download
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function TesterInput({ input }) {
  const env = Object.entries(input.environment ?? {}).filter(([, value]) => value);
  return (
    <details className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <summary className="cursor-pointer text-sm font-semibold text-slate-900">What was entered</summary>
      <dl className="mt-3 space-y-2 text-sm">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Description</dt>
          <dd className="whitespace-pre-wrap text-slate-800">{input.description}</dd>
        </div>
        {input.steps && (
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Steps</dt>
            <dd className="whitespace-pre-wrap text-slate-800">{input.steps}</dd>
          </div>
        )}
        {input.expected && (
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Expected</dt>
            <dd className="whitespace-pre-wrap text-slate-800">{input.expected}</dd>
          </div>
        )}
        {env.length > 0 && (
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Environment</dt>
            <dd className="text-slate-800">{env.map(([key, value]) => `${key}: ${value}`).join(" · ")}</dd>
          </div>
        )}
      </dl>
    </details>
  );
}

export default function BugReportDetailPage() {
  const { reportId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const user = useCurrentUser();
  const { data, isPending, isError, error, refetch } = useBugReport(reportId);
  const retry = useRetryBugReport(reportId);
  const remove = useDeleteBugReport();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const report = data?.data;
  const canChange = Boolean(report && user && (user.role === "ADMIN" || report.createdBy?.id === user.id));

  // Tell the person when the report they're looking at finishes.
  const [lastStatus, setLastStatus] = useState(null);
  useEffect(() => {
    if (!report) return;
    if (lastStatus === "PENDING" && report.status === "SUCCEEDED") toast.success("Bug report ready.");
    setLastStatus(report.status);
  }, [report, lastStatus, toast]);

  async function confirmDelete() {
    try {
      await remove.mutateAsync(reportId);
      toast.success("Bug report and its folder deleted.");
      navigate(BUG_REPORT_PATH);
    } catch {
      /* Shown in the dialog. */
    }
  }

  async function handleRetry() {
    try {
      await retry.mutateAsync();
      await refetch();
    } catch (err) {
      toast.error(err.message || "Unable to retry.");
    }
  }

  return (
    <>
      <Link to={BUG_REPORT_PATH} className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-indigo-700">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Bug reports
      </Link>

      {isPending ? (
        <LoadingState label="Loading bug report..." />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : (
        <>
          <PageHeader
            title={report.title || "Bug report"}
            description={
              <span className="flex flex-wrap items-center gap-2">
                <StatusBadge status={report.status} />
                {report.severity && <SeverityBadge severity={report.severity} />}
                <span>
                  {new Date(report.createdAt).toLocaleString()}
                  {report.createdBy && ` · ${report.createdBy.name}`}
                </span>
              </span>
            }
            actions={
              canChange && (
                <Button
                  variant="secondary"
                  icon={Trash2}
                  onClick={() => {
                    remove.reset();
                    setConfirmingDelete(true);
                  }}
                >
                  Delete folder
                </Button>
              )
            }
          />

          <div className="space-y-5">
            {report.status === "PENDING" && (
              <p role="status" className="flex items-center gap-2 rounded-xl bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                The AI is writing this report. It keeps going if you leave this page.
              </p>
            )}
            {report.status === "FAILED" && (
              <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-red-50 px-4 py-3">
                <p className="text-sm text-red-800">{report.error || "The bug report could not be generated."}</p>
                {canChange && (
                  <Button variant="secondary" icon={RotateCcw} loading={retry.isPending} onClick={handleRetry}>
                    Retry
                  </Button>
                )}
              </div>
            )}
            {report.status === "SUCCEEDED" && report.report && (
              <ReportEditor key={report.completedAt} data={report} canChange={canChange} />
            )}
            <FolderFiles data={report} />
            <TesterInput input={report.input} />
          </div>

          {confirmingDelete && (
            <ConfirmDialog
              title="Delete this bug report?"
              message={`The report and its folder (${report.files.length} ${report.files.length === 1 ? "file" : "files"}) will be permanently deleted from storage.`}
              confirmLabel="Delete folder"
              isPending={remove.isPending}
              error={remove.error?.message}
              onConfirm={confirmDelete}
              onCancel={() => setConfirmingDelete(false)}
            />
          )}
        </>
      )}
    </>
  );
}
