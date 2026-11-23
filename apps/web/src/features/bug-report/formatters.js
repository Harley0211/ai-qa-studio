// Turns the generated bug report into ready-to-paste text for Jira and Slack.
// Network errors come straight from the HAR files (exact), not from the AI.
import { describeStatus, formatMs, redactUrl } from "../har/harParser.js";

// Jira priority that usually goes with each severity.
export const PRIORITY_FOR_SEVERITY = {
  Blocker: "Highest",
  Critical: "High",
  Major: "Medium",
  Minor: "Low",
  Trivial: "Lowest",
};

const SLACK_SEVERITY = {
  Blocker: ":red_circle:",
  Critical: ":red_circle:",
  Major: ":large_orange_circle:",
  Minor: ":large_yellow_circle:",
  Trivial: ":white_circle:",
};

// context: { environment, attachments: [{ name, kind }], harErrors: [{ file, entry }] }
function environmentLines(environment = {}) {
  return [
    ["Page / URL", environment.url],
    ["Browser", environment.browser],
    ["Device / OS", environment.device],
    ["Build / version", environment.build],
  ].filter(([, value]) => value && value.trim());
}

function attachmentNames(attachments = []) {
  return attachments.map(({ name, kind }) => (kind === "har" ? `${name} (redacted copy)` : name));
}

const networkUrl = (entry) => {
  const url = redactUrl(entry.url);
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}`.slice(0, 120);
  } catch {
    return url.slice(0, 120);
  }
};

const MAX_NETWORK_ROWS = 10;

export function jiraMarkdown(report, context = {}) {
  const env = environmentLines(context.environment);
  const errors = (context.harErrors ?? []).slice(0, MAX_NETWORK_ROWS);
  const files = attachmentNames(context.attachments);
  const escapeCell = (value) => String(value ?? "").replace(/\|/g, "\\|").replace(/\s+/g, " ");

  const lines = [
    "## Summary",
    report.summary,
    "",
    `**Severity:** ${report.severity} · **Suggested priority:** ${PRIORITY_FOR_SEVERITY[report.severity] ?? "Medium"}${report.affectedArea ? ` · **Area:** ${report.affectedArea}` : ""}`,
    "",
    "## Steps to reproduce",
    ...report.stepsToReproduce.map((step, i) => `${i + 1}. ${step}`),
    "",
    "## Expected result",
    report.expectedResult,
    "",
    "## Actual result",
    report.actualResult,
    "",
    "## Root cause analysis",
    report.rootCause,
  ];

  if (errors.length) {
    lines.push(
      "",
      "## Network errors (from HAR)",
      "| Method | Endpoint | Status | Time | Message |",
      "|---|---|---|---|---|",
      ...errors.map(
        ({ entry }) =>
          `| ${entry.method} | \`${escapeCell(networkUrl(entry))}\` | ${escapeCell(describeStatus(entry))} | ${formatMs(entry.time)} | ${escapeCell(entry.errorMessage ?? "")} |`,
      ),
    );
    if ((context.harErrors ?? []).length > errors.length) {
      lines.push("", `_…and ${context.harErrors.length - errors.length} more failed requests (see the HAR summary)._`);
    }
  }
  if (env.length) lines.push("", "## Environment", ...env.map(([label, value]) => `- **${label}:** ${value}`));
  if (files.length) lines.push("", "## Attachments", ...files.map((name) => `- ${name}`));

  return lines.join("\n");
}

// Jira Server / Data Center (wiki markup).
export function jiraWiki(report, context = {}) {
  const env = environmentLines(context.environment);
  const errors = (context.harErrors ?? []).slice(0, MAX_NETWORK_ROWS);
  const files = attachmentNames(context.attachments);
  const cell = (value) => String(value ?? "").replace(/\|/g, "/").replace(/\s+/g, " ") || " ";

  const lines = [
    "h2. Summary",
    report.summary,
    "",
    `*Severity:* ${report.severity} | *Suggested priority:* ${PRIORITY_FOR_SEVERITY[report.severity] ?? "Medium"}${report.affectedArea ? ` | *Area:* ${report.affectedArea}` : ""}`,
    "",
    "h2. Steps to reproduce",
    ...report.stepsToReproduce.map((step) => `# ${step}`),
    "",
    "h2. Expected result",
    report.expectedResult,
    "",
    "h2. Actual result",
    report.actualResult,
    "",
    "h2. Root cause analysis",
    report.rootCause,
  ];

  if (errors.length) {
    lines.push(
      "",
      "h2. Network errors (from HAR)",
      "||Method||Endpoint||Status||Time||Message||",
      ...errors.map(
        ({ entry }) =>
          `|${entry.method}|{{${cell(networkUrl(entry))}}}|${cell(describeStatus(entry))}|${formatMs(entry.time)}|${cell(entry.errorMessage)}|`,
      ),
    );
  }
  if (env.length) lines.push("", "h2. Environment", ...env.map(([label, value]) => `* *${label}:* ${value}`));
  if (files.length) lines.push("", "h2. Attachments", ...files.map((name) => `* [^${name}]`));

  return lines.join("\n");
}

export function slackMessage(report, context = {}) {
  const env = environmentLines(context.environment);
  const errors = (context.harErrors ?? []).slice(0, 5);
  const files = attachmentNames(context.attachments);

  const lines = [
    "Hi team,",
    "",
    `:bug: *${report.title}*`,
    `${SLACK_SEVERITY[report.severity] ?? ""} *Severity:* ${report.severity}${report.affectedArea ? `  |  *Area:* ${report.affectedArea}` : ""}`.trim(),
    "",
    report.summary,
    "",
    "*Steps to reproduce*",
    ...report.stepsToReproduce.map((step, i) => `${i + 1}. ${step}`),
    "",
    `*Expected:* ${report.expectedResult}`,
    `*Actual:* ${report.actualResult}`,
    "",
    `*Likely root cause:* ${report.rootCause}`,
  ];

  if (errors.length) {
    lines.push(
      "",
      "*Network errors (from HAR)*",
      ...errors.map(
        ({ entry }) =>
          `• \`${entry.method} ${networkUrl(entry)}\` → ${describeStatus(entry)}${entry.errorMessage ? ` – "${entry.errorMessage}"` : ""}`,
      ),
    );
    if ((context.harErrors ?? []).length > errors.length) {
      lines.push(`• …and ${context.harErrors.length - errors.length} more`);
    }
  }
  if (env.length) lines.push("", `*Environment:* ${env.map(([label, value]) => `${label}: ${value}`).join("  |  ")}`);
  if (files.length) lines.push("", `:paperclip: *Attachments:* ${files.join(", ")}`);

  return lines.join("\n");
}

export function slugify(text) {
  return (
    String(text ?? "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "bug-report"
  );
}
