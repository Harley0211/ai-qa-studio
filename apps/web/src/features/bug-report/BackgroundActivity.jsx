import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Loader2, X } from "lucide-react";
import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useToast } from "../../components/ui/Toast.jsx";
import { bugReportHref } from "../tools/paths.js";
import { dismissTask, onTaskFinished, useBackgroundTasks } from "./backgroundTasks.js";
import { bugReportKeys } from "./hooks.js";

// Shown on every page: bug reports being prepared or written, and the ones
// that just finished, with a link to open them.
export function BackgroundActivity() {
  const tasks = useBackgroundTasks();
  const toast = useToast();
  const queryClient = useQueryClient();

  useEffect(
    () =>
      onTaskFinished((task) => {
        queryClient.invalidateQueries({ queryKey: bugReportKeys.all });
        if (task.phase === "done") toast.success(`Bug report ready: ${task.title ?? task.label}`);
        else toast.error(`Bug report failed: ${task.message}`);
      }),
    [queryClient, toast],
  );

  if (tasks.length === 0) return null;

  return (
    <aside
      aria-label="Background activity"
      className="fixed bottom-4 left-4 z-40 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2 lg:left-[17rem]"
    >
      {tasks.map((task) => {
        const working = task.phase !== "done" && task.phase !== "failed";
        return (
          <div key={task.id} className="live-glass rounded-xl border border-slate-200 px-3 py-2.5 shadow-lg">
            <div className="flex items-start gap-2">
              {working ? (
                <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-indigo-600" aria-hidden="true" />
              ) : task.phase === "done" ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
              ) : (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-slate-900">
                  Bug report · {task.projectName} · {task.title ?? task.label}
                </p>
                <p role="status" className="text-xs text-slate-600">
                  {task.message}
                </p>
                {task.warnings.map((warning) => (
                  <p key={warning} className="text-xs text-amber-700">
                    {warning}
                  </p>
                ))}
                {task.reportId && (
                  <Link to={bugReportHref(task.projectId, task.reportId)} className="text-xs font-semibold text-indigo-600 hover:underline">
                    Open report
                  </Link>
                )}
              </div>
              {!working && (
                <button
                  type="button"
                  onClick={() => dismissTask(task.id)}
                  aria-label="Dismiss"
                  className="rounded p-0.5 text-slate-500 hover:bg-slate-100"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              )}
            </div>
          </div>
        );
      })}
    </aside>
  );
}
