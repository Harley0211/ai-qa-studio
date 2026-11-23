// Reads HAR files (HTTP Archive, exported from the browser's Network tab) in
// the browser, so the file never leaves the person's computer. Used by the
// HAR reader tool and by the bug report generator.

export const MAX_HAR_BYTES = 200 * 1024 * 1024;

const SENSITIVE_HEADERS = new Set([
  "authorization",
  "proxy-authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
  "api-key",
  "x-auth-token",
  "x-access-token",
  "x-csrf-token",
  "x-xsrf-token",
  "x-amz-security-token",
]);
const SENSITIVE_NAME = /pass(word)?|token|secret|api[-_]?key|session|auth|signature|^sig$|otp|pin$|cvv|card(number)?|ssn/i;
const JWT = /eyJ[\w-]{6,}\.[\w-]{6,}\.[\w-]{6,}/g;
const BEARER = /\b(Bearer|Basic)\s+[\w\-.~+/=]{8,}/gi;
export const REDACTED = "[REDACTED]";

const toLowerName = (item) => String(item?.name ?? "").toLowerCase();

// Hides tokens that appear inside free text (bodies, URLs).
export function redactText(text) {
  if (typeof text !== "string") return text;
  return text.replace(JWT, REDACTED).replace(BEARER, `$1 ${REDACTED}`);
}

export function redactUrl(url) {
  try {
    const parsed = new URL(url);
    for (const key of [...parsed.searchParams.keys()]) {
      if (SENSITIVE_NAME.test(key)) parsed.searchParams.set(key, REDACTED);
    }
    return redactText(parsed.toString());
  } catch {
    return redactText(url);
  }
}

// JSON bodies: hide values of sensitive fields; other text: hide tokens.
export function redactBody(text) {
  if (typeof text !== "string" || !text) return text;
  try {
    const walk = (value) => {
      if (Array.isArray(value)) return value.map(walk);
      if (value && typeof value === "object") {
        return Object.fromEntries(
          Object.entries(value).map(([key, inner]) => [
            key,
            SENSITIVE_NAME.test(key) && (typeof inner === "string" || typeof inner === "number")
              ? REDACTED
              : walk(inner),
          ]),
        );
      }
      return typeof value === "string" ? redactText(value) : value;
    };
    return JSON.stringify(walk(JSON.parse(text)));
  } catch {
    return redactText(text)
      .replace(/((?:^|[?&\s])(?:password|passwd|token|secret|otp|pin)=)[^&\s]*/gi, `$1${REDACTED}`);
  }
}

export function redactHeaders(headers) {
  return (headers ?? []).map((header) =>
    SENSITIVE_HEADERS.has(toLowerName(header)) || SENSITIVE_NAME.test(toLowerName(header))
      ? { ...header, value: REDACTED }
      : { ...header, value: redactText(header.value) },
  );
}

function redactParams(params) {
  return (params ?? []).map((param) =>
    SENSITIVE_NAME.test(toLowerName(param)) ? { ...param, value: REDACTED } : param,
  );
}

// A copy of the HAR that is safe to attach to a ticket: no cookies, auth
// headers, tokens or password-like fields.
export function redactHar(har) {
  const copy = structuredClone(har);
  for (const entry of copy?.log?.entries ?? []) {
    const { request = {}, response = {} } = entry;
    request.url = redactUrl(request.url);
    request.headers = redactHeaders(request.headers);
    request.cookies = [];
    request.queryString = redactParams(request.queryString);
    if (request.postData) {
      request.postData.text = redactBody(request.postData.text);
      if (request.postData.params) request.postData.params = redactParams(request.postData.params);
    }
    response.headers = redactHeaders(response.headers);
    response.cookies = [];
    if (response.content?.text && response.content.encoding !== "base64") {
      response.content.text = redactBody(response.content.text);
    }
  }
  return copy;
}

function decodeBody(content) {
  const text = content?.text;
  if (typeof text !== "string" || !text) return "";
  if (content.encoding === "base64") {
    if (!/json|text|xml|javascript|html/i.test(content.mimeType ?? "")) return "";
    try {
      const bytes = Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
      return new TextDecoder().decode(bytes);
    } catch {
      return "";
    }
  }
  return text;
}

// The message a failed API call sent back, from common JSON error shapes.
export function errorMessageFrom(body) {
  if (!body) return null;
  try {
    const json = JSON.parse(body);
    const candidates = [
      json?.error?.message,
      json?.message,
      typeof json?.error === "string" ? json.error : null,
      json?.detail,
      json?.title,
      json?.errors?.[0]?.message,
      json?.error_description,
    ];
    const found = candidates.find((value) => typeof value === "string" && value.trim());
    return found ? redactText(found.trim()).slice(0, 300) : null;
  } catch {
    const plain = body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    return plain ? redactText(plain).slice(0, 200) : null;
  }
}

function resourceType(entry, mimeType) {
  const known = entry._resourceType;
  if (typeof known === "string" && known) return known.toLowerCase();
  if (/json/.test(mimeType)) return "fetch";
  if (/javascript/.test(mimeType)) return "script";
  if (/css/.test(mimeType)) return "stylesheet";
  if (/html/.test(mimeType)) return "document";
  if (/image/.test(mimeType)) return "image";
  if (/font/.test(mimeType)) return "font";
  return "other";
}

export function statusClass(status) {
  if (!status) return "failed";
  return `${Math.floor(status / 100)}xx`;
}

function normalizeEntry(entry, index) {
  const request = entry.request ?? {};
  const response = entry.response ?? {};
  const mimeType = String(response.content?.mimeType ?? "").split(";")[0].trim();
  let host = "";
  let path = request.url ?? "";
  try {
    const parsed = new URL(request.url);
    host = parsed.host;
    path = `${parsed.pathname}${parsed.search}`;
  } catch {
    /* Not a full URL (data:, blob:): keep it as is. */
  }
  const status = Number(response.status) || 0;
  const startedAt = Date.parse(entry.startedDateTime);
  const body = decodeBody(response.content);
  const networkError = entry._error || response._error || (status === 0 ? response.statusText : "") || "";

  return {
    id: index,
    method: String(request.method ?? "GET").toUpperCase(),
    url: request.url ?? "",
    host,
    path,
    status,
    statusText: response.statusText ?? "",
    statusClass: statusClass(status),
    failed: status === 0 || status >= 400,
    networkError: networkError ? String(networkError) : "",
    mimeType,
    type: resourceType(entry, mimeType),
    startedAt: Number.isFinite(startedAt) ? startedAt : null,
    time: Math.max(0, Math.round(Number(entry.time) || 0)),
    size: Math.max(0, Number(response.content?.size) || Number(response.bodySize) || 0),
    serverIp: entry.serverIPAddress ?? "",
    timings: entry.timings ?? {},
    request: {
      headers: request.headers ?? [],
      queryString: request.queryString ?? [],
      postData: request.postData ?? null,
    },
    response: {
      headers: response.headers ?? [],
      body,
      redirectURL: response.redirectURL ?? "",
    },
    errorMessage: status >= 400 ? errorMessageFrom(body) : null,
  };
}

// Parses HAR text. Throws an Error with a readable message for a bad file.
export function parseHar(text) {
  let har;
  try {
    har = JSON.parse(text);
  } catch {
    throw new Error("This is not a valid HAR file (it is not JSON).");
  }
  const entries = har?.log?.entries;
  if (!Array.isArray(entries)) {
    throw new Error("This is not a valid HAR file (no log.entries list).");
  }

  const normalized = entries.map(normalizeEntry);
  return { har, entries: normalized, summary: summarizeHar(har, normalized) };
}

const severity = (entry) => (entry.status >= 500 ? 0 : entry.status === 0 ? 1 : 2);

export function summarizeHar(har, entries) {
  const statusCounts = {};
  let totalBytes = 0;
  let first = Infinity;
  let last = -Infinity;

  for (const entry of entries) {
    const key = entry.status ? String(entry.status) : "failed";
    statusCounts[key] = (statusCounts[key] ?? 0) + 1;
    totalBytes += entry.size;
    if (entry.startedAt != null) {
      first = Math.min(first, entry.startedAt);
      last = Math.max(last, entry.startedAt + entry.time);
    }
  }

  const errors = entries
    .filter((entry) => entry.failed)
    .sort((a, b) => severity(a) - severity(b) || (a.startedAt ?? 0) - (b.startedAt ?? 0));

  const classCounts = { "2xx": 0, "3xx": 0, "4xx": 0, "5xx": 0, failed: 0 };
  for (const entry of entries) {
    if (entry.statusClass in classCounts) classCounts[entry.statusClass] += 1;
  }

  const pages = (har?.log?.pages ?? []).map((page) => ({
    title: page.title ?? "",
    startedAt: page.startedDateTime ?? null,
  }));

  return {
    creator: [har?.log?.creator?.name, har?.log?.creator?.version].filter(Boolean).join(" "),
    browser: [har?.log?.browser?.name, har?.log?.browser?.version].filter(Boolean).join(" "),
    pages,
    total: entries.length,
    failedCount: errors.length,
    classCounts,
    statusCounts,
    totalBytes,
    durationMs: Number.isFinite(first) ? Math.round(last - first) : 0,
    capturedAt: Number.isFinite(first) ? new Date(first).toISOString() : null,
    errors,
    slowest: [...entries].sort((a, b) => b.time - a.time).slice(0, 5),
  };
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatMs(ms) {
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${ms} ms`;
}

export function describeStatus(entry) {
  if (entry.status) return `${entry.status}${entry.statusText ? ` ${entry.statusText}` : ""}`;
  return entry.networkError ? `Failed (${entry.networkError})` : "Failed (no response)";
}

const shortUrl = (entry) => redactUrl(entry.url).slice(0, 160);

// One line per failed request, for the AI, the ticket and Slack.
export function errorLines(summary, limit = 15) {
  return summary.errors.slice(0, limit).map((entry) => {
    const message = entry.errorMessage ? ` - "${entry.errorMessage}"` : "";
    return `${entry.method} ${shortUrl(entry)} -> ${describeStatus(entry)} (${formatMs(entry.time)})${message}`;
  });
}

// Compact facts from the HAR for the AI: exact numbers, no secrets.
export function harFactsForAi(fileName, summary) {
  const { classCounts } = summary;
  const lines = [
    `HAR file "${fileName}": ${summary.total} requests over ${formatMs(summary.durationMs)}; ` +
      `${classCounts["2xx"]} OK (2xx), ${classCounts["3xx"]} redirects, ${classCounts["4xx"]} client errors (4xx), ` +
      `${classCounts["5xx"]} server errors (5xx), ${classCounts.failed} failed with no response.`,
  ];
  const errors = errorLines(summary);
  if (errors.length > 0) {
    lines.push("Failed requests (most serious first):", ...errors.map((line) => `- ${line}`));
    if (summary.errors.length > errors.length) {
      lines.push(`- ...and ${summary.errors.length - errors.length} more failed requests`);
    }
  } else {
    lines.push("No failed requests.");
  }
  const slow = summary.slowest.filter((entry) => entry.time >= 1000).slice(0, 3);
  if (slow.length > 0) {
    lines.push(
      "Slowest requests:",
      ...slow.map((entry) => `- ${entry.method} ${shortUrl(entry)} -> ${describeStatus(entry)} took ${formatMs(entry.time)}`),
    );
  }
  return lines.join("\n");
}

// A readable Markdown report of the HAR, for the ZIP download.
export function harSummaryMarkdown(fileName, summary) {
  const { classCounts } = summary;
  const rows = Object.entries(summary.statusCounts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([status, count]) => `| ${status} | ${count} |`);
  const lines = [
    `# HAR summary: ${fileName}`,
    "",
    summary.capturedAt ? `Captured: ${summary.capturedAt}` : null,
    summary.creator ? `Exported by: ${summary.creator}` : null,
    `Requests: ${summary.total} · Failed: ${summary.failedCount} · Duration: ${formatMs(summary.durationMs)} · Transferred: ${formatBytes(summary.totalBytes)}`,
    "",
    `2xx: ${classCounts["2xx"]} · 3xx: ${classCounts["3xx"]} · 4xx: ${classCounts["4xx"]} · 5xx: ${classCounts["5xx"]} · No response: ${classCounts.failed}`,
    "",
    "## Status codes",
    "",
    "| Status | Requests |",
    "|---|---|",
    ...rows,
    "",
    "## Failed requests",
    "",
    ...(summary.errors.length
      ? errorLines(summary, 100).map((line) => `- ${line}`)
      : ["None."]),
    "",
    "## Slowest requests",
    "",
    ...summary.slowest.map(
      (entry) => `- ${entry.method} ${shortUrl(entry)} -> ${describeStatus(entry)} took ${formatMs(entry.time)}`,
    ),
    "",
    "_Cookies, authorization headers and token-like values are redacted._",
  ];
  return lines.filter((line) => line !== null).join("\n");
}

export async function readHarFile(file) {
  if (file.size > MAX_HAR_BYTES) {
    throw new Error(`${file.name} is larger than ${formatBytes(MAX_HAR_BYTES)}.`);
  }
  return parseHar(await readText(file));
}

// Blob.text() with a fallback for browsers (and test DOMs) without it.
function readText(file) {
  if (typeof file.text === "function") return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error(`Unable to read ${file.name}.`));
    reader.readAsText(file);
  });
}
