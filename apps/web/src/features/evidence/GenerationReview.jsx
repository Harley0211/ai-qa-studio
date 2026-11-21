import { CheckCircle2, ClipboardCheck, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../../components/ui/Button.jsx";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog.jsx";
import { LoadingState } from "../../components/ui/States.jsx";
import { useToast } from "../../components/ui/Toast.jsx";
import { FormatChip, TestCaseDetails } from "../projects/TestCaseDetails.jsx";
import { imageToolHref } from "../tools/paths.js";
import {
  useAcceptDrafts,
  useDiscardDrafts,
  useGenerationRun,
  usePendingReviews,
  useRefineChat,
} from "./generation.hooks.js";
import { RefineChat } from "./RefineChat.jsx";

const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;

function formatTime(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function ReviewBatch({ projectId, run, onAccepted }) {
  const toast = useToast();
  const { data, isPending, isError } = useGenerationRun(projectId, run.id);
  const accept = useAcceptDrafts(projectId);
  const discard = useDiscardDrafts(projectId);
  const [selected, setSelected] = useState(null);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const chat = useRefineChat(projectId, run.id, {
    // The cases (and their positions) changed, so start from "all selected".
    onApplied: () => {
      setSelected(null);
      toast.success("Generated test cases updated.");
    },
  });

  const drafts = data?.data?.drafts ?? [];
  // Everything is selected until the user changes the selection.
  const selection = selected ?? new Set(drafts.map((draft) => draft.index));
  const busy = accept.isPending || discard.isPending || chat.isRefining;
  const allSelected = drafts.length > 0 && selection.size === drafts.length;

  function toggle(index) {
    const next = new Set(selection);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    setSelected(next);
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(drafts.map((d) => d.index)));
  }

  async function handleAccept() {
    try {
      const result = await accept.mutateAsync({
        runId: run.id,
        indexes: [...selection],
      });
      const { createdCount } = result.data;
      toast.success(`${plural(createdCount, "test case", "test cases")} added to the library.`);
      onAccepted?.(result.data);
    } catch (err) {
      toast.error(err.message || "Unable to add the selected test cases.");
    }
  }

  async function confirmDiscard() {
    try {
      await discard.mutateAsync(run.id);
      toast.success("Generated test cases discarded.");
      setConfirmingDiscard(false);
    } catch {
      /* Error is shown in the confirmation dialog. */
    }
  }

  return (
    <article
      aria-label={`Generated ${formatTime(run.completedAt)}`}
      className="rounded-xl border border-indigo-200 bg-white"
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">
            {plural(run.draftCount, "test case", "test cases")} ready to review
          </h3>
          <p className="text-xs text-slate-500">
            {run.source
              ? `From ${run.source.documentTitle ? `${run.source.documentTitle} › ` : ""}${run.source.sectionTitle} · `
              : ""}
            Generated {formatTime(run.completedAt)}
          </p>
        </div>
        {drafts.length > 0 && (
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              disabled={busy}
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600"
            />
            Select all
          </label>
        )}
      </header>

      {isPending ? (
        <LoadingState label="Loading generated test cases..." />
      ) : isError ? (
        <p role="alert" className="px-4 py-3 text-sm text-red-600">
          Unable to load these generated test cases.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {drafts.map((draft) => (
            <li key={draft.index} className="flex gap-3 px-4 py-3">
              <input
                type="checkbox"
                checked={selection.has(draft.index)}
                onChange={() => toggle(draft.index)}
                disabled={busy}
                aria-label={`Select ${draft.title}`}
                className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600"
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-slate-900">{draft.title}</span>
                  <FormatChip testCase={draft} />
                </div>
                {draft.description && (
                  <p className="mt-1 text-sm text-slate-600">{draft.description}</p>
                )}
                <details className="mt-2">
                  <summary className="cursor-pointer text-sm font-medium text-indigo-600 hover:text-indigo-700">
                    View details
                  </summary>
                  <div className="mt-3">
                    <TestCaseDetails testCase={draft} />
                  </div>
                </details>
              </div>
            </li>
          ))}
        </ul>
      )}

      {!isPending && !isError && drafts.length > 0 && (
        <RefineChat chat={chat} disabled={accept.isPending || discard.isPending} />
      )}

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-3">
        <p className="text-xs text-slate-500">
          Unselected test cases are discarded.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            icon={Trash2}
            disabled={busy || isPending}
            onClick={() => {
              discard.reset();
              setConfirmingDiscard(true);
            }}
          >
            Discard all
          </Button>
          <Button
            icon={ClipboardCheck}
            loading={accept.isPending}
            disabled={busy || selection.size === 0}
            onClick={handleAccept}
          >
            Add {selection.size} to library
          </Button>
        </div>
      </footer>

      {confirmingDiscard && (
        <ConfirmDialog
          title="Discard generated test cases?"
          message={`All ${plural(run.draftCount, "test case", "test cases")} from this run will be discarded. Nothing is added to the library.`}
          confirmLabel="Discard all"
          isPending={discard.isPending}
          error={discard.error?.message}
          onConfirm={confirmDiscard}
          onCancel={() => setConfirmingDiscard(false)}
        />
      )}
    </article>
  );
}

// Every run in the project that is waiting for review.
export function PendingReviews({ projectId }) {
  const { data, isError } = usePendingReviews(projectId);
  const [lastAccepted, setLastAccepted] = useState(null);
  const runs = data?.items ?? [];

  if (isError) {
    return (
      <p role="alert" className="text-sm text-red-600">
        Unable to load generated test cases waiting for review.
      </p>
    );
  }

  if (runs.length === 0 && !lastAccepted) return null;

  return (
    <section aria-labelledby="review-heading" className="space-y-3">
      <div>
        <h2 id="review-heading" className="text-base font-semibold text-slate-900">
          Review generated test cases
        </h2>
        <p className="text-sm text-slate-500">
          Choose which test cases to add to the library.
        </p>
      </div>

      {lastAccepted && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-emerald-50 px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-medium text-emerald-900">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            Added {lastAccepted.caseIds.join(", ")} to the library.
          </p>
          <Link
            to={`/projects/${projectId}/test-cases`}
            className="text-sm font-medium text-indigo-600 hover:underline"
          >
            View test cases
          </Link>
        </div>
      )}

      {runs.map((run) => (
        <ReviewBatch key={run.id} projectId={projectId} run={run} onAccepted={setLastAccepted} />
      ))}
    </section>
  );
}

// A pointer to the review screen, for pages that don't show the review itself.
export function PendingReviewBanner({ projectId }) {
  const { data } = usePendingReviews(projectId);
  const count = (data?.items ?? []).reduce((sum, run) => sum + run.draftCount, 0);

  if (count === 0) return null;

  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3">
      <p className="text-sm font-medium text-indigo-900">
        {plural(count, "generated test case is", "generated test cases are")} waiting for review.
      </p>
      <Link
        to={imageToolHref(projectId)}
        className="text-sm font-semibold text-indigo-700 hover:underline"
      >
        Review now
      </Link>
    </div>
  );
}
