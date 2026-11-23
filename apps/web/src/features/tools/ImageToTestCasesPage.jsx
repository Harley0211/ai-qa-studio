import { FolderKanban, ImagePlus, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { PageHeader } from "../../components/layout/PageHeader.jsx";
import { Button } from "../../components/ui/Button.jsx";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "../../components/ui/States.jsx";
import { useToast } from "../../components/ui/Toast.jsx";
import { FocusPicker, FormatPicker } from "../evidence/GenerationOptions.jsx";
import { PendingReviews } from "../evidence/GenerationReview.jsx";
import {
  MAX_GENERATION_EVIDENCE,
  buildGenerationMessage,
  useGenerationFlow,
} from "../evidence/generation.hooks.js";
import {
  ClearUsedButton,
  EvidenceStatusBadge,
  SelectionBar,
  selectionProblem,
  useEvidenceSelection,
} from "../evidence/EvidenceSelection.jsx";
import { useEvidence, useUploadEvidence } from "../evidence/hooks.js";
import { validateImageFile } from "../evidence/upload.js";
import { useProjects } from "../projects/hooks.js";

function StepHeading({ number, children }) {
  return (
    <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-indigo-600">
      {number} · {children}
    </h2>
  );
}

function EvidenceStep({ projectId, disabled, selection }) {
  const fileInput = useRef(null);
  const [dragging, setDragging] = useState(false);
  const toast = useToast();
  const { data, isPending, isError, error, refetch } = useEvidence(projectId);
  const upload = useUploadEvidence(projectId);
  const items = data?.items ?? [];

  async function handleFile(file) {
    if (!file) return;

    const fileError = validateImageFile(file);
    if (fileError) {
      toast.error(fileError);
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    try {
      await upload.mutateAsync(formData);
      toast.success("Evidence uploaded successfully.");
    } catch (err) {
      toast.error(err.message || "Unable to upload evidence.");
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  return (
    <section>
      <StepHeading number={1}>Evidence</StepHeading>
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          handleFile(event.dataTransfer.files?.[0]);
        }}
        className={`flex flex-col items-center rounded-xl border-2 border-dashed px-6 py-6 text-center transition-colors ${
          dragging ? "border-indigo-500 bg-indigo-50" : "border-slate-300 bg-white"
        }`}
      >
        <p className="text-sm font-semibold text-slate-900">Drop an image here</p>
        <p className="mt-1 text-xs text-slate-500">
          PNG, JPG, JPEG, or WEBP · Maximum 5 MB · Up to {MAX_GENERATION_EVIDENCE} images per run
        </p>
        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          aria-label="Upload evidence image"
          onChange={(event) => handleFile(event.target.files?.[0])}
        />
        <Button
          icon={ImagePlus}
          variant="secondary"
          className="mt-3"
          loading={upload.isPending}
          disabled={upload.isPending || disabled}
          onClick={() => fileInput.current?.click()}
        >
          Choose image
        </Button>
      </div>

      <div className="mt-3">
        {isPending ? (
          <LoadingState label="Loading evidence..." />
        ) : isError ? (
          <ErrorState error={error} onRetry={() => refetch()} />
        ) : items.length === 0 ? (
          <p className="text-sm text-slate-500">No images uploaded for this project yet.</p>
        ) : (
          <>
            <p className="mb-2 text-sm text-slate-600">
              Tick the images to generate from. New images are selected; images an
              earlier generation already used are not, so you only get test cases for
              the new screens.
            </p>
            <div className="mb-2 space-y-2">
              <SelectionBar selection={selection} total={items.length} disabled={disabled} />
              <div className="flex flex-wrap items-center justify-end gap-3">
                <ClearUsedButton
                  projectId={projectId}
                  usedCount={selection.usedCount}
                  disabled={disabled}
                />
                <Link
                  to={`/projects/${projectId}/evidence`}
                  className="text-xs font-medium text-indigo-600 hover:underline"
                >
                  Manage evidence
                </Link>
              </div>
            </div>
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-6">
              {items.map((item) => {
                const checked = selection.isSelected(item.id);
                return (
                  <li key={item.id} title={item.filename}>
                    <label
                      className={`relative block cursor-pointer overflow-hidden rounded-lg border-2 bg-slate-100 ${
                        checked ? "border-indigo-600" : "border-transparent opacity-70"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={disabled}
                        onChange={() => selection.toggle(item.id)}
                        aria-label={`Use ${item.filename}`}
                        className="absolute left-2 top-2 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600"
                      />
                      <img
                        src={`/api/projects/${projectId}/evidence/${item.id}/file`}
                        alt={item.filename}
                        loading="lazy"
                        className="aspect-[3/4] w-full object-cover"
                      />
                      <span className="absolute bottom-1 left-1">
                        <EvidenceStatusBadge item={item} />
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}

function ImageTool({ projectId }) {
  const [format, setFormat] = useState("OVERALL");
  const [focus, setFocus] = useState(["Functional"]);
  const toast = useToast();
  const generation = useGenerationFlow(projectId);
  const { data: evidence } = useEvidence(projectId);
  const items = evidence?.items ?? [];
  const selection = useEvidenceSelection(items);
  const problem = selectionProblem(selection, items.length);

  async function handleGenerate() {
    try {
      await generation.start({
        message: buildGenerationMessage(focus),
        evidenceIds: selection.selectedIds,
        generationFormat: format,
      });
      toast.success("Test case generation started.");
    } catch (err) {
      toast.error(err.message || "Unable to start test case generation.");
    }
  }

  return (
    <div className="space-y-6 rounded-xl border border-slate-200 bg-white p-5">
      <EvidenceStep
        projectId={projectId}
        disabled={generation.isGenerating}
        selection={selection}
      />

      <section>
        <StepHeading number={2}>Result format</StepHeading>
        <FormatPicker value={format} onChange={setFormat} disabled={generation.isGenerating} />
      </section>

      <section>
        <StepHeading number={3}>Focus (optional)</StepHeading>
        <FocusPicker value={focus} onChange={setFocus} disabled={generation.isGenerating} />
      </section>

      <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-5">
        <Button
          icon={Sparkles}
          loading={generation.isGenerating}
          disabled={Boolean(problem) || generation.isGenerating}
          onClick={handleGenerate}
        >
          Generate from {selection.selectedItems.length}{" "}
          {selection.selectedItems.length === 1 ? "image" : "images"}
        </Button>
        <span className="text-xs text-slate-500">
          {problem ??
            "Test cases already in the library are skipped. Local AI can take several minutes."}
        </span>
      </div>

      {generation.isWaiting && (
        <p role="status" className="text-sm text-indigo-700">
          AI is analyzing your evidence. This may take a few minutes...
        </p>
      )}

      {generation.statusError && (
        <p role="alert" className="text-sm text-red-600">
          Unable to check generation status. Please refresh and check the Test cases tab.
        </p>
      )}

    </div>
  );
}

export default function ImageToTestCasesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { data, isPending, isError, error, refetch } = useProjects();
  const projects = data?.items ?? [];
  const requestedId = searchParams.get("project");
  const project = projects.find((p) => p.id === requestedId) ?? null;

  // No (or an unknown) project in the URL: default to the most recently updated one.
  useEffect(() => {
    if (!isPending && projects.length > 0 && !project) {
      setSearchParams({ project: projects[0].id }, { replace: true });
    }
  }, [isPending, projects, project, setSearchParams]);

  let content;
  if (isPending) {
    content = <LoadingState label="Loading projects..." />;
  } else if (isError) {
    content = <ErrorState error={error} onRetry={() => refetch()} />;
  } else if (projects.length === 0) {
    content = (
      <EmptyState
        icon={FolderKanban}
        title="No projects yet"
        description="Create a project first. Generated test cases are saved to a project."
        action={
          <Link to="/projects" className="text-sm font-medium text-indigo-600 hover:underline">
            Go to projects
          </Link>
        }
      />
    );
  } else if (project) {
    content = (
      <div key={project.id} className="space-y-6">
        <PendingReviews projectId={project.id} />
        <ImageTool projectId={project.id} />
      </div>
    );
  } else {
    content = <LoadingState label="Loading project..." />;
  }

  return (
    <>
      <p className="mb-2 text-sm text-slate-500">Tools / From image evidence</p>
      <PageHeader
        title="Image → Test cases"
        description="Turn screenshots into test cases for a project."
        actions={
          projects.length > 0 && (
            <label className="flex items-center gap-2 text-sm text-slate-600">
              Project
              <select
                value={project?.id ?? ""}
                onChange={(event) => setSearchParams({ project: event.target.value })}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 focus:outline-2 focus:outline-indigo-600"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          )
        }
      />
      {content}
    </>
  );
}
