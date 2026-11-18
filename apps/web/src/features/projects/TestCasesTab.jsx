import { ClipboardList, Download, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { Button, IconButton } from "../../components/ui/Button.jsx";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog.jsx";
import { exportTestCasesToExcel } from "./test-cases.export.js";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "../../components/ui/States.jsx";
import { useToast } from "../../components/ui/Toast.jsx";
import {
  useAllTestCases,
  useBulkDeleteTestCases,
  useBulkUpdateTestCaseStatus,
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
  if (!value) return "â€”";

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
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkStatus, setBulkStatus] = useState("Passed");
  const bulkDelete = useBulkDeleteTestCases(project.id);
  const bulkUpdateStatus = useBulkUpdateTestCaseStatus(project.id);

  const filters = {
    q: search.trim(),
    runStatus: statusFilter,
  };

  const { data, isPending, isError, error, refetch } = useTestCases(
    project.id,
    filters,
  );
  const { data: allData } = useAllTestCases(project.id);

  const deleteTestCase = useDeleteTestCase(project.id);
  const updateStatus = useUpdateTestCaseStatus(project.id);
  const toast = useToast();
  function handleExport() {
    try {
      const selectedItems = selectedIds.size
        ? allItems.filter((item) => selectedIds.has(item.id))
        : allItems;

      exportTestCasesToExcel(selectedItems, project.name);

      toast.success(
        selectedIds.size
          ? `${selectedItems.length} selected test cases exported.`
          : "All test cases exported successfully.",
      );
    } catch (err) {
      toast.error(err.message || "Unable to export test cases.");
    }
  }
  function toggleSelection(id) {
    setSelectedIds((current) => {
      const next = new Set(current);

      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }

      return next;
    });
  }

  function toggleSelectAll() {
    const visibleIds = items.map((item) => item.id);
    const allVisibleSelected =
      visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));

    setSelectedIds((current) => {
      const next = new Set(current);

      if (allVisibleSelected) {
        visibleIds.forEach((id) => next.delete(id));
      } else {
        visibleIds.forEach((id) => next.add(id));
      }

      return next;
    });
  }

  async function handleBulkStatusUpdate() {
    try {
      await bulkUpdateStatus.mutateAsync({
        ids: [...selectedIds],
        runStatus: bulkStatus,
      });

      toast.success(`${selectedIds.size} test cases updated.`);
      setSelectedIds(new Set());
    } catch (err) {
      toast.error(err.message || "Unable to update selected test cases.");
    }
  }

  async function confirmBulkDelete() {
    try {
      await bulkDelete.mutateAsync([...selectedIds]);

      toast.success(`${selectedIds.size} test cases deleted.`);
      setSelectedIds(new Set());
      setBulkDeleting(false);
    } catch (err) {
      toast.error(err.message || "Unable to delete selected test cases.");
    }
  }
  const items = data?.items ?? [];
  const allItems = allData?.items ?? [];

  const totalCount = allItems.length;
  const passedCount = allItems.filter(
    (item) => item.runStatus === "Passed",
  ).length;
  const failedCount = allItems.filter(
    (item) => item.runStatus === "Failed",
  ).length;
  const blockedCount = allItems.filter(
    (item) => item.runStatus === "Blocked",
  ).length;
  const notRunCount = allItems.filter(
    (item) => item.runStatus === "Not Run",
  ).length;

  const completedCount = passedCount + failedCount + blockedCount;
  const progress = totalCount
    ? Math.round((completedCount / totalCount) * 100)
    : 0;

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

        <div className="flex flex-wrap items-center gap-2">
          <Button
            icon={Download}
            variant="secondary"
            onClick={handleExport}
            disabled={allItems.length === 0}
          >
            Export Excel
          </Button>

          <Button icon={Plus} onClick={openAdd}>
            Add test case
          </Button>
        </div>
      </div>
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {[
          { label: "Total", count: totalCount, color: "text-slate-900" },
          { label: "Passed", count: passedCount, color: "text-green-600" },
          { label: "Failed", count: failedCount, color: "text-red-600" },
          { label: "Blocked", count: blockedCount, color: "text-amber-600" },
          { label: "Not Run", count: notRunCount, color: "text-slate-600" },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-slate-200 bg-white p-4"
          >
            <p className="text-xs font-medium text-slate-500">{stat.label}</p>
            <p className={`mt-1 text-2xl font-semibold ${stat.color}`}>
              {stat.count}
            </p>
          </div>
        ))}
      </div>

      <div className="mb-5 rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-medium text-slate-700">
            Execution progress
          </span>
          <span className="text-sm font-semibold text-slate-900">
            {progress}%
          </span>
        </div>

        <div
          className="h-2 overflow-hidden rounded-full bg-slate-100"
          role="progressbar"
          aria-label="Test execution progress"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full rounded-full bg-indigo-600 transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>

        <p className="mt-2 text-xs text-slate-500">
          {completedCount} of {totalCount} test cases executed
        </p>
      </div>
      {selectedIds.size > 0 && (
        <div className="mb-4 flex flex-col gap-3 rounded-xl border border-indigo-200 bg-indigo-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-indigo-900">
              {selectedIds.size} selected
            </span>

            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="text-xs font-medium text-indigo-700 hover:underline"
            >
              Clear selection
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={bulkStatus}
              onChange={(event) => setBulkStatus(event.target.value)}
              aria-label="Bulk execution status"
              className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm"
            >
              {STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>

            <Button
              variant="secondary"
              onClick={handleBulkStatusUpdate}
              disabled={bulkUpdateStatus.isPending || bulkDelete.isPending}
            >
              {bulkUpdateStatus.isPending ? "Updating..." : "Set status"}
            </Button>

            <Button
              variant="danger"
              onClick={() => {
                bulkDelete.reset();
                setBulkDeleting(true);
              }}
              disabled={bulkUpdateStatus.isPending || bulkDelete.isPending}
            >
              <Trash2 size={16} />
              Delete selected
            </Button>
          </div>
        </div>
      )}
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
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={
                  items.length > 0 &&
                  items.every((item) => selectedIds.has(item.id))
                }
                onChange={toggleSelectAll}
                aria-label="Select all visible test cases"
                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600"
              />
              Select all visible
            </label>

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
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(testCase.id)}
                      onChange={() => toggleSelection(testCase.id)}
                      aria-label={`Select ${testCase.caseId}`}
                      className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600"
                    />

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

                      {Array.isArray(testCase.stepExpectedResults) &&
                      testCase.stepExpectedResults.length > 0 ? (
                        <div>
                          <h4 className="font-semibold text-slate-700">
                            Step-by-step expected results
                          </h4>
                          <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200">
                            <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                              <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-600">
                                <tr>
                                  <th className="w-[36%] border-b border-slate-200 px-3 py-2">Step</th>
                                  <th className="w-[22%] border-b border-slate-200 px-3 py-2">Data</th>
                                  <th className="border-b border-slate-200 px-3 py-2">Expected Result</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(Array.isArray(testCase.steps)
                                  ? testCase.steps
                                  : String(testCase.steps || "").split(/\r?\n/).filter(Boolean)
                                ).map((step, index) => (
                                  <tr key={index} className="align-top">
                                    <td className="border-b border-slate-100 px-3 py-3 whitespace-pre-wrap text-slate-700">
                                      {String(step).replace(/^\s*\d+[.)]\s*/, "")}
                                    </td>
                                    <td className="border-b border-slate-100 px-3 py-3 whitespace-pre-wrap text-slate-600">
                                      {testCase.data || ""}
                                    </td>
                                    <td className="border-b border-slate-100 px-3 py-3 whitespace-pre-wrap text-slate-700">
                                      {testCase.stepExpectedResults[index] || ""}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ) : (
                        <>
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
                        </>
                      )}
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
          message={`${deleting.caseId} â€” ${deleting.title} will be permanently removed from this project.`}
          confirmLabel="Delete test case"
          isPending={deleteTestCase.isPending}
          error={deleteTestCase.error?.message}
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
      {bulkDeleting && (
        <ConfirmDialog
          title="Delete selected test cases?"
          message={`You are about to permanently delete ${selectedIds.size} test cases. This action cannot be undone.`}
          confirmLabel="Delete selected"
          isPending={bulkDelete.isPending}
          error={bulkDelete.error?.message}
          onConfirm={confirmBulkDelete}
          onCancel={() => setBulkDeleting(false)}
        />
      )}
    </section>
  );
}




