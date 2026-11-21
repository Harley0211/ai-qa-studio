import { Loader2, Send, Sparkles } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "../../components/ui/Button.jsx";

export const REFINE_SUGGESTIONS = [
  "Add negative test cases",
  "Add boundary value test cases",
  "Make the steps more detailed",
  "Remove test cases that repeat each other",
];

const MAX_INSTRUCTION = 1000;

function Reply({ item }) {
  if (item.status === "PENDING") {
    return (
      <p className="flex items-center gap-2 text-sm text-slate-600">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Working on it. This can take a minute or two.
      </p>
    );
  }

  if (item.status === "FAILED") {
    return <p className="text-sm text-red-600">{item.error || "This change could not be made."}</p>;
  }

  return <p className="text-sm text-slate-700">{item.replySummary || "Done."}</p>;
}

// "Refine with AI" panel of a review batch: a short conversation where each
// request changes the batch's generated test cases.
export function RefineChat({ chat, disabled = false }) {
  const [text, setText] = useState("");
  const inputId = useId();
  const { items, isRefining, historyError, send } = chat;
  const canSend = Boolean(text.trim()) && !isRefining && !disabled;

  async function submit(event) {
    event?.preventDefault();
    if (!canSend) return;

    try {
      await send.mutateAsync(text.trim());
      setText("");
    } catch {
      /* Shown below the input. */
    }
  }

  function handleKeyDown(event) {
    // Enter sends; Shift+Enter adds a new line.
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <section
      aria-labelledby={`${inputId}-heading`}
      className="border-t border-slate-100 bg-slate-50 px-4 py-3"
    >
      <h4
        id={`${inputId}-heading`}
        className="flex items-center gap-2 text-sm font-semibold text-slate-900"
      >
        <Sparkles className="h-4 w-4 text-indigo-600" aria-hidden="true" />
        Refine with AI
      </h4>
      <p className="mt-0.5 text-xs text-slate-500">
        Describe a change in plain words. Only the test cases it mentions are changed.
      </p>

      {historyError && (
        <p className="mt-2 text-xs text-red-600">Unable to load earlier requests.</p>
      )}

      {items.length > 0 && (
        <ol aria-label="Refine conversation" className="mt-3 space-y-3">
          {items.map((item) => (
            <li key={item.id} className="space-y-1.5">
              <p className="ml-auto w-fit max-w-[85%] whitespace-pre-wrap rounded-lg bg-indigo-600 px-3 py-2 text-sm text-white">
                {item.instruction}
              </p>
              <div className="w-fit max-w-[85%] rounded-lg bg-white px-3 py-2 ring-1 ring-inset ring-slate-200">
                <Reply item={item} />
              </div>
            </li>
          ))}
        </ol>
      )}

      {items.length === 0 && (
        <div className="mt-3 flex flex-wrap gap-2" aria-label="Suggestions">
          {REFINE_SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              disabled={disabled}
              onClick={() => setText(suggestion)}
              className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-indigo-50 hover:text-indigo-700 disabled:opacity-60"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={submit} className="mt-3 flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <label htmlFor={inputId} className="sr-only">
            Ask for a change
          </label>
          <textarea
            id={inputId}
            rows={2}
            value={text}
            maxLength={MAX_INSTRUCTION}
            disabled={disabled}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="For example: add 2 negative test cases for the email field"
            className="block w-full resize-y rounded-lg border-0 bg-white px-3 py-2 text-sm text-slate-900 ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 disabled:opacity-60"
          />
        </div>
        <Button type="submit" icon={Send} loading={send.isPending} disabled={!canSend}>
          Send
        </Button>
      </form>

      {send.isError && (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {send.error?.message || "Unable to send your request."}
        </p>
      )}
      {isRefining && !send.isPending && (
        <p className="mt-2 text-xs text-slate-500">
          Adding to the library is paused until this change finishes.
        </p>
      )}
    </section>
  );
}
