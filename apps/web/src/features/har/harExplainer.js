// Explains a HAR file in plain language, for testers who need to tell their
// lead what the network shows. Rule-based (no AI): instant, the same every
// time, and it only states what is in the file.
import { describeStatus, formatBytes, formatMs, harSummaryMarkdown } from "./harParser.js";

// The HAR summary followed by the plain-language explanation, for downloads
// and bug report folders. parsed: { summary, entries }
export function harReportMarkdown(fileName, parsed) {
  return `${harSummaryMarkdown(fileName, parsed.summary)}\n\n${explanationMarkdown(explainHar(parsed.summary, parsed.entries))}`;
}

const OWNER = {
  backend: "Backend / API team",
  frontend: "Frontend team",
  auth: "Backend team (sign-in and permissions)",
  network: "Network / infrastructure (or the tester's connection)",
  thirdParty: "Not our app (a third-party service)",
  none: "Usually nobody: expected behaviour",
};

// What each status code means and where to look.
const STATUS_INFO = {
  400: {
    name: "Bad Request",
    meaning: "The server refused the request because something in it was wrong or missing (for example a required field, or a value in the wrong format).",
    cause: "The page sent data the API doesn't accept. Often a validation rule, or the frontend and backend disagreeing about the request format.",
    owner: "frontend",
    next: ["Compare the request body (Payload tab) with what the API expects.", "Read the error message in the Response tab: it usually names the field."],
  },
  401: {
    name: "Unauthorized",
    meaning: "The server doesn't know who is asking: the user is not signed in, or the session or token has expired.",
    cause: "An expired or missing session/token, or the request was sent without the sign-in header or cookie.",
    owner: "auth",
    next: ["Sign out and in again and retry.", "Check whether it happens after the page has been open a long time (expired session).", "Check that the request carries the Authorization header or session cookie."],
  },
  403: {
    name: "Forbidden",
    meaning: "The server knows who the user is but does not allow them to do this.",
    cause: "The account's role or permissions don't include this action, or the resource belongs to someone else.",
    owner: "auth",
    next: ["Try with an account that should have access (for example an admin).", "Confirm with the lead whether this user is supposed to be allowed."],
  },
  404: {
    name: "Not Found",
    meaning: "The address the page asked for doesn't exist on the server.",
    cause: "A wrong or outdated URL in the app, a missing file after a deploy, or a record that was deleted.",
    owner: "frontend",
    next: ["Check whether the URL is correct (typo, old version, wrong ID).", "If it's an API call, ask the backend whether the endpoint or record exists in this environment."],
  },
  405: {
    name: "Method Not Allowed",
    meaning: "The address exists, but not for this kind of request (for example POST where only GET is allowed).",
    cause: "The frontend uses the wrong HTTP method, or the endpoint changed.",
    owner: "frontend",
    next: ["Compare the method with the API documentation."],
  },
  408: {
    name: "Request Timeout",
    meaning: "The server gave up waiting for the request to arrive.",
    cause: "A slow or unstable connection, or a very large upload.",
    owner: "network",
    next: ["Retry on a stable connection.", "Check the size of what was being sent."],
  },
  409: {
    name: "Conflict",
    meaning: "The request clashes with the current state of the data (for example creating something that already exists, or editing an outdated copy).",
    cause: "A duplicate value, or two changes to the same record at the same time.",
    owner: "backend",
    next: ["Read the error message in the Response tab.", "Retry with fresh data (reload the page first)."],
  },
  413: {
    name: "Payload Too Large",
    meaning: "What was sent (usually an uploaded file) is bigger than the server accepts.",
    cause: "The file or request is over the server's size limit.",
    owner: "backend",
    next: ["Retry with a smaller file.", "Ask what the size limit is and whether the app should explain it to the user."],
  },
  415: {
    name: "Unsupported Media Type",
    meaning: "The server doesn't accept this type of content or file.",
    cause: "Wrong file type, or a missing/wrong Content-Type header.",
    owner: "frontend",
    next: ["Check the file type and the Content-Type header of the request."],
  },
  422: {
    name: "Unprocessable Content",
    meaning: "The request was understood, but the data failed the server's validation rules.",
    cause: "A business or validation rule rejected the input (for example an invalid date range).",
    owner: "frontend",
    next: ["Read the error message in the Response tab: it usually names the rule.", "Check whether the UI should have caught this before sending."],
  },
  429: {
    name: "Too Many Requests",
    meaning: "The server is limiting how often this can be called, and the limit was reached.",
    cause: "Too many requests in a short time (rate limiting), sometimes because the page repeats a call in a loop.",
    owner: "backend",
    next: ["Wait and retry.", "Check the table for the same request repeated many times (a frontend loop)."],
  },
  500: {
    name: "Internal Server Error",
    meaning: "The server hit an unexpected error while handling the request. The problem is on the server side, not in what the user did.",
    cause: "A bug or crash in the backend code, or a failing dependency (database, another service).",
    owner: "backend",
    next: ["Share the request URL, time and error message with the backend team so they can find it in the server logs.", "Check whether it happens every time or only with certain data."],
  },
  502: {
    name: "Bad Gateway",
    meaning: "A server in the middle (gateway or proxy) got an invalid answer from the service behind it.",
    cause: "The backend service is down, restarting or crashing.",
    owner: "backend",
    next: ["Retry after a minute.", "Ask whether a deploy or restart was happening at that time."],
  },
  503: {
    name: "Service Unavailable",
    meaning: "The server is temporarily unable to handle requests.",
    cause: "Maintenance, overload, or the service is starting up.",
    owner: "backend",
    next: ["Retry later.", "Ask whether the environment is under maintenance or overloaded."],
  },
  504: {
    name: "Gateway Timeout",
    meaning: "A gateway waited too long for the backend service to answer.",
    cause: "The backend is too slow for this request (slow query, slow dependency) or is stuck.",
    owner: "backend",
    next: ["Note how long the request took (Timing tab).", "Ask the backend team to check slow queries or dependencies for this endpoint."],
  },
};

function infoForStatus(status) {
  if (STATUS_INFO[status]) return STATUS_INFO[status];
  if (status >= 500) {
    return { ...STATUS_INFO[500], name: `Server error ${status}` };
  }
  return {
    name: `Client error ${status}`,
    meaning: "The server rejected the request (a 4xx code means the problem is in the request, the user's session or their permissions).",
    cause: "Something about the request was not accepted.",
    owner: "frontend",
    next: ["Read the error message in the Response tab."],
  };
}

// Requests that got no answer at all (status 0), by the browser's reason.
function infoForNetworkError(error = "") {
  const e = error.toUpperCase();
  if (e.includes("BLOCKED_BY_CLIENT")) {
    return {
      name: "Blocked by the browser",
      meaning: "The browser itself stopped this request, almost always an ad blocker or privacy extension.",
      cause: "A browser extension on the tester's computer.",
      owner: "none",
      next: ["Usually not a bug. Retry with extensions turned off (or in a private window) to be sure."],
      minor: true,
    };
  }
  if (e.includes("ABORTED") || e.includes("CANCELED") || e.includes("CANCELLED")) {
    return {
      name: "Cancelled",
      meaning: "The request was cancelled before it finished, usually because the user navigated away or the page replaced it with a newer request.",
      cause: "Normal page behaviour in most cases.",
      owner: "none",
      next: ["Only a problem if the page then shows missing data; otherwise it can be ignored."],
      minor: true,
    };
  }
  if (e.includes("NAME_NOT_RESOLVED")) {
    return {
      name: "Address not found (DNS)",
      meaning: "The browser couldn't find the server's address: the domain name didn't resolve.",
      cause: "A wrong domain in the app's settings, a DNS problem, or no internet/VPN.",
      owner: "network",
      next: ["Check the domain is correct for this environment.", "Check the VPN or internet connection."],
    };
  }
  if (e.includes("CONNECTION_REFUSED") || e.includes("CONNECTION_RESET") || e.includes("CONNECTION_CLOSED") || e.includes("EMPTY_RESPONSE")) {
    return {
      name: "Connection failed",
      meaning: "The browser reached the server's address but the connection was refused or dropped.",
      cause: "The service is down or restarting, or a firewall/VPN dropped the connection.",
      owner: "network",
      next: ["Retry.", "Ask whether the service was down or being deployed at that time."],
    };
  }
  if (e.includes("TIMED_OUT")) {
    return {
      name: "Timed out",
      meaning: "The browser waited too long and gave up; no answer arrived.",
      cause: "A very slow or unreachable server, or a poor connection.",
      owner: "network",
      next: ["Retry on a stable connection.", "Ask the backend team whether the service is slow."],
    };
  }
  if (e.includes("CERT") || e.includes("SSL")) {
    return {
      name: "Security certificate problem",
      meaning: "The browser refused the connection because the server's HTTPS certificate isn't valid.",
      cause: "An expired or misconfigured certificate in this environment.",
      owner: "network",
      next: ["Report it to whoever manages the environment (DevOps)."],
    };
  }
  if (e.includes("INTERNET_DISCONNECTED") || e.includes("NETWORK_CHANGED")) {
    return {
      name: "Connection lost",
      meaning: "The tester's internet connection dropped or changed during the request.",
      cause: "The tester's network.",
      owner: "network",
      next: ["Retry on a stable connection; it is likely not an app bug."],
      minor: true,
    };
  }
  return {
    name: "No response",
    meaning: "The request got no answer at all. Common reasons are a CORS rule blocking it, the server being unreachable, or the request being cancelled.",
    cause: "Often a CORS (cross-origin) configuration issue or an unreachable server.",
    owner: "network",
    next: ["Open the browser console while reproducing: a CORS error there points to the backend's CORS settings.", "Check whether the server was reachable at that time."],
  };
}

function mainHost(entries) {
  const doc = entries.find((entry) => entry.type === "document" && entry.host);
  if (doc) return doc.host;
  const counts = new Map();
  for (const entry of entries) if (entry.host) counts.set(entry.host, (counts.get(entry.host) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
}

// "app.example.com" and "api.example.com" belong to the same site.
function siteOf(host) {
  const parts = host.split(":")[0].split(".");
  return parts.slice(-2).join(".");
}

const isApi = (entry) => ["fetch", "xhr"].includes(entry.type) || /json/.test(entry.mimeType) || /\/api\//.test(entry.path);
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const endpoint = (entry) => entry.path.split("?")[0] || entry.url;

// Ranks a finding: lower is more important.
function rank(finding) {
  if (finding.minor) return 4;
  if (finding.thirdParty) return 3;
  if (finding.status >= 500) return 0;
  if (finding.status === 401 || finding.status === 403 || finding.status === 0) return 1;
  return finding.api ? 1.5 : 2;
}

export function explainHar(summary, entries) {
  const host = mainHost(entries);
  const site = host ? siteOf(host) : "";

  // Group repeats: same method, endpoint and outcome.
  const groups = new Map();
  for (const entry of summary.errors) {
    const key = [entry.method, entry.host, endpoint(entry), entry.status, entry.status ? "" : entry.networkError].join(" ");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  }

  const findings = [...groups.values()].map((requests) => {
    const first = requests[0];
    const info = first.status ? infoForStatus(first.status) : infoForNetworkError(first.networkError);
    const thirdParty = Boolean(site && first.host && siteOf(first.host) !== site);
    const api = isApi(first);
    const times = requests.length > 1 ? ` ${requests.length} times` : "";
    const outcome = first.status ? `${first.status} ${info.name}` : `no response (${info.name.toLowerCase()})`;
    return {
      id: `${first.id}`,
      status: first.status,
      title: `${first.method} ${endpoint(first)} → ${first.status ? `${first.status} ${info.name}` : info.name}`,
      what: `${first.method} ${endpoint(first)}${first.host ? ` on ${first.host}` : ""} failed${times} with ${outcome}${first.time ? `, after ${formatMs(first.time)}` : ""}.`,
      serverMessage: first.errorMessage ?? null,
      meaning: info.meaning,
      cause: thirdParty ? `${info.cause} This request goes to ${first.host}, which is not part of the app being tested.` : info.cause,
      owner: OWNER[thirdParty ? "thirdParty" : info.owner],
      next: info.next,
      minor: Boolean(info.minor),
      thirdParty,
      api,
      requests,
    };
  });
  findings.sort((a, b) => rank(a) - rank(b) || b.requests.length - a.requests.length);
  findings.forEach((finding) => {
    const r = rank(finding);
    finding.level = r <= 1 ? "high" : r < 3 ? "medium" : "low";
  });

  const serious = findings.filter((finding) => finding.level !== "low");
  const slow = entries.filter((entry) => !entry.failed && entry.time >= 1000).sort((a, b) => b.time - a.time);
  const verySlow = slow.filter((entry) => entry.time >= 3000);
  const largest = [...entries].filter((entry) => entry.size > 0).sort((a, b) => b.size - a.size).slice(0, 3);
  const { classCounts } = summary;

  // The verdict.
  let verdict;
  if (summary.total === 0) {
    verdict = {
      tone: "warning",
      headline: "This file has no requests in it.",
      text: "The recording was probably started after the page loaded, or stopped too early. Open DevTools → Network before reproducing the bug, keep it open, then export again.",
    };
  } else if (serious.length > 0) {
    const top = serious[0];
    verdict = {
      tone: "error",
      headline: `${plural(summary.failedCount, "request")} failed. The main problem: ${top.title}.`,
      text: `${top.meaning} ${top.owner === OWNER.none ? "" : `Most likely for: ${top.owner}.`}`.trim(),
    };
  } else if (findings.length > 0) {
    verdict = {
      tone: "warning",
      headline: `${plural(summary.failedCount, "request")} failed, but none of them look like a problem in the app.`,
      text: "They were blocked by the browser, cancelled, or went to third-party services. If the bug is still visible, the cause is probably in the page itself rather than the network.",
    };
  } else {
    verdict = {
      tone: "ok",
      headline: `All ${plural(summary.total, "request")} succeeded. No failed calls in this file.`,
      text: "Every call the page made got a normal answer from the server. If the bug still happened, the cause is most likely in the page itself (how it shows or handles the data) rather than the network.",
    };
  }

  // What the rest of the file shows, failures or not.
  const observations = [
    `${plural(summary.total, "request")} recorded over ${formatMs(summary.durationMs)}, ${formatBytes(summary.totalBytes)} transferred.`,
    `${classCounts["2xx"]} succeeded (2xx: the server answered normally).`,
  ];
  if (classCounts["3xx"]) {
    observations.push(`${plural(classCounts["3xx"], "redirect")} (3xx: the server sent the browser to another address; normal for sign-in flows and moved pages).`);
  }
  if (classCounts["4xx"]) observations.push(`${classCounts["4xx"]} rejected by the server (4xx: a problem with the request, the session or permissions).`);
  if (classCounts["5xx"]) observations.push(`${classCounts["5xx"]} server errors (5xx: something broke on the server side).`);
  if (classCounts.failed) observations.push(`${classCounts.failed} got no response at all (blocked, cancelled or unreachable).`);
  if (verySlow.length) {
    observations.push(
      `${plural(verySlow.length, "request")} took over 3 seconds, slowest ${verySlow[0].method} ${endpoint(verySlow[0])} (${formatMs(verySlow[0].time)}). Users notice delays like this; worth mentioning if the bug is about slowness or something "not loading".`,
    );
  } else if (slow.length) {
    observations.push(`${plural(slow.length, "request")} took over 1 second, slowest ${slow[0].method} ${endpoint(slow[0])} (${formatMs(slow[0].time)}).`);
  } else if (summary.total) {
    observations.push("No request took longer than 1 second: the network was fast.");
  }
  if (largest[0] && largest[0].size >= 1024 * 1024) {
    observations.push(`Largest download: ${endpoint(largest[0])} (${formatBytes(largest[0].size)}).`);
  }

  const nextSteps =
    serious.length > 0
      ? [
          "Attach this HAR (the redacted copy) to the ticket.",
          "Include the failing request, its status code and the server's message in the bug report.",
          "Note the exact time of the failure so the team can find it in the server logs.",
        ]
      : [
          "Check the browser console (DevTools → Console) for JavaScript errors while reproducing.",
          "Make sure the recording covers the moment the bug happens (start recording before the steps, and tick Preserve log if the page reloads).",
          "Attach screenshots or a screen recording that show what went wrong on screen.",
        ];

  return { verdict, findings, observations, nextSteps, mainHost: host, forLead: leadSummary({ summary, serious, findings, verySlow, slow }) };
}

// A short paragraph a tester can paste to their lead.
function leadSummary({ summary, serious, findings, verySlow, slow }) {
  const parts = [
    `I recorded the network traffic (HAR) while reproducing the issue: ${plural(summary.total, "request")} over ${formatMs(summary.durationMs)}.`,
  ];
  if (summary.total === 0) {
    return "The HAR file I recorded is empty, so I need to record it again with DevTools open before reproducing the issue.";
  }
  if (serious.length > 0) {
    const top = serious[0];
    const first = top.requests[0];
    parts.push(
      `${plural(summary.failedCount, "request")} failed. The main one is ${first.method} ${endpoint(first)}, which returned ${describeStatus(first)}${top.requests.length > 1 ? ` (${top.requests.length} times)` : ""}${top.serverMessage ? ` with the message "${top.serverMessage}"` : ""}.`,
      `${top.meaning} So this looks like it needs the ${top.owner.replace(/ \(.*\)$/, "")}.`,
    );
    const others = serious.slice(1, 3).map((finding) => finding.title);
    if (others.length) parts.push(`Other failures: ${others.join("; ")}.`);
  } else if (findings.length > 0) {
    parts.push(
      `${plural(summary.failedCount, "request")} failed, but they were blocked by the browser, cancelled or went to third-party services, so they don't point to a problem in our app.`,
      "The network looks fine, so the issue is probably in the frontend; I'll check the browser console next.",
    );
  } else {
    parts.push(
      "All requests succeeded; there are no failed calls.",
      "Since the server answered everything normally, the issue is probably in the frontend (how the page shows or handles the data); I'll check the browser console next.",
    );
  }
  if (verySlow.length) {
    parts.push(`Also, ${verySlow[0].method} ${endpoint(verySlow[0])} took ${formatMs(verySlow[0].time)}, which is slow.`);
  } else if (slow.length && serious.length === 0) {
    parts.push(`The slowest call was ${slow[0].method} ${endpoint(slow[0])} at ${formatMs(slow[0].time)}.`);
  }
  return parts.join(" ");
}

// The explanation as plain text (for the summary download).
export function explanationMarkdown(explanation) {
  const lines = ["## What happened", "", `**${explanation.verdict.headline}**`, "", explanation.verdict.text, ""];
  if (explanation.findings.length) {
    lines.push("### Problems found", "");
    for (const finding of explanation.findings) {
      lines.push(
        `#### ${finding.title}`,
        `- **What happened:** ${finding.what}`,
        ...(finding.serverMessage ? [`- **Server said:** "${finding.serverMessage}"`] : []),
        `- **What it means:** ${finding.meaning}`,
        `- **Likely cause:** ${finding.cause}`,
        `- **Who should look:** ${finding.owner}`,
        `- **Next:** ${finding.next.join(" ")}`,
        "",
      );
    }
  }
  lines.push("### What else the file shows", "", ...explanation.observations.map((line) => `- ${line}`), "");
  lines.push("### Next steps", "", ...explanation.nextSteps.map((line) => `- ${line}`), "");
  lines.push("### How to explain it to your lead", "", explanation.forLead, "");
  return lines.join("\n");
}
