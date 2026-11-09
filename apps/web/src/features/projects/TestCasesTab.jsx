import { ClipboardList, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { Button, IconButton } from "../../components/ui/Button.jsx";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog.jsx";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "../../components/ui/States.jsx";
import { useToast } from "../../components/ui/Toast.jsx";
import {
  useDeleteTestCase,
  useTestCases,
  useUpdateTestCaseStatus,
} from "./test-cases.hooks.js";
import { TestCaseFormModal } from "./TestCaseFormModal.jsx";

const STATUSES = ["Not Run", "Passed", "Failed", "Blocked"];

const STATUS_STYLES = {
  "Not Run": "bg-slate-100 text-slate-700",
  Passed: "bg-green-100 text-green-700",
  Failed: "bg-red-100 text-red-700",
  Blocked: "bg-amber-100 text-amber-700",
};

function formatDate(value) {
  if (!value) return "—";

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function TestCasesTab() {
  const { project } = useOutletContext();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const filters = {
    q: search.trim(),
    runStatus: statusFilter,
  };

  const { data, isPending, isError, error, refetch } = useTestCases(
    project.id,
    filters,
  );

  const deleteTestCase = useDeleteTestCase(project.id);
  const updateStatus = useUpdateTestCaseStatus(project.id);
  const toast = useToast();

  const items = data?.items ?? [];

  function openAdd() {
    setEditing(null);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditing(null);
  }

  async function handleStatusChange(testCase, runStatus) {
    try {
      await updateStatus.mutateAsync({
        id: testCase.id,
        runStatus,
      });

      toast.success(`${testCase.caseId} status updated.`);
    } catch (err) {
      toast.error(err.message || "Unable to update test case status.");
    }
  }

  async function confirmDelete() {
    try {
      await deleteTestCase.mutateAsync(deleting.id);
      toast.success("Test case deleted.");
      setDeleting(null);
    } catch {
      /* Error is displayed in the confirmation dialog. */
    }
  }

  return (
    <section>
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Test Cases</h2>
          <p className="text-sm text-slate-500">
            Review, manage, and execute your project's test cases.
          </p>
        </div>

        <Button icon={Plus} onClick={openAdd}>
          Add test case
        </Button>
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search test cases..."
          aria-label="Search test cases"
          className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-2 focus:outline-indigo-600"
        />

        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          aria-label="Filter by execution status"
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-2 focus:outline-indigo-600"
        >
          <option value="">All statuses</option>
          {STATUSES.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </div>

      {isPending ? (
        <LoadingState label="Loading test cases..." />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No test cases found"
          description={
            search || statusFilter
              ? "Try changing your search or status filter."
              : "Create your first test case or generate test cases using your project evidence."
          }
          action={
            !search && !statusFilter ? (
              <Button icon={Plus} onClick={openAdd}>
                Create test case
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">
              Test case list
            </h3>
            <span className="text-xs text-slate-500">
              {data?.total ?? items.length}{" "}
              {(data?.total ?? items.length) === 1 ? "test case" : "test cases"}
            </span>
          </div>

          <div className="space-y-3">
            {items.map((testCase) => (
              <article
                key={testCase.id}
                className="rounded-xl border border-slate-200 bg-white p-4"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold text-indigo-600">
                        {testCase.caseId}
                      </span>

                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          STATUS_STYLES[testCase.runStatus] ??
                          STATUS_STYLES["Not Run"]
                        }`}
                      >
                        {testCase.runStatus}
                      </span>
                    </div>

                    <h3 className="text-sm font-semibold text-slate-900">
                      {testCase.title}
                    </h3>

                    {testCase.description && (
                      <p className="mt-1 text-sm text-slate-600">
                        {testCase.description}
                      </p>
                    )}

                    <p className="mt-2 text-xs text-slate-400">
                      Updated {formatDate(testCase.updatedAt)}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <IconButton
                      icon={Pencil}
                      label={`Edit ${testCase.caseId}`}
                      onClick={() => {
                        setEditing(testCase);
                        setFormOpen(true);
                      }}
                    />

                    <IconButton
                      icon={Trash2}
                      label={`Delete ${testCase.caseId}`}
                      variant="ghost"
                      className="text-red-600 hover:bg-red-50 hover:text-red-700"
                      onClick={() => {
                        deleteTestCase.reset();
                        setDeleting(testCase);
                      }}
                    />
                  </div>
                </div>

                <div className="mt-4 flex flex-col gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:items-center sm:justify-between">
                  <details className="min-w-0 flex-1">
                    <summary className="cursor-pointer text-sm font-medium text-indigo-600 hover:text-indigo-700">
                      View test details
                    </summary>

                    <div className="mt-3 space-y-3 text-sm">
                      {testCase.precondition && (
                        <div>
                          <h4 className="font-semibold text-slate-700">
                            Precondition
                          </h4>
                          <p className="mt-1 whitespace-pre-wrap text-slate-600">
                            {testCase.precondition}
                          </p>
                        </div>
                      )}

                      <div>
                        <h4 className="font-semibold text-slate-700">
                          Test steps
                        </h4>
                        <pre className="mt-1 whitespace-pre-wrap font-sans text-slate-600">
                          {testCase.steps}
                        </pre>
                      </div>

                      {testCase.data && (
                        <div>
                          <h4 className="font-semibold text-slate-700">
                            Test data
                          </h4>
                          <p className="mt-1 whitespace-pre-wrap text-slate-600">
                            {testCase.data}
                          </p>
                        </div>
                      )}

                      <div>
                        <h4 className="font-semibold text-slate-700">
                          Expected result
                        </h4>
                        <p className="mt-1 whitespace-pre-wrap text-slate-600">
                          {testCase.expectedResult}
                        </p>
                      </div>
                    </div>
                  </details>

                  <label className="flex shrink-0 items-center gap-2 text-xs text-slate-500">
                    Execution status
                    <select
                      value={testCase.runStatus}
                      disabled={updateStatus.isPending}
                      onChange={(event) =>
                        handleStatusChange(testCase, event.target.value)
                      }
                      aria-label={`Execution status for ${testCase.caseId}`}
                      className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700 focus:outline-2 focus:outline-indigo-600 disabled:opacity-50"
                    >
                      {STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </article>
            ))}
          </div>
        </div>
      )}

      {formOpen && (
        <TestCaseFormModal
          projectId={project.id}
          testCase={editing ?? undefined}
          onClose={closeForm}
          onSaved={() => {
            toast.success(
              editing ? "Test case updated." : "Test case created.",
            );
            closeForm();
          }}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title="Delete test case?"
          message={`${deleting.caseId} — ${deleting.title} will be permanently removed from this project.`}
          confirmLabel="Delete test case"
          isPending={deleteTestCase.isPending}
          error={deleteTestCase.error?.message}
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </section>
  );
}
