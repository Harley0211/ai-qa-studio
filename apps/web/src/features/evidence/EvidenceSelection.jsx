import { Eraser } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "../../components/ui/Button.jsx";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog.jsx";
import { useToast } from "../../components/ui/Toast.jsx";
import { MAX_GENERATION_EVIDENCE } from "./generation.hooks.js";
import { useClearUsedEvidence } from "./hooks.js";

const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;

function formatDay(value) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value));
}

// Which images the next generation uses. Images never used before ("new") are
// selected; images an earlier generation used are not, so a new run covers
// only the new screens. A newly uploaded image is selected straight away, and
// images become unselected once a generation has used them.
export function useEvidenceSelection(items) {
  const [selected, setSelected] = useState(() => new Set());
  // id -> lastUsedAt as last seen, to notice new and newly used images.
  const seen = useRef(new Map());
  const itemsKey = items.map((item) => `${item.id}:${item.lastUsedAt ?? ""}`).join(",");

  useEffect(() => {
    // The updater below runs later, so it must use this snapshot, not the ref.
    const previous = seen.current;
    seen.current = new Map(items.map((item) => [item.id, item.lastUsedAt ?? null]));

    setSelected((current) => {
      const next = new Set();
      for (const item of items) {
        const before = previous.get(item.id);
        const isUnseen = before === undefined;
        const becameUsed = !isUnseen && !before && item.lastUsedAt;

        if (isUnseen) {
          if (!item.lastUsedAt) next.add(item.id);
        } else if (current.has(item.id) && !becameUsed) {
          next.add(item.id);
        }
      }
      return next;
    });
    // itemsKey captures every change that matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsKey]);

  const ids = (predicate) => new Set(items.filter(predicate).map((item) => item.id));
  // In list order (newest first), as the generation sends them.
  const selectedItems = items.filter((item) => selected.has(item.id));

  return {
    selected,
    selectedItems,
    selectedIds: selectedItems.map((item) => item.id),
    newCount: items.filter((item) => !item.lastUsedAt).length,
    usedCount: items.filter((item) => item.lastUsedAt).length,
    tooMany: selectedItems.length > MAX_GENERATION_EVIDENCE,
    isSelected: (id) => selected.has(id),
    toggle: (id) =>
      setSelected((current) => {
        const next = new Set(current);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    selectNew: () => setSelected(ids((item) => !item.lastUsedAt)),
    selectAll: () => setSelected(ids(() => true)),
    clear: () => setSelected(new Set()),
  };
}

// "New" for an image no generation has used yet, otherwise when it was used.
export function EvidenceStatusBadge({ item }) {
  return item.lastUsedAt ? (
    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
      Used · {formatDay(item.lastUsedAt)}
    </span>
  ) : (
    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
      New
    </span>
  );
}

// Counts and quick selection buttons above an image grid.
export function SelectionBar({ selection, total, disabled }) {
  const link =
    "font-medium text-indigo-600 hover:underline disabled:cursor-not-allowed disabled:text-slate-400 disabled:no-underline";

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
      <span aria-live="polite">
        {plural(selection.selectedItems.length, "image", "images")} selected of {total}
        {" · "}
        {selection.newCount} new, {selection.usedCount} used
      </span>
      <span className="flex flex-wrap gap-3">
        <button type="button" className={link} disabled={disabled} onClick={selection.selectNew}>
          Select new only
        </button>
        <button type="button" className={link} disabled={disabled} onClick={selection.selectAll}>
          Select all
        </button>
        <button type="button" className={link} disabled={disabled} onClick={selection.clear}>
          Clear selection
        </button>
      </span>
    </div>
  );
}

// Why Generate can't start yet, or null when it can.
export function selectionProblem(selection, total) {
  if (total === 0) return "Upload at least one image to start.";
  if (selection.selectedItems.length === 0) return "Select at least one image to start.";
  if (selection.tooMany) {
    return `Select at most ${MAX_GENERATION_EVIDENCE} images (${selection.selectedItems.length} selected).`;
  }
  return null;
}

// Deletes every image an earlier generation already used, after confirming.
export function ClearUsedButton({ projectId, usedCount, disabled }) {
  const toast = useToast();
  const clearUsed = useClearUsedEvidence(projectId);
  const [confirming, setConfirming] = useState(false);

  if (usedCount === 0) return null;

  async function confirm() {
    try {
      const result = await clearUsed.mutateAsync();
      const { deletedCount } = result.data;
      toast.success(
        deletedCount === usedCount
          ? `${plural(deletedCount, "used image", "used images")} deleted.`
          : `${plural(deletedCount, "used image", "used images")} deleted. Images a running generation still needs were kept.`,
      );
      setConfirming(false);
    } catch {
      /* Error is shown in the confirmation dialog. */
    }
  }

  return (
    <>
      <Button
        variant="secondary"
        icon={Eraser}
        disabled={disabled}
        onClick={() => {
          clearUsed.reset();
          setConfirming(true);
        }}
      >
        Clear used images
      </Button>
      {confirming && (
        <ConfirmDialog
          title="Delete used images?"
          message={`${plural(usedCount, "image", "images")} already used for test case generation will be permanently removed. New images and all test cases are kept.`}
          confirmLabel="Delete used images"
          isPending={clearUsed.isPending}
          error={clearUsed.error?.message}
          onConfirm={confirm}
          onCancel={() => setConfirming(false)}
        />
      )}
    </>
  );
}
