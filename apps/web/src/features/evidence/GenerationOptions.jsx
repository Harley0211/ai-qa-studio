import { FOCUS_OPTIONS } from "./generation.hooks.js";

const FORMATS = [
  {
    value: "OVERALL",
    title: "Overall expected result",
    hint: "Default. One result per test case.",
  },
  {
    value: "PER_STEP",
    title: "Expected result per step",
    hint: "Every step gets its own result.",
  },
];

export function FormatPicker({ value, onChange, disabled = false }) {
  return (
    <fieldset disabled={disabled}>
      <legend className="sr-only">Expected result format</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        {FORMATS.map((format) => {
          const selected = value === format.value;

          return (
            <label
              key={format.value}
              className={`flex cursor-pointer gap-3 rounded-xl border p-3 text-left transition-colors ${
                selected
                  ? "border-indigo-500 bg-indigo-50"
                  : "border-slate-200 bg-white hover:border-slate-300"
              } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
            >
              <input
                type="radio"
                name="generation-format"
                value={format.value}
                checked={selected}
                onChange={() => onChange(format.value)}
                className="mt-0.5 h-4 w-4 text-indigo-600 focus:ring-indigo-600"
              />
              <span>
                <span className="block text-sm font-semibold text-slate-900">
                  {format.title}
                </span>
                <span className="mt-0.5 block text-xs text-slate-500">
                  {format.hint}
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function FocusPicker({ value, onChange, disabled = false }) {
  function toggle(option) {
    onChange(
      value.includes(option)
        ? value.filter((item) => item !== option)
        : [...value, option],
    );
  }

  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Test focus">
      {FOCUS_OPTIONS.map((option) => {
        const selected = value.includes(option);

        return (
          <button
            key={option}
            type="button"
            aria-pressed={selected}
            disabled={disabled}
            onClick={() => toggle(option)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
              selected
                ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                : "border-slate-300 bg-white text-slate-600 hover:border-slate-400"
            }`}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}
