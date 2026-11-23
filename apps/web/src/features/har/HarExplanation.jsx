import { AlertTriangle, CheckCircle2, Check, Copy, Info, Lightbulb, MessageSquareText, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "../../components/ui/Button.jsx";
import { useToast } from "../../components/ui/Toast.jsx";
import { explainHar } from "./harExplainer.js";

const VERDICT_STYLE = {
  ok: ["bg-emerald-50 text-emerald-900 ring-emerald-200", CheckCircle2, "text-emerald-600"],
  warning: ["bg-amber-50 text-amber-900 ring-amber-200", AlertTriangle, "text-amber-600"],
  error: ["bg-red-50 text-red-900 ring-red-200", XCircle, "text-red-600"],
};

const LEVEL = {
  high: ["High impact", "bg-red-100 text-red-800"],
  medium: ["Worth checking", "bg-amber-100 text-amber-800"],
  low: ["Probably not a bug", "bg-slate-100 text-slate-700"],
};

function Row({ label, children }) {
  return (
    <div className="grid gap-0.5 sm:grid-cols-[9rem_1fr] sm:gap-3">
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="text-sm text-slate-800">{children}</dd>
    </div>
  );
}

function Finding({ finding, onSelect, open }) {
  const [label, style] = LEVEL[finding.level];
  return (
    <details open={open} className="rounded-lg border border-slate-200 bg-white">
      <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-4 py-3">
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${style}`}>{label}</span>
        <span className="min-w-0 flex-1 break-all font-mono text-xs font-semibold text-slate-900">{finding.title}</span>
        {finding.requests.length > 1 && <span className="text-xs text-slate-500">×{finding.requests.length}</span>}
      </summary>
      <dl className="space-y-2.5 border-t border-slate-100 px-4 py-3">
        <Row label="What happened">{finding.what}</Row>
        {finding.serverMessage && <Row label="Server said">“{finding.serverMessage}”</Row>}
        <Row label="What it means">{finding.meaning}</Row>
        <Row label="Likely cause">{finding.cause}</Row>
        <Row label="Who should look">{finding.owner}</Row>
        <Row label="What to check">
          <ul className="list-disc space-y-0.5 pl-4">
            {finding.next.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ul>
        </Row>
        {onSelect && (
          <div className="pt-1">
            <button
              type="button"
              onClick={() => onSelect(finding.requests[0])}
              className="text-xs font-semibold text-indigo-600 hover:underline"
            >
              Show this request
            </button>
          </div>
        )}
      </dl>
    </details>
  );
}

// "What happened": a plain-language reading of the HAR for testers new to
// network logs, with a paragraph they can pass on to their lead.
export function HarExplanation({ summary, entries, onSelect }) {
  const toast = useToast();
  const explanation = useMemo(() => explainHar(summary, entries), [summary, entries]);
  const [copied, setCopied] = useState(false);
  const [style, Icon, iconColor] = VERDICT_STYLE[explanation.verdict.tone];

  async function copyForLead() {
    try {
      await navigator.clipboard.writeText(explanation.forLead);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy. Select the text and copy it instead.");
    }
  }

  return (
    <section aria-label="What happened" className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
        <Lightbulb className="h-5 w-5 text-amber-500" aria-hidden="true" />
        What happened
      </h2>

      <div className={`flex gap-3 rounded-lg px-4 py-3 ring-1 ${style}`}>
        <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${iconColor}`} aria-hidden="true" />
        <div>
          <p className="text-sm font-semibold">{explanation.verdict.headline}</p>
          <p className="mt-1 text-sm">{explanation.verdict.text}</p>
        </div>
      </div>

      {explanation.findings.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-slate-900">
            {explanation.findings.length === 1 ? "The problem, explained" : `${explanation.findings.length} problems, most important first`}
          </h3>
          {explanation.findings.map((finding, index) => (
            <Finding key={finding.id} finding={finding} onSelect={onSelect} open={index === 0} />
          ))}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <h3 className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-slate-900">
            <Info className="h-4 w-4 text-slate-400" aria-hidden="true" />
            What else the file shows
          </h3>
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
            {explanation.observations.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-slate-900">
            <CheckCircle2 className="h-4 w-4 text-slate-400" aria-hidden="true" />
            Next steps
          </h3>
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
            {explanation.nextSteps.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="rounded-lg bg-indigo-50 p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-indigo-900">
            <MessageSquareText className="h-4 w-4" aria-hidden="true" />
            How to explain this to your lead
          </h3>
          <Button variant="secondary" size="sm" icon={copied ? Check : Copy} onClick={copyForLead}>
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
        <p className="text-sm text-indigo-900" data-testid="lead-summary">
          {explanation.forLead}
        </p>
      </div>
    </section>
  );
}
