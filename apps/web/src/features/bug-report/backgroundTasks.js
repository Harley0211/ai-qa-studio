import { useSyncExternalStore } from "react";
import { api } from "../../lib/apiClient.js";
import { harReportMarkdown } from "../har/harExplainer.js";
import { harFactsForAi, redactHar, redactUrl } from "../har/harParser.js";
import { MAX_AI_IMAGES, frameName, framePlan } from "./attachments.js";
import { extractFrames, formatTimestamp } from "./videoFrames.js";
import { bugReportsUrl } from "./hooks.js";

// Work that keeps going while the person moves around the app: preparing and
// uploading a bug report, then waiting for the AI. It lives outside React, so
// leaving the bug report page doesn't stop it (only reloading or closing the
// tab would, and by then the server already has the report and finishes it).

const POLL_MS = 3000;
const MAX_HAR_FACTS = 12000;
let tasks = [];
const listeners = new Set();
const finishedListeners = new Set();
let nextTaskId = 1;

function emit() {
  for (const listener of listeners) listener();
}

function update(id, changes) {
  tasks = tasks.map((task) => (task.id === id ? { ...task, ...changes } : task));
  emit();
}

export function getTasks() {
  return tasks;
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Called with the task when a report finishes (or fails), wherever the
// person is in the app.
export function onTaskFinished(listener) {
  finishedListeners.add(listener);
  return () => finishedListeners.delete(listener);
}

export function dismissTask(id) {
  tasks = tasks.filter((task) => task.id !== id);
  emit();
}

export function useBackgroundTasks() {
  return useSyncExternalStore(subscribe, getTasks, getTasks);
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// The failed requests, as stored with the report (already redacted).
function harErrorsOf(hars) {
  return hars.flatMap((item) =>
    item.har.summary.errors.slice(0, 50).map((entry) => ({
      file: item.file.name,
      entry: {
        method: entry.method,
        url: redactUrl(entry.url),
        status: entry.status,
        statusText: entry.statusText ?? "",
        networkError: entry.networkError ?? "",
        time: entry.time,
        errorMessage: entry.errorMessage ?? null,
      },
    })),
  ).slice(0, 100);
}

async function uploadFile(projectId, reportId, kind, blob, name) {
  const form = new FormData();
  form.append("kind", kind);
  form.append("file", blob, name);
  return api.upload(`${bugReportsUrl(projectId)}/${encodeURIComponent(reportId)}/files`, form);
}

// project: { id, name } (the report is saved in that project)
// form: { description, steps, expected }, environment, attachments: [{ file, kind, har? }]
export function startBugReportTask({ project, form, environment, attachments, onReportCreated, maxFileBytes }) {
  const projectId = project.id;
  const task = {
    id: nextTaskId++,
    projectId,
    projectName: project.name,
    label: form.description.trim().slice(0, 80),
    phase: "preparing",
    message: "Preparing…",
    reportId: null,
    warnings: [],
    startedAt: Date.now(),
  };
  tasks = [task, ...tasks];
  emit();

  const finish = (changes) => {
    update(task.id, changes);
    const done = tasks.find((t) => t.id === task.id);
    for (const listener of finishedListeners) listener(done);
  };
  const warn = (text) => update(task.id, { warnings: [...(tasks.find((t) => t.id === task.id)?.warnings ?? []), text] });

  (async () => {
    const images = [];
    const imageNotes = [];
    const imageKinds = [];
    const counts = attachments.reduce((acc, item) => ({ ...acc, [item.kind]: (acc[item.kind] ?? 0) + 1 }), {});
    const plan = framePlan(counts.image ?? 0, counts.video ?? 0);
    const screenshots = attachments.filter((item) => item.kind === "image");
    const videos = attachments.filter((item) => item.kind === "video");
    const hars = attachments.filter((item) => item.kind === "har" && item.har);

    for (const item of screenshots.slice(0, plan.screenshots)) {
      images.push({ blob: item.file, name: item.file.name });
      imageNotes.push(`Screenshot ${item.file.name}`);
      imageKinds.push("image");
    }
    for (const [index, item] of videos.slice(0, plan.videosWithFrames ?? 0).entries()) {
      update(task.id, { message: `Reading frames from video ${index + 1} of ${videos.length}…` });
      try {
        const frames = await extractFrames(item.file, { count: plan.perVideo });
        frames.forEach((frame, i) => {
          const name = frameName(item.file.name, frame.time, i);
          images.push({ blob: frame.blob, name });
          imageNotes.push(`Frame ${i + 1} of video ${item.file.name} at ${formatTimestamp(frame.time)}`);
          imageKinds.push("frame");
        });
      } catch (error) {
        warn(error.message);
      }
    }

    update(task.id, { phase: "uploading", message: "Sending to the AI…" });
    const harFacts = hars.map((item) => harFactsForAi(item.file.name, item.har.summary)).join("\n\n").slice(0, MAX_HAR_FACTS);
    const body = new FormData();
    body.append(
      "details",
      JSON.stringify({
        ...form,
        environment,
        harFacts,
        imageNotes: imageNotes.slice(0, MAX_AI_IMAGES),
        imageKinds: imageKinds.slice(0, MAX_AI_IMAGES),
        attachments: attachments.map((item) => ({ name: item.file.name, kind: item.kind })),
        harErrors: harErrorsOf(hars),
      }),
    );
    images.slice(0, MAX_AI_IMAGES).forEach(({ blob, name }) => body.append("images", blob, name));

    const created = await api.upload(bugReportsUrl(projectId), body);
    const reportId = created.data.id;
    update(task.id, { reportId });
    onReportCreated?.(reportId);

    // The rest of the folder: videos, extra screenshots, HAR copies.
    const extras = [
      ...screenshots.slice(plan.screenshots).map((item) => ["image", item.file, item.file.name]),
      ...videos.map((item) => ["video", item.file, item.file.name]),
      ...hars.flatMap((item) => {
        const base = item.file.name.replace(/\.har$/i, "");
        return [
          ["har", new Blob([JSON.stringify(redactHar(item.har.har))], { type: "application/json" }), `${base}-redacted.har`],
          ["har-summary", new Blob([harReportMarkdown(item.file.name, item.har)], { type: "text/markdown" }), `${base}-summary.md`],
        ];
      }),
    ];
    for (const [index, [kind, blob, name]] of extras.entries()) {
      update(task.id, { message: `Saving files ${index + 1} of ${extras.length}…` });
      if (maxFileBytes && blob.size > maxFileBytes) {
        warn(`${name} is too large to save (${Math.round(blob.size / 1048576)} MB); it was left out of the folder.`);
        continue;
      }
      try {
        await uploadFile(projectId, reportId, kind, blob, name);
      } catch (error) {
        warn(`${name} couldn't be saved: ${error.message}`);
      }
    }

    update(task.id, { phase: "generating", message: "The AI is writing the report…" });
    for (;;) {
      let report;
      try {
        report = (await api.get(`${bugReportsUrl(projectId)}/${encodeURIComponent(reportId)}`)).data;
      } catch (error) {
        if (error.status === 404) {
          finish({ phase: "failed", message: "The bug report was deleted." });
          return;
        }
        await wait(POLL_MS);
        continue;
      }
      if (report.status === "SUCCEEDED") {
        finish({ phase: "done", message: "Bug report ready.", title: report.title });
        return;
      }
      if (report.status === "FAILED") {
        finish({ phase: "failed", message: report.error || "Unable to generate the bug report." });
        return;
      }
      await wait(POLL_MS);
    }
  })().catch((error) => {
    finish({ phase: "failed", message: error.message || "Unable to start the bug report." });
  });

  return task.id;
}

// On sign-out (the list belongs to the person signing out), and in tests.
export function resetTasks() {
  tasks = [];
  emit();
}
