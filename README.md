# AI QA Studio — Phase 3 Documentation

## Phase 3: Test Case Management and Execution Summary

**Status:** Complete  
**Verification:** 158 automated tests passed; production build successful  
**Frontend:** 40 tests passed across 5 test files  
**Backend:** 118 tests passed across 9 test files

---

## 1. Overview

Phase 3 adds a usable Test Case Management area to AI QA Studio. It allows users to review generated or manually created test cases, inspect their testing details, maintain execution statuses, search and filter the library, and monitor project-wide execution progress.

The phase focuses on managing test cases and tracking their execution state. It does not yet introduce formal execution runs, assignments, or execution history; those are candidates for Phase 4.

## 2. Features

### 2.1 Test Case Library

The Test Cases tab displays the test cases associated with the selected project. It serves as the central workspace for reviewing and maintaining the project's test cases.

### 2.2 Test Case Details

A test case can be expanded to inspect its detailed testing information:

- Case ID
- Title
- Description
- Preconditions
- Test steps
- Test data
- Expected result
- Execution status

This keeps the test case's key information accessible without requiring users to leave the library.

### 2.3 Create and Edit Test Cases

Users can create a test case manually and edit an existing test case through the test case form modal.

The form validates required fields before submission. Successful creation or updates refresh the displayed test-case data.

### 2.4 Execution Status Tracking

Each test case supports the following execution statuses:

| Status | Meaning |
|---|---|
| Not Run | The test case has not been executed yet. |
| Passed | Actual behavior met the expected result. |
| Failed | Actual behavior did not meet the expected result. |
| Blocked | Execution could not be completed because of a blocker. |

Users can update a test case's execution status from the library.

### 2.5 Search and Filtering

The library supports searching test cases and filtering by execution status. These controls help users focus on a subset of test cases.

The project-wide summary is intentionally independent of the active search query and status filter. Searching or filtering changes the visible list, not the overall project metrics.

### 2.6 Project-wide Execution Summary

The summary displays:

- Total test cases
- Passed test cases
- Failed test cases
- Blocked test cases
- Not Run test cases
- Overall execution progress

The counts are calculated from the complete, unfiltered test-case collection for the project.

## 3. Execution Progress Calculation

A test case is considered executed when its status is Passed, Failed, or Blocked.

```text
Completed = Passed + Failed + Blocked

Progress (%) = (Completed / Total Test Cases) * 100
```

The result is rounded to the nearest whole percentage.

Not Run cases are excluded from the completed count. Failed and Blocked cases still count as executed because an execution attempt has taken place.

If the project has no test cases, progress is displayed as 0% to avoid division by zero.

### Example

For a project with:

- 10 total test cases
- 4 Passed
- 1 Failed
- 1 Blocked
- 4 Not Run

The completed count is 6, and execution progress is 60%.

## 4. Typical User Workflow

1. Open AI QA Studio.
2. Select a project.
3. Navigate to the project's Test Cases tab.
4. Review the project-wide summary and execution progress.
5. Search for a test case or filter by status when needed.
6. Expand a test case and review its preconditions, steps, test data, and expected result.
7. Create or edit test cases when required.
8. Execute the test manually in the target application.
9. Update the test case status to Passed, Failed, or Blocked.
10. Return to the summary to review the updated project-wide progress.

**Important:** The status update records the execution state. Formal execution records, actual-result fields, evidence attachments per execution, and run history are outside the Phase 3 scope.

## 5. Application Behavior and UX

The Test Cases area includes the following user-facing states and safeguards:

- Loading state while test cases are being retrieved.
- Error state when test-case data cannot be loaded.
- Empty state when no test cases are available.
- Form validation for required fields.
- Confirmation dialog before deleting a test case.
- Toast feedback for user actions.
- Query refresh/invalidation after relevant create, edit, delete, or status-update operations.
- Project-wide summary sourced independently from the filtered list.

## 6. Implementation Notes

The Phase 3 frontend work is organized around these files:

| File | Responsibility |
|---|---|
| `apps/web/src/features/projects/TestCasesTab.jsx` | Test-case library UI, summary metrics, search/filter controls, and interactions. |
| `apps/web/src/features/projects/test-cases.hooks.js` | React Query hooks for retrieving and mutating test cases. |
| `apps/web/src/features/projects/TestCaseFormModal.jsx` | Create/edit test-case form modal. |
| `apps/web/src/features/projects/TestCasesTab.test.jsx` | Frontend tests for the Test Cases tab and its behavior. |
| `apps/server/src/modules/test-cases/test-cases.service.js` | Backend test-case service. |
| `apps/web/src/app/routes.jsx` | Frontend route registration. |

### Unfiltered summary data

The project-wide summary uses the unfiltered test-case query through `useAllTestCases(project.id)`. The visible library can use the filtered `useTestCases` query.

This separation prevents search and status filters from changing the summary counts or progress percentage.

## 7. Test Coverage

The Test Cases tab tests cover the following behaviors:

1. Displays project-wide execution summary counts and progress.
2. Keeps the project-wide summary unchanged when searching test cases.
3. Lists test cases.
4. Displays the empty state.
5. Expands test-case details.
6. Updates execution status.
7. Deletes a test case after confirmation.
8. Searches test cases.
9. Filters test cases by status.
10. Edits an existing test case.
11. Validates required fields when creating a test case.
12. Creates a test case successfully.

## 8. Verification Results

The following checks completed successfully:

| Verification | Result |
|---|---:|
| Frontend tests | 40 passed |
| Backend tests | 118 passed |
| Combined automated tests | 158 passed |
| Production build | Successful |

Production build output:

- Vite version: 6.4.5
- Modules transformed: 1,652
- JavaScript bundle: 263.72 kB (80.82 kB gzip)
- CSS bundle: 23.66 kB (5.33 kB gzip)

The build command was:

```cmd
npm.cmd run build
```

The combined test command was:

```cmd
npm.cmd test
```

The individual workspace test commands were:

```cmd
npm.cmd run test -w @aqs/web
npm.cmd run test -w @aqs/server
```

## 9. Phase 3 Completion Checklist

- [x] Test Case Library
- [x] Test Case Details
- [x] Create and edit test cases
- [x] Execution status tracking
- [x] Search test cases
- [x] Filter test cases by status
- [x] Project-wide execution summary
- [x] Execution progress calculation and display
- [x] Frontend tests pass
- [x] Backend tests pass
- [x] Production build succeeds

## 10. Suggested Phase 4 Scope

Phase 4 can build on Phase 3 by introducing formal test execution management:

- Create and manage execution runs.
- Add selected test cases to an execution run.
- Record actual results and execution notes.
- Attach evidence to individual execution results.
- View execution history and reports.

These are proposed next-phase items and are not included in the Phase 3 implementation.

---

**End of Phase 3 documentation**
