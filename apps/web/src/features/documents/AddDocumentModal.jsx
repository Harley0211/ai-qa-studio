import { useRef, useState } from "react";
import { Button } from "../../components/ui/Button.jsx";
import { Modal } from "../../components/ui/Modal.jsx";
import { TextField } from "../../components/ui/TextField.jsx";
import { useCreateDocument, useUploadDocument } from "./hooks.js";

export const MAX_DOCUMENT_CHARS = 60000;
const ACCEPTED_EXTENSIONS = [".txt", ".md", ".markdown", ".pdf"];
// PDFs are larger than their text (fonts, images); matches the server limit.
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const tabClass = (active) =>
  `rounded-lg px-3 py-1.5 text-sm font-medium ${
    active ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-100"
  }`;

export function AddDocumentModal({ projectId, onClose, onSaved }) {
  const [mode, setMode] = useState("paste");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [file, setFile] = useState(null);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const fileInput = useRef(null);

  const create = useCreateDocument(projectId);
  const upload = useUploadDocument(projectId);
  const pending = create.isPending || upload.isPending;

  async function handleSubmit(event) {
    event.preventDefault();
    setFormError(null);

    const next = {};
    if (mode === "paste") {
      if (!title.trim()) next.title = "Title is required";
      if (!content.trim()) next.content = "Document text is required";
      else if (content.trim().length > MAX_DOCUMENT_CHARS) {
        next.content = `Document text must be ${MAX_DOCUMENT_CHARS.toLocaleString()} characters or fewer`;
      }
    } else if (!file) {
      next.file = "Choose a .txt, .md or .pdf file";
    } else if (!ACCEPTED_EXTENSIONS.some((ext) => file.name.toLowerCase().endsWith(ext))) {
      next.file = "Only .txt, .md and .pdf files are supported";
    } else if (file.size > MAX_UPLOAD_BYTES) {
      next.file = "The file is larger than 10 MB";
    }

    setErrors(next);
    if (Object.keys(next).length > 0) return;

    try {
      let saved;
      if (mode === "paste") {
        saved = await create.mutateAsync({ title: title.trim(), content: content.trim() });
      } else {
        const formData = new FormData();
        formData.append("file", file);
        if (title.trim()) formData.append("title", title.trim());
        saved = await upload.mutateAsync(formData);
      }
      onSaved(saved);
    } catch (err) {
      const { _: general, ...fieldErrors } = err.fields ?? {};
      setErrors(fieldErrors);
      if (general || Object.keys(fieldErrors).length === 0) {
        setFormError(general ?? err.message);
      }
    }
  }

  return (
    <Modal title="Add document" onClose={pending ? () => {} : onClose}>
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <div role="group" aria-label="Document source" className="flex gap-1">
          <button type="button" aria-pressed={mode === "paste"} className={tabClass(mode === "paste")} onClick={() => setMode("paste")}>
            Paste text
          </button>
          <button type="button" aria-pressed={mode === "upload"} className={tabClass(mode === "upload")} onClick={() => setMode("upload")}>
            Upload file
          </button>
        </div>

        {formError && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {formError}
          </p>
        )}

        <TextField
          label={mode === "paste" ? "Title" : "Title (optional)"}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          error={errors.title}
          placeholder="e.g. Add-ons PRD v3"
          hint={mode === "upload" ? "Defaults to the file name." : undefined}
        />

        {mode === "paste" ? (
          <TextField
            label="Document text"
            multiline
            rows={10}
            value={content}
            onChange={(event) => setContent(event.target.value)}
            error={errors.content}
            hint="Headings like “## 3.2 Purchase flow” or “3.2 Purchase flow” split the document into sections."
          />
        ) : (
          <div>
            <p className="text-sm font-medium text-slate-700">File</p>
            <input
              ref={fileInput}
              type="file"
              accept=".txt,.md,.markdown,.pdf,text/plain,text/markdown,application/pdf"
              aria-label="Document file"
              className="mt-1 block w-full text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-indigo-700"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
            {errors.file ? (
              <p className="mt-1 text-sm text-red-600">{errors.file}</p>
            ) : (
              <p className="mt-1 text-xs text-slate-500">
                .txt, .md or .pdf · up to 10 MB · PDFs need selectable text
                (scanned PDFs and Word files are not supported yet).
              </p>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" loading={pending}>
            Add document
          </Button>
        </div>
      </form>
    </Modal>
  );
}
