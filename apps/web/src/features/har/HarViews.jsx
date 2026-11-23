import { AlertTriangle, CheckCircle2, Clock3, Network } from "lucide-react";
import { useMemo, useState } from "react";
import {
  REDACTED,
  describeStatus,
  formatBytes,
  formatMs,
  redactBody,
  redactHeaders,
  redactUrl,
} from "./harParser.js";

const CLASS_STYLES = {
  "2xx": "bg-emerald-100 text-emerald-800",
  "3xx": "bg-sky-100 text-sky-800",
  "4xx": "bg-amber-100 text-amber-800",
  "5xx": "bg-red-100 text-red-800",
  failed: "bg-red-100 text-red-800",
  "1xx": "bg-slate-100 text-slate-700",
};

export function StatusBadge({ entry }) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${CLASS_STYLES[entry.statusClass] ?? CLASS_STYLES["1xx"]}`}
      title={describeStatus(entry)}
    >
      {entry.status || "ERR"}
    </span>
  );
}

function Stat({ icon: Icon, label, value, tone = "text-slate-900" }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        {label}
      </p>
      <p className={`mt-1 text-xl font-semibold tabular-nums ${tone}`}>{value}</p>
    </div>
  );
}

// Totals, status code mix and the verdict ("3 failed requests").
export function HarSummary({ summary }) {
  const { classCounts } = summary;
  return (
    <section aria-label="HAR summary" className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat icon={Network} label="Requests" value={summary.total} />
        <Stat
          icon={summary.failedCount ? AlertTriangle : CheckCircle2}
          label="Failed"
          value={summary.failedCount}
          tone={summary.failedCount ? "text-red-600" : "text-emerald-600"}
        />
        <Stat icon={Clock3} label="Duration" value={formatMs(summary.durationMs)} />
        <Stat icon={Network} label="Transferred" value={formatBytes(summary.totalBytes)} />
      </div>
      <div className="flex flex-wrap gap-2 text-xs">
        {Object.entries(classCounts).map(([key, count]) => (
          <span key={key} className={`rounded-full px-2.5 py-1 font-semibold ${CLASS_STYLES[key]}`}>
            {key === "failed" ? "No response" : key}: {count}
          </span>
        ))}
        {summary.creator && <span className="px-1 py-1 text-slate-500">Exported by {summary.creator}</span>}
      </div>
    </section>
  );
}

// The failed requests, most serious first, with the message the server sent.
export function HarErrors({ summary, onSelect, limit = 50 }) {
  if (summary.errors.length === 0) {
    return (
      <p className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900">
        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
        No failed requests in this file.
      </p>
    );
  }

  return (
    <section aria-label="Failed requests" className="rounded-xl border border-red-200 bg-white">
      <h3 className="border-b border-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-900">
        {summary.errors.length} failed {summary.errors.length === 1 ? "request" : "requests"}
      </h3>
      <ul className="divide-y divide-slate-100">
        {summary.errors.slice(0, limit).map((entry) => (
          <li key={entry.id}>
            <button
              type="button"
              disabled={!onSelect}
              onClick={() => onSelect?.(entry)}
              className="flex w-full items-start gap-3 px-4 py-2.5 text-left hover:bg-slate-50 disabled:cursor-default disabled:hover:bg-transparent"
            >
              <StatusBadge entry={entry} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-mono text-xs text-slate-800">
                  {entry.method} {entry.path}
                </span>
                <span className="block text-xs text-slate-500">
                  {describeStatus(entry)} · {entry.host} · {formatMs(entry.time)}
                </span>
                {entry.errorMessage && (
                  <span className="mt-0.5 block text-xs font-medium text-red-700">“{entry.errorMessage}”</span>
                )}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {summary.errors.length > limit && (
        <p className="px-4 py-2 text-xs text-slate-500">…and {summary.errors.length - limit} more.</p>
      )}
    </section>
  );
}

const FILTERS = [
  ["all", "All"],
  ["errors", "Errors"],
  ["2xx", "2xx"],
  ["3xx", "3xx"],
  ["4xx", "4xx"],
  ["5xx", "5xx"],
];
const PAGE = 300;

// Every request, filterable by status and searchable by URL.
export function HarTable({ entries, selectedId, onSelect }) {
  const [filter, setFilter] = useState("all");
  const [type, setType] = useState("all");
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(PAGE);
  const types = useMemo(() => [...new Set(entries.map((entry) => entry.type))].sort(), [entries]);
  const maxTime = useMemo(() => Math.max(1, ...entries.map((entry) => entry.time)), [entries]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return entries.filter(
      (entry) =>
        (filter === "all" ||
          (filter === "errors" ? entry.failed : entry.statusClass === filter)) &&
        (type === "all" || entry.type === type) &&
        (!needle || entry.url.toLowerCase().includes(needle) || entry.method.toLowerCase() === needle),
    );
  }, [entries, filter, type, query]);

  return (
    <section aria-label="Requests" className="rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3">
        <div role="group" aria-label="Status filter" className="flex flex-wrap gap-1">
          {FILTERS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={filter === key}
              onClick={() => {
                setFilter(key);
                setShown(PAGE);
              }}
              className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${
                filter === key ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <select
          aria-label="Type"
          value={type}
          onChange={(event) => setType(event.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
        >
          <option value="all">All types</option>
          {types.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        <input
          type="search"
          aria-label="Search URL"
          placeholder="Search URL or method…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="min-w-40 flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-800"
        />
        <span className="text-xs text-slate-500">
          {visible.length} of {entries.length}
        </span>
      </div>
      <div className="max-h-[32rem] overflow-auto">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-white text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Method</th>
              <th className="px-3 py-2 font-medium">URL</th>
              <th className="px-3 py-2 font-medium">Type</th>
              <th className="px-3 py-2 text-right font-medium">Size</th>
              <th className="w-40 px-3 py-2 font-medium">Time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {visible.slice(0, shown).map((entry) => (
              <tr
                key={entry.id}
                onClick={() => onSelect(entry)}
                aria-selected={entry.id === selectedId}
                className={`cursor-pointer ${entry.id === selectedId ? "bg-indigo-50" : entry.failed ? "bg-red-50/40 hover:bg-red-50" : "hover:bg-slate-50"}`}
              >
                <td className="px-3 py-1.5">
                  <StatusBadge entry={entry} />
                </td>
                <td className="px-3 py-1.5 font-mono text-slate-700">{entry.method}</td>
                <td className="max-w-md px-3 py-1.5">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelect(entry);
                    }}
                    className="block w-full truncate text-left font-mono text-slate-800 hover:text-indigo-700"
                    title={entry.url}
                  >
                    {entry.path || entry.url}
                  </button>
                  <span className="block truncate text-slate-400">{entry.host}</span>
                </td>
                <td className="px-3 py-1.5 text-slate-600">{entry.type}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-slate-600">{formatBytes(entry.size)}</td>
                <td className="px-3 py-1.5">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 flex-1 rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full ${entry.failed ? "bg-red-500" : "bg-indigo-500"}`}
                        style={{ width: `${Math.max(2, (entry.time / maxTime) * 100)}%` }}
                      />
                    </div>
                    <span className="w-14 text-right tabular-nums text-slate-600">{formatMs(entry.time)}</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {visible.length > shown && (
          <button
            type="button"
            onClick={() => setShown((value) => value + PAGE)}
            className="w-full py-2 text-xs font-medium text-indigo-600 hover:underline"
          >
            Show {Math.min(PAGE, visible.length - shown)} more
          </button>
        )}
        {visible.length === 0 && <p className="px-3 py-6 text-center text-sm text-slate-500">No matching requests.</p>}
      </div>
    </section>
  );
}

function HeaderList({ headers }) {
  if (!headers.length) return <p className="text-xs text-slate-500">None.</p>;
  return (
    <dl className="grid grid-cols-[minmax(8rem,auto)_1fr] gap-x-3 gap-y-1 font-mono text-xs">
      {headers.map((header, index) => (
        <div key={`${header.name}-${index}`} className="contents">
          <dt className="text-slate-500">{header.name}</dt>
          <dd className={`break-all ${header.value === REDACTED ? "text-amber-700" : "text-slate-800"}`}>{header.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function pretty(text) {
  if (!text) return "";
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

function Body({ text }) {
  if (!text) return <p className="text-xs text-slate-500">No body.</p>;
  const shown = pretty(text);
  return (
    <pre className="max-h-80 overflow-auto rounded-lg bg-slate-100 p-3 font-mono text-xs whitespace-pre-wrap break-all text-slate-800">
      {shown.length > 50_000 ? `${shown.slice(0, 50_000)}\n… (cut at 50,000 characters)` : shown}
    </pre>
  );
}

const TABS = ["Headers", "Payload", "Response", "Timing"];

// One request in full. Secrets are hidden unless the person shows them.
export function HarEntryDetail({ entry, onClose }) {
  const [tab, setTab] = useState("Headers");
  const [hideSecrets, setHideSecrets] = useState(true);
  const mask = (headers) => (hideSecrets ? redactHeaders(headers) : headers);
  const body = (text) => (hideSecrets ? redactBody(text) : text);
  const timings = Object.entries(entry.timings ?? {}).filter(
    ([key, value]) => typeof value === "number" && value >= 0 && !key.startsWith("_"),
  );

  return (
    <section aria-label="Request details" className="rounded-xl border border-indigo-200 bg-white">
      <header className="flex flex-wrap items-start gap-3 border-b border-slate-100 px-4 py-3">
        <StatusBadge entry={entry} />
        <div className="min-w-0 flex-1">
          <p className="break-all font-mono text-xs text-slate-900">
            {entry.method} {hideSecrets ? redactUrl(entry.url) : entry.url}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            {describeStatus(entry)} · {formatMs(entry.time)} · {formatBytes(entry.size)}
            {entry.serverIp && ` · ${entry.serverIp}`}
          </p>
          {entry.errorMessage && <p className="mt-1 text-xs font-medium text-red-700">“{entry.errorMessage}”</p>}
        </div>
        <label className="flex items-center gap-1.5 text-xs text-slate-600">
          <input
            type="checkbox"
            checked={hideSecrets}
            onChange={(event) => setHideSecrets(event.target.checked)}
            className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600"
          />
          Hide secrets
        </label>
        {onClose && (
          <button type="button" onClick={onClose} className="text-xs font-medium text-indigo-600 hover:underline">
            Close
          </button>
        )}
      </header>
      <div role="tablist" aria-label="Request detail" className="flex gap-1 border-b border-slate-100 px-3 pt-2">
        {TABS.map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            aria-selected={tab === name}
            onClick={() => setTab(name)}
            className={`rounded-t-lg px-3 py-1.5 text-xs font-semibold ${
              tab === name ? "bg-indigo-50 text-indigo-700" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            {name}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="space-y-4 p-4">
        {tab === "Headers" && (
          <>
            <div>
              <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Request headers</h4>
              <HeaderList headers={mask(entry.request.headers)} />
            </div>
            <div>
              <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Response headers</h4>
              <HeaderList headers={mask(entry.response.headers)} />
            </div>
          </>
        )}
        {tab === "Payload" && (
          <>
            {entry.request.queryString.length > 0 && (
              <div>
                <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Query string</h4>
                <HeaderList headers={mask(entry.request.queryString)} />
              </div>
            )}
            <div>
              <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Request body {entry.request.postData?.mimeType && `(${entry.request.postData.mimeType})`}
              </h4>
              <Body text={body(entry.request.postData?.text ?? "")} />
            </div>
          </>
        )}
        {tab === "Response" && (
          <div>
            <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Response body {entry.mimeType && `(${entry.mimeType})`}
            </h4>
            {entry.response.redirectURL && (
              <p className="mb-2 break-all text-xs text-slate-600">Redirects to {entry.response.redirectURL}</p>
            )}
            <Body text={body(entry.response.body)} />
          </div>
        )}
        {tab === "Timing" &&
          (timings.length ? (
            <dl className="grid grid-cols-[8rem_1fr] gap-y-1 text-xs">
              {timings.map(([key, value]) => (
                <div key={key} className="contents">
                  <dt className="capitalize text-slate-500">{key}</dt>
                  <dd className="tabular-nums text-slate-800">{formatMs(Math.round(value))}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-xs text-slate-500">No timing details in this file.</p>
          ))}
      </div>
    </section>
  );
}
