import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { PageHeader } from "../../components/layout/PageHeader.jsx";
import { Button } from "../../components/ui/Button.jsx";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog.jsx";
import { ErrorState, LoadingState } from "../../components/ui/States.jsx";
import { useToast } from "../../components/ui/Toast.jsx";
import { api } from "../../lib/apiClient.js";
import { useCurrentUser } from "../auth/auth.hooks.js";
import { fetchBlob, harFileKeys, harFileUrl, useDeleteHarFile } from "../bug-report/hooks.js";
import { HAR_READER_PATH } from "../tools/paths.js";
import { HarResult, openedHars } from "./HarReaderPage.jsx";
import { readHarFile } from "./harParser.js";

// One saved HAR from the library, read again in the browser.
export default function HarFilePage() {
  const { harId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const user = useCurrentUser();
  const remove = useDeleteHarFile();
  const [confirming, setConfirming] = useState(false);
  const meta = useQuery({
    queryKey: [...harFileKeys.all, harId],
    queryFn: () => api.get(`/har-files/${encodeURIComponent(harId)}`),
  });
  const [parsed, setParsed] = useState(() => openedHars.get(harId)?.parsed ?? null);
  const [loadError, setLoadError] = useState(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (parsed) return undefined;
    let cancelled = false;
    fetchBlob(harFileUrl(harId))
      .then((blob) => readHarFile(blob))
      .then((result) => {
        if (!cancelled) setParsed(result);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err);
      });
    return () => {
      cancelled = true;
    };
  }, [harId, parsed, attempt]);

  const item = meta.data?.data;
  const canDelete = item && user && (user.role === "ADMIN" || item.createdBy?.id === user.id);

  async function confirmDelete() {
    try {
      await remove.mutateAsync(harId);
      openedHars.delete(harId);
      toast.success("HAR file and its folder deleted.");
      navigate(HAR_READER_PATH);
    } catch {
      /* Shown in the dialog. */
    }
  }

  return (
    <>
      <Link to={HAR_READER_PATH} className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-indigo-700">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        HAR library
      </Link>
      {meta.isPending ? (
        <LoadingState label="Loading HAR file..." />
      ) : meta.isError ? (
        <ErrorState error={meta.error} onRetry={() => meta.refetch()} />
      ) : (
        <>
          <PageHeader
            title={item.name}
            description={`Saved ${new Date(item.createdAt).toLocaleString()}${item.createdBy ? ` by ${item.createdBy.name}` : ""} · cookies, tokens and passwords removed`}
            actions={
              canDelete && (
                <Button
                  variant="secondary"
                  icon={Trash2}
                  onClick={() => {
                    remove.reset();
                    setConfirming(true);
                  }}
                >
                  Delete folder
                </Button>
              )
            }
          />
          {loadError ? (
            <ErrorState
              error={loadError}
              onRetry={() => {
                setLoadError(null);
                setAttempt((value) => value + 1);
              }}
            />
          ) : parsed ? (
            <HarResult fileName={item.name} parsed={parsed} />
          ) : (
            <LoadingState label="Reading HAR file..." />
          )}
          {confirming && (
            <ConfirmDialog
              title="Delete this HAR file?"
              message={`${item.name} and its folder will be permanently deleted from storage.`}
              confirmLabel="Delete folder"
              isPending={remove.isPending}
              error={remove.error?.message}
              onConfirm={confirmDelete}
              onCancel={() => setConfirming(false)}
            />
          )}
        </>
      )}
    </>
  );
}
