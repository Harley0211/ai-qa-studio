const STATUS = {
  PENDING: ["Generating…", "bg-indigo-100 text-indigo-800"],
  SUCCEEDED: ["Ready", "bg-emerald-100 text-emerald-800"],
  FAILED: ["Failed", "bg-red-100 text-red-800"],
};

const SEVERITY = {
  Blocker: "bg-red-600 text-white",
  Critical: "bg-red-100 text-red-800",
  Major: "bg-amber-100 text-amber-800",
  Minor: "bg-sky-100 text-sky-800",
  Trivial: "bg-slate-100 text-slate-700",
};

export function StatusBadge({ status }) {
  const [label, style] = STATUS[status] ?? [status, "bg-slate-100 text-slate-700"];
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${style}`}>{label}</span>;
}

export function SeverityBadge({ severity }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${SEVERITY[severity] ?? SEVERITY.Trivial}`}>
      {severity}
    </span>
  );
}
