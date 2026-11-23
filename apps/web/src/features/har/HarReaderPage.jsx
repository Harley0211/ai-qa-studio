import { Bug, Download, FileJson, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "../../components/layout/PageHeader.jsx";
import { Button } from "../../components/ui/Button.jsx";
import { useToast } from "../../components/ui/Toast.jsx";
import { downloadBlob } from "../../lib/zip.js";
import { BUG_REPORT_PATH } from "../tools/paths.js";
import { HarEntryDetail, HarErrors, HarSummary, HarTable } from "./HarViews.jsx";
import { harSummaryMarkdown, readHarFile, redactHar } from "./harParser.js";

// Drop zone for one .har file.
export function HarDropzone({ onFile, busy, label = "Drop a HAR file here" }) {
  const input = useRef(null);
  const [dragging, setDragging] = useState(false);

  return (
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
        const file = event.dataTransfer.files?.[0];
        if (file) onFile(file);
      }}
      className={`flex flex-col items-center rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors ${
        dragging ? "border-indigo-500 bg-indigo-50" : "border-slate-300 bg-white"
      }`}
    >
      <FileJson className="mb-2 h-7 w-7 text-indigo-600" aria-hidden="true" />
      <p className="text-sm font-semibold text-slate-900">{label}</p>
      <p className="mt-1 text-xs text-slate-500">
        Export it from the browser: DevTools → Network → “Save all as HAR”. The file is read on
        this computer and is not uploaded.
      </p>
      <input
        ref={input}
        type="file"
        accept=".har,application/json"
        className="hidden"
        aria-label="Choose HAR file"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onFile(file);
          event.target.value = "";
        }}
      />
      <Button icon={Upload} variant="secondary" className="mt-3" loading={busy} onClick={() => input.current?.click()}>
        Choose HAR file
      </Button>
    </div>
  );
}

export default function HarReaderPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState(null);

  async function open(nextFile) {
    setBusy(true);
    setError(null);
    try {
      const parsed = await readHarFile(nextFile);
      setFile(nextFile);
      setResult(parsed);
      setSelected(parsed.summary.errors[0] ?? null);
    } catch (err) {
      setError(err.message || "Unable to read this file.");
    } finally {
      setBusy(false);
    }
  }

  function downloadSummary() {
    const blob = new Blob([harSummaryMarkdown(file.name, result.summary)], { type: "text/markdown" });
    downloadBlob(blob, `${file.name.replace(/\.har$/i, "")}-summary.md`);
  }

  function downloadRedacted() {
    const blob = new Blob([JSON.stringify(redactHar(result.har), null, 2)], { type: "application/json" });
    downloadBlob(blob, `${file.name.replace(/\.har$/i, "")}-redacted.har`);
    toast.success("Downloaded a copy without cookies, tokens or passwords.");
  }

  return (
    <>
      <p className="mb-2 text-sm text-slate-500">Tools / HAR reader</p>
      <PageHeader
        title="HAR reader"
        description="See every request in a HAR file: status codes, errors, slow calls, headers and responses."
        actions={
          result && (
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" icon={Download} onClick={downloadSummary}>
                Summary (.md)
              </Button>
              <Button variant="secondary" icon={Download} onClick={downloadRedacted}>
                Redacted HAR
              </Button>
              <Button icon={Bug} onClick={() => navigate(BUG_REPORT_PATH, { state: { harFile: file } })}>
                Create bug report
              </Button>
            </div>
          )
        }
      />

      <div className="space-y-5">
        {!result && <HarDropzone onFile={open} busy={busy} />}
        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}

        {result && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-slate-600">
                <span className="font-semibold text-slate-900">{file.name}</span>
                {result.summary.capturedAt && ` · captured ${new Date(result.summary.capturedAt).toLocaleString()}`}
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setResult(null);
                  setFile(null);
                  setSelected(null);
                }}
              >
                Open another file
              </Button>
            </div>
            <HarSummary summary={result.summary} />
            <HarErrors summary={result.summary} onSelect={setSelected} />
            {selected && <HarEntryDetail key={selected.id} entry={selected} onClose={() => setSelected(null)} />}
            <HarTable entries={result.entries} selectedId={selected?.id} onSelect={setSelected} />
          </>
        )}
      </div>
    </>
  );
}
