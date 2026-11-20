# AI QA Studio

AI QA Studio is a local, single-user tool for QA work. It turns screenshots and
requirements documents (PRDs) into test cases with a local AI model, lets you
review them before they are saved, and then manage, run and export them per
project.

**Status (20 Nov 2026):** 253 automated tests pass (163 server, 90 web) and the
production build succeeds.

---

## 1. Features

### Projects
- Each project keeps its own application URLs, evidence images, documents and
  test cases.
- The **Projects** page shows totals (projects, test cases, URLs) and, per
  project, its URL, test case and image counts plus an **Image → test cases**
  shortcut.
- A project's **Overview** has three *Start generating* cards (from images, from
  a PRD, or write manually) and an execution summary.

### Generate test cases from screenshots
**Tools → From image evidence** (or *Open tool* on the Overview):

1. Upload PNG, JPG or WEBP screenshots (up to 5 MB each; the first 20 are used).
2. Choose the result format: **Overall expected result** (one per test case) or
   **Expected result per step**.
3. Optionally choose a focus: Functional, Negative, Boundary, Validation,
   UI / layout.
4. Generate. The local model takes a few minutes; the results then wait for
   review.

### Generate test cases from a PRD or document
**Tools → From PRD / document**, or the project's **Documents** tab:

1. Add a document: paste text, or upload a **.txt, .md or .pdf** file (up to
   10 MB; PDFs need selectable text).
2. The document is split into sections at its headings: Markdown headings
   (`## 3.2 Purchase flow`) or numbered headings (`3.2 Purchase flow`).
   Numbered steps such as `1. Click Login` stay inside their section.
3. Select up to 10 sections, a focus and a result format, then generate.
4. Each section is generated separately, so every test case is linked to the
   section it came from (shown as *From Add-ons PRD › 3.2 Purchase flow*).

### Review before saving
Generated test cases are **drafts**. Nothing reaches the library until it is
reviewed:

- The tool pages list every batch waiting for review. All cases start selected;
  untick the ones you don't want and click **Add N to library**, or **Discard
  all**.
- Test case IDs (`TC-0001`, …) are assigned only when cases are accepted, so
  discarded drafts leave no gaps.
- The Evidence and Test cases tabs show a banner while batches are waiting.

### Test case library
The project's **Test cases** tab:

- Each case shows its status, a **Per step / Overall** format chip and, for
  generated cases, the document section it came from.
- *View test details* shows the precondition and either the overall steps and
  expected result, or a **Step / Action / Expected result** table for per-step
  cases. Steps without an expected result are flagged.
- Create, edit and delete cases; set the execution status (Not Run, Passed,
  Failed, Blocked) one by one or in bulk; search and filter by status.
- **Export Excel** exports all or the selected cases.
- A project-wide summary and progress bar ignore the current search and filter
  (see [Execution progress](#6-execution-progress)).

### Other
- **Dark mode:** toggle in the sidebar (or the top bar on small screens). The
  choice is remembered; until then the app follows the operating system.
- **Failed runs never hang:** if n8n fails it reports the error and the run is
  marked failed within seconds. If n8n never answers, the run is marked failed
  after 30 minutes.

## 2. Architecture

| Part | Technology | Location |
|---|---|---|
| Web app | React 18, Vite, Tailwind CSS 4, TanStack Query | `apps/web` (port 5173) |
| API server | Express, Prisma (SQLite), zod, multer, unpdf | `apps/server` (port 4000) |
| Generation workflow | n8n | `n8n/ai-qa-studio-generation.workflow.json` (port 5678) |
| AI model | Ollama, `qwen3-vl:2b-instruct` | port 11434 |

How a generation run works:

```text
Web app ──POST /generations──▶ Server ──webhook──▶ n8n ──▶ Ollama
                                  ▲                  │
                                  │  POST /callback (test cases)  ─┐
                                  └──POST /failure  (error)    ◀──┘
```

- The server creates a run (`PENDING`) with a one-time callback token and calls
  the n8n webhook. Evidence images are passed as short-lived signed URLs.
- n8n asks Ollama for test cases, cleans up the answer (see
  [n8n/README.md](n8n/README.md)) and posts the cases back. The run becomes
  `SUCCEEDED` and its cases are stored as drafts for review.
- If a step fails, n8n posts to `/failure` and the run becomes `FAILED` with the
  reason. Runs whose token expires (30 minutes) are closed as failed by the
  server.

## 3. Setup

### Prerequisites
- Node.js 20.12 or later
- [n8n](https://n8n.io) running locally
- [Ollama](https://ollama.com) with the model: `ollama pull qwen3-vl:2b-instruct`

### Steps

1. **Install dependencies**

   ```cmd
   npm install
   ```

2. **Configure the server.** Copy `apps/server/.env.example` to
   `apps/server/.env` and fill in the two secrets. Generate each one with:

   ```cmd
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

3. **Create the database** (SQLite file `apps/server/prisma/dev.db`):

   ```cmd
   npm run db:migrate
   ```

4. **Set up n8n:** import the workflow, create its Header Auth credential with
   the same value as `N8N_REQUEST_SECRET`, and activate it. Step by step:
   [n8n/README.md](n8n/README.md).

5. **Start the app** (server and web together):

   ```cmd
   npm run dev
   ```

   Open http://127.0.0.1:5173.

**Windows note:** stop the dev server before `npm install` or
`npm run db:generate`. The running server locks Prisma's engine file, and
regeneration fails with `EPERM` otherwise.

### Commands

| Command | What it does |
|---|---|
| `npm run dev` | Starts the API server and the web app |
| `npm test` | Runs the server tests, then the web tests |
| `npm run test -w @aqs/server` / `-w @aqs/web` | Runs one workspace's tests |
| `npm run build` | Production build of the web app |
| `npm run db:migrate` | Applies database migrations (development) |
| `npm run db:generate` | Regenerates the Prisma client |
| `npm run db:studio` | Opens Prisma Studio to browse the database |

## 4. Limits

| What | Limit |
|---|---|
| Screenshot upload | 5 MB per image (`MAX_UPLOAD_MB`); first 20 images per run |
| Document upload | 10 MB; up to 200,000 characters of text |
| Pasted document | 60,000 characters |
| Sections per generation | 10 (each section is its own run) |
| Section text sent to the model | First 12,000 characters (longer sections are flagged) |
| Test cases per run | 100 |
| Waiting for n8n | 30 minutes, then the run is marked failed |

## 5. API overview

All routes are under `/api/projects/:projectId`.

| Method and path | Purpose |
|---|---|
| `GET /test-cases`, `POST /test-cases`, `PATCH`/`DELETE /test-cases/:id` | Test case library |
| `PATCH /test-cases/:id/status`, `PATCH /test-cases/bulk/status`, `DELETE /test-cases/bulk` | Execution status and bulk actions |
| `GET`/`POST /evidence`, `DELETE /evidence/:id` | Screenshots |
| `GET`/`POST /documents`, `POST /documents/upload`, `GET`/`DELETE /documents/:id` | Documents (paste or upload) |
| `POST /documents/:id/generations` | Generate from selected sections |
| `POST /generations` | Generate from screenshots |
| `GET /generations?review=pending` | Batches waiting for review |
| `GET /generations/:runId` | Run status, drafts and source |
| `POST /generations/:runId/accept`, `POST /generations/:runId/discard` | Review a batch |
| `POST /generations/:runId/callback`, `POST /generations/:runId/failure` | Used by n8n (one-time Bearer token) |

## 6. Execution progress

A test case counts as executed when its status is Passed, Failed or Blocked.

```text
Completed    = Passed + Failed + Blocked
Progress (%) = round(Completed / Total * 100)      (0% when there are no cases)
```

Example: 10 cases with 4 Passed, 1 Failed, 1 Blocked and 4 Not Run gives
6 completed and 60% progress. The summary always uses the whole project, not
the filtered list.

## 7. Changelog

### UI/UX plan, Nov 2026
- **Per-step expected results:** format chip on every test case; per-step cases
  show a Step / Action / Expected result table and flag missing results;
  per-step cases can be edited without an overall expected result.
- **Dark mode** toggle.
- **Phase 1 (navigation and tools):** sidebar *Tools* section; Image → Test cases
  page with format cards and focus options; Projects page counts and shortcuts;
  Overview *Start generating* cards and execution summary.
- **Phase 2 (review before saving):** generated cases are drafts until accepted.
- **Phase 3 (documents and PRDs):** Documents tab, PRD → Test cases tool, section
  splitting, PDF upload, links from test cases back to their section.
- **Reliability:** n8n reports failures to the app; expired runs are closed; the
  n8n parser skips malformed cases, drops repeated titles and recovers results
  from cut-off answers.
- **Fixes:** status updates now return per-step results as a list; a corrupted
  row no longer breaks the test case list; duplicated bulk-status route and
  service code removed; broken dash character in the delete dialog; neutral
  "file too large" message.
- **Database migrations:** `add_generation_drafts`, `add_documents`.

### Earlier
- Test case management: library, details, create/edit, execution status,
  search and filter, project-wide execution summary.
- Projects, application URLs, evidence upload, n8n generation, Excel export.

## 8. Tests

| Suite | Files | Tests |
|---|---:|---:|
| Server (`apps/server/tests`) | 11 | 163 |
| Web (`apps/web/src/**/*.test.*`) | 13 | 90 |

Server tests run against a separate SQLite database (`test.db`) that is rebuilt
on every run; n8n is mocked. Web tests mock the API with `mockApi` from
`apps/web/src/test/utils.jsx`.

## 9. Known limitations and next steps

- **Documents:** scanned PDFs (no selectable text) and Word files are not
  supported. PDFs whose headings are only bold text, without numbers, become a
  single section.
- **Model quality:** the small local model sometimes repeats itself or ignores
  the requested number of cases. Exact repeats are removed; cases that say the
  same thing with different titles must be unticked in review.
- **Per-step results** can't be edited in the test case form yet.
- **Not built yet:** AI chat for refining results (plan Phase 4), login and
  accounts (plan Phase 5), and recent activity on the Overview.
- **n8n** shows runs whose failure was reported to the app as successful
  executions in its own list; the app shows the real outcome.
- **Dependencies:** `npm audit` reports issues in existing packages (vitest,
  xlsx, prisma, zod, react-router); several fixes are breaking upgrades.

## 10. Security

- The server only listens on `127.0.0.1` and refuses to start otherwise.
- n8n listens on all network interfaces by default. To keep it local, set
  `N8N_LISTEN_ADDRESS=127.0.0.1` in n8n's environment.
- Secrets live only in `apps/server/.env` (git-ignored) and in the n8n
  credential. If a secret is ever exposed, generate a new one and update both.
