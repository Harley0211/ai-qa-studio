import {
  Bug,
  Check,
  Copy,
  Download,
  FileJson,
  Film,
  Image as ImageIcon,
  Paperclip,
  RotateCcw,
  Sparkles,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { PageHeader } from "../../components/layout/PageHeader.jsx";
import { Button } from "../../components/ui/Button.jsx";
import { TextField } from "../../components/ui/TextField.jsx";
import { useToast } from "../../components/ui/Toast.jsx";
import { downloadBlob } from "../../lib/zip.js";
import { HarErrors } from "../har/HarViews.jsx";
import { formatBytes, harFactsForAi, readHarFile } from "../har/harParser.js";
import {
  MAX_AI_IMAGES,
  attachmentKind,
  attachmentProblem,
  buildBugReportZip,
  frameName,
  framePlan,
} from "./attachments.js";
import { PRIORITY_FOR_SEVERITY, jiraMarkdown, jiraWiki, slackMessage, slugify } from "./formatters.js";
import { detectBrowser, useBugReportJob, useStartBugReport } from "./hooks.js";
import { extractFrames, formatTimestamp } from "./videoFrames.js";

const SEVERITIES = ["Blocker", "Critical", "Major", "Minor", "Trivial"];
const KIND_ICON = { image: ImageIcon, video: Film, har: FileJson };
const MAX_HAR_FACTS = 12000;
let nextId = 1;

function StepHeading({ number, children }) {
  return (
    <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-indigo-600">
      {number} · {children}
    </h2>
  );
}

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

function AttachmentRow({ item, onRemove, disabled }) {
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
          disabled={disabled}
          aria-label={`Remove ${item.file.name}`}
          className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-red-600 disabled:opacity-50"
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

function AttachmentsStep({ attachments, onAdd, onRemove, disabled, plan }) {
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
          Images: PNG, JPG, WEBP up to 5 MB · Videos: MP4, WebM up to 500 MB · HAR up to 200 MB
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
        <Button variant="secondary" className="mt-3" disabled={disabled} onClick={() => input.current?.click()}>
          Choose files
        </Button>
      </div>

      {attachments.length > 0 && (
        <>
          <ul className="mt-3 space-y-2">
            {attachments.map((item) => (
              <AttachmentRow key={item.id} item={item} onRemove={onRemove} disabled={disabled} />
            ))}
          </ul>
          <p className="mt-2 text-xs text-slate-500">
            The AI sees up to {MAX_AI_IMAGES} images:{" "}
            {counts.image ? `${plan.screenshots} of ${counts.image} screenshots` : "no screenshots"}
            {counts.video ? `, ${plan.perVideo} frames from each video` : ""}
            {counts.har ? ", and the exact errors from every HAR file" : ""}. Everything is included in the ZIP.
          </p>
        </>
      )}
    </section>
  );
}

function ResultView({ report, onChange, texts, onTextChange, onDownload, downloading, onReset }) {
  const [tab, setTab] = useState("jira");
  const [jiraFlavor, setJiraFlavor] = useState("markdown");
  const jiraText = jiraFlavor === "markdown" ? texts.jiraMarkdown : texts.jiraWiki;

  return (
    <section aria-label="Generated bug report" className="space-y-4 rounded-xl border border-indigo-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
          <Bug className="h-5 w-5 text-indigo-600" aria-hidden="true" />
          Bug report ready
        </h2>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" icon={RotateCcw} onClick={onReset}>
            New report
          </Button>
          <Button icon={Download} loading={downloading} onClick={onDownload}>
            Download ZIP
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <div>
          <label htmlFor="bug-title" className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Jira summary (title)
          </label>
          <div className="mt-1 flex gap-2">
            <input
              id="bug-title"
              value={report.title}
              onChange={(event) => onChange({ ...report, title: event.target.value })}
              className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900"
            />
            <CopyButton text={report.title} label="Copy" />
          </div>
        </div>
        <div>
          <label htmlFor="bug-severity" className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Severity
          </label>
          <select
            id="bug-severity"
            value={report.severity}
            onChange={(event) => onChange({ ...report, severity: event.target.value })}
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
      <p className="text-xs text-slate-500">
        Changing the title or severity rewrites the texts below. You can also edit the texts directly before copying.
      </p>

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
            onChange={(event) =>
              onTextChange(jiraFlavor === "markdown" ? "jiraMarkdown" : "jiraWiki", event.target.value)
            }
            rows={18}
            className="block w-full rounded-lg border border-slate-300 bg-white p-3 font-mono text-xs text-slate-800"
          />
        </div>
      ) : (
        <div role="tabpanel" aria-label="Slack" className="space-y-2">
          <div className="flex justify-end">
            <CopyButton text={texts.slack} label="Copy message" />
          </div>
          <textarea
            aria-label="Slack message"
            value={texts.slack}
            onChange={(event) => onTextChange("slack", event.target.value)}
            rows={18}
            className="block w-full rounded-lg border border-slate-300 bg-white p-3 font-mono text-xs text-slate-800"
          />
        </div>
      )}
    </section>
  );
}

export default function BugReportPage() {
  const toast = useToast();
  const location = useLocation();
  const detected = useMemo(() => detectBrowser(), []);
  const [form, setForm] = useState({ description: "", steps: "", expected: "" });
  const [environment, setEnvironment] = useState({ url: "", browser: detected.browser, device: detected.device, build: "" });
  const [attachments, setAttachments] = useState([]);
  const [preparing, setPreparing] = useState(null);
  const [jobId, setJobId] = useState(null);
  const [frames, setFrames] = useState([]);
  const [report, setReport] = useState(null);
  const [texts, setTexts] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [errors, setErrors] = useState({});
  const start = useStartBugReport();
  const job = useBugReportJob(jobId);
  const jobData = job.data?.data;

  const counts = attachments.reduce((acc, item) => ({ ...acc, [item.kind]: (acc[item.kind] ?? 0) + 1 }), {});
  const plan = framePlan(counts.image ?? 0, counts.video ?? 0);
  const hars = attachments.filter((item) => item.kind === "har" && item.har);
  const harErrors = useMemo(
    () => hars.flatMap((item) => item.har.summary.errors.map((entry) => ({ file: item.file.name, entry }))),
    [hars],
  );
  const context = useMemo(
    () => ({
      environment,
      attachments: attachments.map((item) => ({ name: item.file.name, kind: item.kind })),
      harErrors,
    }),
    [environment, attachments, harErrors],
  );

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

  // When the AI has finished, build the texts.
  useEffect(() => {
    if (jobData?.status === "SUCCEEDED" && !report) {
      setReport(jobData.report);
      setTexts({
        jiraMarkdown: jiraMarkdown(jobData.report, context),
        jiraWiki: jiraWiki(jobData.report, context),
        slack: slackMessage(jobData.report, context),
      });
      toast.success("Bug report ready.");
    }
    if (jobData?.status === "FAILED") {
      toast.error(jobData.error || "Unable to generate the bug report.");
      setJobId(null);
    }
  }, [jobData, report, context, toast]);

  function updateReport(next) {
    setReport(next);
    setTexts({
      jiraMarkdown: jiraMarkdown(next, context),
      jiraWiki: jiraWiki(next, context),
      slack: slackMessage(next, context),
    });
  }

  async function generate() {
    if (form.description.trim().length < 10) {
      setErrors({ description: "Describe what happened (at least 10 characters)." });
      return;
    }
    if (attachments.some((item) => item.kind === "har" && !item.har && !item.harError)) {
      toast.error("Wait until the HAR files have been read.");
      return;
    }
    setErrors({});

    try {
      const images = [];
      const imageNotes = [];
      for (const item of attachments.filter((x) => x.kind === "image").slice(0, plan.screenshots)) {
        images.push({ blob: item.file, name: item.file.name });
        imageNotes.push(`Screenshot ${item.file.name}`);
      }

      const takenFrames = [];
      const videos = attachments.filter((x) => x.kind === "video").slice(0, plan.videosWithFrames ?? 0);
      for (const [index, item] of videos.entries()) {
        setPreparing(`Reading frames from video ${index + 1} of ${videos.length}…`);
        try {
          const result = await extractFrames(item.file, { count: plan.perVideo });
          result.forEach((frame, i) => {
            const name = frameName(item.file.name, frame.time, i);
            takenFrames.push({ ...frame, name });
            images.push({ blob: frame.blob, name });
            imageNotes.push(`Frame ${i + 1} of video ${item.file.name} at ${formatTimestamp(frame.time)}`);
          });
        } catch (err) {
          toast.error(err.message);
        }
      }
      setFrames(takenFrames);

      setPreparing("Sending to the AI…");
      const harFacts = hars
        .map((item) => harFactsForAi(item.file.name, item.har.summary))
        .join("\n\n")
        .slice(0, MAX_HAR_FACTS);
      const formData = new FormData();
      formData.append(
        "details",
        JSON.stringify({
          ...form,
          environment,
          harFacts,
          imageNotes: imageNotes.slice(0, MAX_AI_IMAGES),
          attachments: context.attachments,
        }),
      );
      images.slice(0, MAX_AI_IMAGES).forEach(({ blob, name }) => formData.append("images", blob, name));

      const result = await start.mutateAsync(formData);
      setReport(null);
      setJobId(result.data.id);
    } catch (err) {
      toast.error(err.message || "Unable to start the bug report.");
    } finally {
      setPreparing(null);
    }
  }

  async function download() {
    setDownloading(true);
    try {
      const blob = await buildBugReportZip({ report, texts, attachments, frames, hars: hars.map((item) => ({ file: item.file, parsed: item.har })) });
      downloadBlob(blob, `bug-report-${slugify(report.title)}-${new Date().toISOString().slice(0, 10)}.zip`);
    } catch (err) {
      toast.error(err.message || "Unable to build the ZIP file.");
    } finally {
      setDownloading(false);
    }
  }

  function reset() {
    attachments.forEach((item) => item.previewUrl && URL.revokeObjectURL(item.previewUrl));
    setAttachments([]);
    setForm({ description: "", steps: "", expected: "" });
    setEnvironment((env) => ({ ...env, url: "", build: "" }));
    setReport(null);
    setTexts(null);
    setFrames([]);
    setJobId(null);
  }

  const generating = Boolean(preparing) || start.isPending || jobData?.status === "PENDING" || (jobId && !jobData);
  const busy = generating || Boolean(report);

  return (
    <>
      <p className="mb-2 text-sm text-slate-500">Tools / Bug report</p>
      <PageHeader
        title="Bug report generator"
        description="Describe the bug, attach screenshots, recordings or a HAR file, and get a Jira ticket and a Slack message ready to paste."
      />

      <div className="space-y-6">
        {report && texts && (
          <ResultView
            report={report}
            onChange={updateReport}
            texts={texts}
            onTextChange={(key, value) => setTexts((current) => ({ ...current, [key]: value }))}
            onDownload={download}
            downloading={downloading}
            onReset={reset}
          />
        )}

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
              disabled={busy}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField
                label="Steps you took (optional)"
                multiline
                value={form.steps}
                onChange={(event) => setForm({ ...form, steps: event.target.value })}
                placeholder={"One step per line\nOpen the cart\nClick Place order"}
                disabled={busy}
              />
              <TextField
                label="What you expected (optional)"
                multiline
                value={form.expected}
                onChange={(event) => setForm({ ...form, expected: event.target.value })}
                disabled={busy}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-4">
              <TextField
                label="Page / URL"
                value={environment.url}
                onChange={(event) => setEnvironment({ ...environment, url: event.target.value })}
                disabled={busy}
              />
              <TextField
                label="Browser"
                value={environment.browser}
                onChange={(event) => setEnvironment({ ...environment, browser: event.target.value })}
                disabled={busy}
              />
              <TextField
                label="Device / OS"
                value={environment.device}
                onChange={(event) => setEnvironment({ ...environment, device: event.target.value })}
                disabled={busy}
              />
              <TextField
                label="Build / version"
                value={environment.build}
                onChange={(event) => setEnvironment({ ...environment, build: event.target.value })}
                disabled={busy}
              />
            </div>
          </section>

          <AttachmentsStep
            attachments={attachments}
            onAdd={addFiles}
            onRemove={removeAttachment}
            disabled={busy}
            plan={plan}
          />

          {!report && (
            <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-5">
              <Button icon={Sparkles} loading={generating} onClick={generate}>
                Generate bug report
              </Button>
              <span role="status" className="text-xs text-slate-500">
                {preparing ??
                  (generating
                    ? "The AI is writing the report. This can take a few minutes…"
                    : "Title, root cause, Jira and Slack texts, and a ZIP with everything.")}
              </span>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
