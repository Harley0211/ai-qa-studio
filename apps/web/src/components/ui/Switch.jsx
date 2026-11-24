// An on/off switch (a checkbox for assistive technology).
export function Switch({ checked, onChange, label, disabled = false, className = '' }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-50 ${
        checked ? 'bg-indigo-600' : 'bg-slate-300'
      } ${className}`}
    >
      <span
        aria-hidden="true"
        className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

// Small status label: green (on), grey (off), amber (attention).
export function Badge({ tone = 'neutral', children }) {
  const tones = {
    success: 'bg-green-100 text-green-700',
    neutral: 'bg-slate-100 text-slate-600',
    warning: 'bg-amber-100 text-amber-800',
    accent: 'bg-indigo-50 text-indigo-700',
  };
  return <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}
