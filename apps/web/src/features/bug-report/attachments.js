import { formatBytes } from "../har/harParser.js";
import { createZip } from "../../lib/zip.js";
import { formatTimestamp } from "./videoFrames.js";

export const MAX_AI_IMAGES = 12; // matches the server
export const MAX_SCREENSHOTS_WITH_VIDEO = 8;
export const MAX_FRAMES_PER_VIDEO = 4;
// Largest file saved in a folder (matches the server's MAX_SAVED_FILE_MB; the
// public link refuses uploads over 100 MB).
export const MAX_SAVED_FILE_BYTES = 95 * 1024 * 1024;
export const LIMITS = {
  image: 5 * 1024 * 1024,
  video: MAX_SAVED_FILE_BYTES,
  har: 200 * 1024 * 1024,
};

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
const VIDEO_EXT = /\.(mp4|webm|mov|m4v|mkv|ogv)$/i;

export function attachmentKind(file) {
  const name = file.name ?? "";
  if (/\.har$/i.test(name)) return "har";
  if (IMAGE_TYPES.includes(file.type) || /\.(png|jpe?g|webp)$/i.test(name)) return "image";
  if (String(file.type).startsWith("video/") || VIDEO_EXT.test(name)) return "video";
  return null;
}

// null when the file can be attached, otherwise why not.
export function attachmentProblem(file) {
  const kind = attachmentKind(file);
  if (!kind) return `${file.name}: only images (PNG, JPG, WEBP), videos and .har files can be attached.`;
  if (file.size > LIMITS[kind]) return `${file.name} is larger than ${formatBytes(LIMITS[kind])}.`;
  return null;
}

// How many frames to take from each video, so screenshots plus frames stay
// within what the AI model is sent.
export function framePlan(imageCount, videoCount) {
  if (videoCount === 0) return { screenshots: Math.min(imageCount, MAX_AI_IMAGES), perVideo: 0 };
  const screenshots = Math.min(imageCount, MAX_SCREENSHOTS_WITH_VIDEO);
  const budget = MAX_AI_IMAGES - screenshots;
  return {
    screenshots,
    perVideo: Math.max(1, Math.min(MAX_FRAMES_PER_VIDEO, Math.floor(budget / videoCount))),
    videosWithFrames: Math.min(videoCount, budget),
  };
}

export function frameName(videoName, time, index) {
  const base = videoName.replace(/\.[^.]+$/, "");
  return `${base}-frame-${index + 1}-${formatTimestamp(time).replace(":", "m")}s.jpg`;
}

const safeName = (name) => name.replace(/[\\/:*?"<>|]+/g, "_");
const FOLDER_FOR_KIND = { image: "attachments", video: "attachments", frame: "video-frames", har: "har", "har-summary": "har" };

// The ZIP to attach to Jira: the texts plus everything in the report's folder
// (screenshots, videos, video frames, redacted HAR copies and summaries).
// files: [{ name, kind, blob }]
export async function buildBugReportZip({ report, texts, files }) {
  return createZip([
    { name: "jira-description.md", data: texts.jiraMarkdown },
    { name: "jira-description-wiki.txt", data: texts.jiraWiki },
    { name: "slack-message.txt", data: texts.slack },
    { name: "jira-title.txt", data: report.title },
    { name: "report.json", data: JSON.stringify(report, null, 2) },
    ...files.map((file) => ({ name: `${FOLDER_FOR_KIND[file.kind] ?? "files"}/${safeName(file.name)}`, data: file.blob })),
  ]);
}
