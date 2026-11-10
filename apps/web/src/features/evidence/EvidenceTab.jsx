import {
  FileImage,
  ImagePlus,
  Trash2,
  Upload,
  X,
  Sparkles,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Button, IconButton } from "../../components/ui/Button.jsx";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog.jsx";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "../../components/ui/States.jsx";
import { useToast } from "../../components/ui/Toast.jsx";
import { useDeleteEvidence, useEvidence, useUploadEvidence } from "./hooks.js";
import { useGenerateTestCases, useGenerationRun } from "./generation.hooks.js";

const MAX_UPLOAD_SIZE = 5 * 1024 * 1024;
const MAX_GENERATION_EVIDENCE = 20;
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"];

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function EvidenceTab() {
  const { project } = useOutletContext();
  const fileInput = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [runId, setRunId] = useState(null);

  const queryClient = useQueryClient();
  const toast = useToast();

  const { data, isPending, isError, error, refetch } = useEvidence(project.id);
  const uploadEvidence = useUploadEvidence(project.id);
  const deleteEvidence = useDeleteEvidence(project.id);
  const generateTestCases = useGenerateTestCases(project.id);
  const generation = useGenerationRun(project.id, runId);

  const items = data?.items ?? [];
  const isGenerating =
    generateTestCases.isPending ||
    (Boolean(runId) && generation.data?.data?.status === "PENDING");
  useEffect(() => {
    if (generation.data?.data?.status === "SUCCEEDED" && runId) {
      queryClient.invalidateQueries({
        queryKey: ["test-cases", project.id],
      });

      toast.success("Test cases generated successfully.");
      setRunId(null);
    }

    if (generation.data?.data?.status === "FAILED" && runId) {
      toast.error(generation.data.data.error || "Test case generation failed.");
      setRunId(null);
    }
  }, [generation.data, project.id, queryClient, runId, toast]);

  async function handleFile(file) {
    if (!file) return;

    if (!ALLOWED_TYPES.includes(file.type)) {
      toast.error("Only PNG, JPG, JPEG, and WEBP images are supported.");
      return;
    }

    if (file.size > MAX_UPLOAD_SIZE) {
      toast.error("Image exceeds the maximum upload size of 5 MB.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    try {
      await uploadEvidence.mutateAsync(formData);
      toast.success("Evidence uploaded successfully.");
    } catch (err) {
      toast.error(err.message || "Unable to upload evidence.");
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  function handleDrop(event) {
    event.preventDefault();
    setDragging(false);
    handleFile(event.dataTransfer.files?.[0]);
  }

  async function handleGenerate() {
    if (items.length === 0) {
      toast.error("Upload at least one image before generating test cases.");
      return;
    }

    const evidenceIds = items
      .slice(0, MAX_GENERATION_EVIDENCE)
      .map((item) => item.id);

    try {
      const result = await generateTestCases.mutateAsync({
        message:
          "Analyze the uploaded application screenshots and generate detailed, comprehensive functional test cases. Cover visible UI elements, user interactions, validations, navigation, positive and negative scenarios, and relevant edge cases. Return clear, actionable steps and expected results.",
        evidenceIds,
      });

      setRunId(result.data.id);
      if (items.length > MAX_GENERATION_EVIDENCE) {
        toast.success(
          `Generation started using the first ${MAX_GENERATION_EVIDENCE} images.`,
        );
      } else {
        toast.success("Test case generation started.");
      }
    } catch (err) {
      toast.error(err.message || "Unable to start test case generation.");
    }
  }

  async function confirmDelete() {
    try {
      await deleteEvidence.mutateAsync(deleting.id);
      toast.success("Evidence deleted.");
      if (preview?.id === deleting.id) setPreview(null);
      setDeleting(null);
    } catch {
      /* Error is displayed in the confirmation dialog. */
    }
  }

  return (
    <section>
      <div className="mb-5">
        <h2 className="text-base font-semibold text-slate-900">Evidence</h2>
        <p className="text-sm text-slate-500">
          Upload screenshots and images that will be used to generate test
          cases.
        </p>
      </div>

      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) {
            setDragging(false);
          }
        }}
        onDrop={handleDrop}
        className={`mb-6 flex flex-col items-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
          dragging
            ? "border-indigo-500 bg-indigo-50"
            : "border-slate-300 bg-white"
        }`}
      >
        <div className="mb-3 rounded-full bg-indigo-50 p-3">
          <Upload className="h-6 w-6 text-indigo-600" />
        </div>

        <h3 className="text-sm font-semibold text-slate-900">
          Drag and drop an image here
        </h3>
        <p className="mt-1 text-sm text-slate-500">
          or select an image from your computer
        </p>
        <p className="mt-2 text-xs text-slate-400">
          PNG, JPG, JPEG, or WEBP · Maximum 5 MB
        </p>

        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(event) => handleFile(event.target.files?.[0])}
        />

        <Button
          icon={ImagePlus}
          className="mt-4"
          loading={uploadEvidence.isPending}
          disabled={uploadEvidence.isPending}
          onClick={() => fileInput.current?.click()}
        >
          Choose image
        </Button>

        {uploadEvidence.isPending && (
          <p role="status" className="mt-3 text-sm text-indigo-600">
            Uploading image...
          </p>
        )}
      </div>

      <div className="mb-6 rounded-xl border border-indigo-100 bg-indigo-50 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              Generate test cases
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              Analyze your uploaded screenshots with AI and create test cases.
              Maximum 20 images per generation.
            </p>
          </div>

          <Button
            icon={Sparkles}
            loading={isGenerating}
            disabled={
              items.length === 0 || isGenerating || generateTestCases.isPending
            }
            onClick={handleGenerate}
          >
            Generate Test Cases
          </Button>
        </div>

        {runId && generation.data?.data?.status === "PENDING" && (
          <p role="status" className="mt-3 text-sm text-indigo-700">
            AI is analyzing your evidence. This may take a few minutes...
          </p>
        )}

        {generation.isError && runId && (
          <p role="alert" className="mt-3 text-sm text-red-600">
            Unable to check generation status. Please refresh and check your
            Test Cases tab.
          </p>
        )}
      </div>

      {isPending ? (
        <LoadingState label="Loading evidence..." />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={FileImage}
          title="No evidence uploaded"
          description="Upload screenshots of your application to start building your evidence library."
        />
      ) : (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">
              Uploaded images
            </h3>
            <span className="text-xs text-slate-500">
              {data.total} {data.total === 1 ? "image" : "images"}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => {
              const imageUrl = `/api/projects/${project.id}/evidence/${item.id}/file`;

              return (
                <article
                  key={item.id}
                  className="overflow-hidden rounded-xl border border-slate-200 bg-white"
                >
                  <button
                    type="button"
                    onClick={() => setPreview(item)}
                    className="block aspect-video w-full cursor-zoom-in overflow-hidden bg-slate-100"
                    aria-label={`Preview ${item.filename}`}
                  >
                    <img
                      src={imageUrl}
                      alt={item.filename}
                      loading="lazy"
                      className="h-full w-full object-contain"
                    />
                  </button>

                  <div className="flex items-start justify-between gap-2 p-3">
                    <div className="min-w-0">
                      <p
                        className="truncate text-sm font-medium text-slate-900"
                        title={item.filename}
                      >
                        {item.filename}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {formatFileSize(item.fileSize)}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        {formatDate(item.createdAt)}
                      </p>
                    </div>

                    <IconButton
                      icon={Trash2}
                      label={`Delete ${item.filename}`}
                      variant="ghost"
                      className="text-red-600 hover:bg-red-50 hover:text-red-700"
                      onClick={() => {
                        deleteEvidence.reset();
                        setDeleting(item);
                      }}
                    />
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      )}

      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`Image preview: ${preview.filename}`}
          onClick={() => setPreview(null)}
        >
          <div
            className="relative flex max-h-full max-w-5xl flex-col"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between gap-4 text-white">
              <p className="truncate text-sm font-medium">{preview.filename}</p>
              <IconButton
                icon={X}
                label="Close preview"
                className="text-white hover:bg-white/20 hover:text-white"
                onClick={() => setPreview(null)}
              />
            </div>
            <img
              src={`/api/projects/${project.id}/evidence/${preview.id}/file`}
              alt={preview.filename}
              className="max-h-[80vh] max-w-full rounded-lg object-contain"
            />
          </div>
        </div>
      )}

      {deleting && (
        <ConfirmDialog
          title="Delete evidence?"
          message={`${deleting.filename} will be permanently removed from this project.`}
          confirmLabel="Delete image"
          isPending={deleteEvidence.isPending}
          error={deleteEvidence.error?.message}
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </section>
  );
}
