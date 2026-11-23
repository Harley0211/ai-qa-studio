import { FileText, Plus, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { useOutletContext, useSearchParams } from "react-router-dom";
import { PageHeader } from "../../components/layout/PageHeader.jsx";
import { Button } from "../../components/ui/Button.jsx";
import { EmptyState, ErrorState, LoadingState } from "../../components/ui/States.jsx";
import { useToast } from "../../components/ui/Toast.jsx";
import { AddDocumentModal } from "../documents/AddDocumentModal.jsx";
import { useDocument, useDocuments, useGenerateFromDocument } from "../documents/hooks.js";
import { FocusPicker, FormatPicker } from "../evidence/GenerationOptions.jsx";
import { PendingReviews } from "../evidence/GenerationReview.jsx";
import { useRunsProgress } from "../evidence/generation.hooks.js";
import { ToolCrumb } from "./ToolCrumb.jsx";

// Matches the server limit for one request.
export const MAX_SECTIONS_PER_RUN = 10;

function StepHeading({ number, children }) {
  return (
    <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-indigo-600">
      {number} · {children}
    </h2>
  );
}

function SectionPicker({ projectId, documentId, selected, onChange, disabled }) {
  const { data, isPending, isError } = useDocument(projectId, documentId);

  if (isPending) return <LoadingState label="Loading sections..." />;
  if (isError) return <p className="text-sm text-red-600">Unable to load sections.</p>;

  const sections = data.sections;
  const allIds = sections.slice(0, MAX_SECTIONS_PER_RUN).map((s) => s.id);
  const atLimit = selected.length >= MAX_SECTIONS_PER_RUN;

  function toggle(id) {
    onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);
  }

  return (
    <div className="rounded-xl border border-slate-200">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2 text-xs text-slate-500">
        <span>
          {selected.length} of {sections.length} selected · up to {MAX_SECTIONS_PER_RUN} per run ·
          each section is generated separately
        </span>
        <span className="flex gap-3">
          <button type="button" disabled={disabled} className="font-medium text-indigo-600 hover:underline" onClick={() => onChange(allIds)}>
            Select {sections.length > MAX_SECTIONS_PER_RUN ? `first ${MAX_SECTIONS_PER_RUN}` : "all"}
          </button>
          <button type="button" disabled={disabled} className="font-medium text-indigo-600 hover:underline" onClick={() => onChange([])}>
            Clear
          </button>
        </span>
      </div>
      <ul className="divide-y divide-slate-100">
        {sections.map((section) => {
          const checked = selected.includes(section.id);
          return (
            <li key={section.id}>
              <label className="flex cursor-pointer items-start gap-3 px-4 py-2.5 text-sm">
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={disabled || (!checked && atLimit)}
                  onChange={() => toggle(section.id)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600"
                />
                <span className="flex-1 text-slate-800">{section.title}</span>
                <span className="shrink-0 text-xs text-slate-500">
                  {section.truncatedForGeneration
                    ? "Long: first 12,000 characters used"
                    : `${section.charCount.toLocaleString()} characters`}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function PrdTool({ projectId, documentId, onDocumentChange }) {
  const { data, isPending, isError, error, refetch } = useDocuments(projectId);
  const generate = useGenerateFromDocument(projectId);
  const progress = useRunsProgress(projectId);
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [sectionIds, setSectionIds] = useState([]);
  const [format, setFormat] = useState("OVERALL");
  const [focus, setFocus] = useState(["Functional", "Negative", "Validation"]);

  const documents = data?.items ?? [];
  const document = documents.find((d) => d.id === documentId) ?? null;
  const busy = generate.isPending || progress.isGenerating;

  // Default to the newest document; clear the selection when it changes.
  useEffect(() => {
    if (!isPending && documents.length > 0 && !document) {
      onDocumentChange(documents[0].id);
    }
  }, [isPending, documents, document, onDocumentChange]);

  useEffect(() => setSectionIds([]), [documentId]);

  async function handleGenerate() {
    try {
      const result = await generate.mutateAsync({
        documentId,
        sectionIds,
        generationFormat: format,
        focus,
      });
      const runs = result.data.runs;
      progress.track(runs.map((run) => run.id));
      toast.success(
        runs.length === 1
          ? "Test case generation started."
          : `Test case generation started for ${runs.length} sections.`,
      );
      setSectionIds([]);
    } catch (err) {
      toast.error(err.message || "Unable to start test case generation.");
    }
  }

  if (isPending) return <LoadingState label="Loading documents..." />;
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />;

  return (
    <div className="space-y-6 rounded-xl border border-slate-200 bg-white p-5">
      <section>
        <StepHeading number={1}>Document</StepHeading>
        {documents.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No documents yet"
            description="Paste or upload a PRD to get started."
            action={
              <Button icon={Plus} onClick={() => setAdding(true)}>
                Add document
              </Button>
            }
          />
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex min-w-0 flex-1 items-center gap-2 text-sm text-slate-600">
              <span className="shrink-0">Document</span>
              <select
                value={documentId ?? ""}
                disabled={busy}
                onChange={(event) => onDocumentChange(event.target.value)}
                className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 focus:outline-2 focus:outline-indigo-600"
              >
                {documents.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title} ({d.sectionCount} {d.sectionCount === 1 ? "section" : "sections"})
                  </option>
                ))}
              </select>
            </label>
            <Button variant="secondary" icon={Plus} disabled={busy} onClick={() => setAdding(true)}>
              Add document
            </Button>
          </div>
        )}
      </section>

      {document && (
        <>
          <section>
            <StepHeading number={2}>Sections to cover</StepHeading>
            <SectionPicker
              projectId={projectId}
              documentId={document.id}
              selected={sectionIds}
              onChange={setSectionIds}
              disabled={busy}
            />
          </section>

          <section>
            <StepHeading number={3}>Focus (optional)</StepHeading>
            <FocusPicker value={focus} onChange={setFocus} disabled={busy} />
          </section>

          <section>
            <StepHeading number={4}>Result format</StepHeading>
            <FormatPicker value={format} onChange={setFormat} disabled={busy} />
          </section>

          <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-5">
            <Button
              icon={Sparkles}
              loading={busy}
              disabled={busy || sectionIds.length === 0}
              onClick={handleGenerate}
            >
              Generate test cases
            </Button>
            <span className="text-xs text-slate-500">
              {sectionIds.length === 0
                ? "Select at least one section."
                : "Each case links back to its section. Local AI can take several minutes per section."}
            </span>
          </div>

          {progress.isGenerating && (
            <p role="status" className="text-sm text-indigo-700">
              AI is reading the document: {progress.finished} of {progress.total}{" "}
              {progress.total === 1 ? "section" : "sections"} done...
            </p>
          )}
        </>
      )}

      {adding && (
        <AddDocumentModal
          projectId={projectId}
          onClose={() => setAdding(false)}
          onSaved={(saved) => {
            setAdding(false);
            toast.success(`“${saved.title}” added.`);
            onDocumentChange(saved.id);
          }}
        />
      )}
    </div>
  );
}

// PRD → Test cases, for the project you're in.
export default function PrdToTestCasesPage() {
  const { project } = useOutletContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const documentId = searchParams.get("document");

  function setDocument(id) {
    setSearchParams({ document: id }, { replace: true });
  }

  return (
    <>
      <ToolCrumb project={project} tool="From PRD / document" />
      <PageHeader
        title="PRD → Test cases"
        description={`Turn requirements into test cases for ${project.name}, section by section.`}
      />
      <div key={project.id} className="space-y-6">
        <PendingReviews projectId={project.id} />
        <PrdTool projectId={project.id} documentId={documentId} onDocumentChange={setDocument} />
      </div>
    </>
  );
}